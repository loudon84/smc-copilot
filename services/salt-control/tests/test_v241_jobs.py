"""v2.4.1 Job / Returner / Reconciler contract tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from db.repositories.interfaces import ControlJobRecord
from integrations.salt_master import FakeSaltMaster
from schemas.job_return import JobReturnBatchRequest, JobReturnItem
from services.invocation import OPERATION_FUNCTIONS, function_for_operation
from services.return_service import ReturnService
from workers.job_worker import JobWorker
from workers.result_reconciler import ResultReconciler


def test_every_operation_has_strict_function_mapping():
    expected = {
        "install": "smc_hermes.install",
        "upgrade": "smc_hermes.upgrade",
        "configure": "smc_hermes.apply_config",
        "start": "smc_hermes.gateway_start",
        "stop": "smc_hermes.gateway_stop",
        "restart": "smc_hermes.restart",
        "health": "smc_hermes.health",
        "diagnose": "smc_hermes.doctor",
        "rollback": "smc_handover.rollback",
        "handover": "smc_handover.migrate",
        "remigrate": "smc_handover.remigrate",
    }
    assert OPERATION_FUNCTIONS == expected
    for operation, function in expected.items():
        assert function_for_operation(operation) == function


@pytest.mark.asyncio
async def test_existing_jid_is_not_republished(repos):
    master = FakeSaltMaster(name="salt-a")
    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_jid",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="running",
            idempotency_key="idem-jid",
            requested_by="ops",
            claim_token="tok",
            salt_jid="already-1",
            expected_function="smc_hermes.health",
            accepted_at=datetime.now(UTC),
        )
    )
    master.jobs["already-1"] = {"return": {"ep_1": {"ok": True}}}
    worker = JobWorker(masters=[master], repos=repos, poll_interval=0.01)
    await worker._dispatch(job)
    assert list(master.jobs.keys()) == ["already-1"]


@pytest.mark.asyncio
async def test_poll_timeout_marks_result_pending(repos):
    master = FakeSaltMaster(name="salt-a")
    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_pend",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="running",
            idempotency_key="idem-pend",
            requested_by="ops",
            claim_token="tok",
            salt_jid="pending-1",
            expected_function="smc_hermes.health",
            accepted_at=datetime.now(UTC),
        )
    )
    worker = JobWorker(masters=[master], repos=repos, heartbeat_interval=0.01, poll_interval=0.01)
    await worker._wait_with_heartbeat(master, job, "pending-1", 0.05)
    updated = await repos.control_jobs.get(job.id)
    assert updated is not None
    assert updated.status == "result_pending"


@pytest.mark.asyncio
async def test_reconciler_expires_after_ttl(repos):
    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_exp",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="result_pending",
            idempotency_key="idem-exp",
            requested_by="ops",
            claim_token="tok",
            salt_jid="jid-exp",
            expected_function="smc_hermes.health",
            accepted_at=datetime.now(UTC) - timedelta(hours=2),
            reconcile_ttl_seconds=1,
        )
    )
    rec = ResultReconciler(masters=[FakeSaltMaster(name="salt-a")], repos=repos)
    await rec.tick()
    updated = await repos.control_jobs.get(job.id)
    assert updated is not None
    assert updated.status == "expired"
    assert updated.error_code == "reconcile_ttl_expired"


@pytest.mark.asyncio
async def test_late_return_does_not_override_terminal(repos):
    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_term",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="succeeded",
            idempotency_key="idem-term",
            requested_by="ops",
            claim_token="tok",
            salt_jid="jid-term",
            expected_function="smc_hermes.health",
            accepted_at=datetime.now(UTC),
        )
    )
    svc = ReturnService(repos)
    await svc.batch_upsert(
        JobReturnBatchRequest(
            request_id="late",
            items=[
                JobReturnItem(
                    jid="jid-term",
                    endpoint_id="ep_1",
                    function="smc_hermes.health",
                    success=False,
                    payload_redacted={"ok": False},
                )
            ],
        )
    )
    updated = await repos.control_jobs.get(job.id)
    assert updated is not None
    assert updated.status == "succeeded"


@pytest.mark.asyncio
async def test_dual_reconciler_single_terminal(repos):
    master = FakeSaltMaster(name="salt-a")
    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_dual",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="result_pending",
            idempotency_key="idem-dual",
            requested_by="ops",
            claim_token="tok",
            salt_jid="jid-dual",
            expected_function="smc_hermes.health",
            accepted_at=datetime.now(UTC),
        )
    )
    master.jobs["jid-dual"] = {"return": {"ep_1": {"ok": True}}}
    a = ResultReconciler(masters=[master], repos=repos, worker_id="a")
    b = ResultReconciler(masters=[master], repos=repos, worker_id="b")
    await a.tick()
    await b.tick()
    updated = await repos.control_jobs.get(job.id)
    assert updated is not None
    assert updated.status == "succeeded"
    assert updated.result_source == "reconciler"
