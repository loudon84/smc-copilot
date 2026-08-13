"""v2.4.1 regression suite — documents production gaps then locks correct behavior."""

from __future__ import annotations

import pytest
from conftest import operator_token

from core.auth import Scope, mint_lab_jwt
from services.invocation import build_invocation
from services.job_service import JobService
from services.ring0_service import Ring0Orchestrator


@pytest.mark.asyncio
async def test_cannot_advance_before_batch_started(repos):
    orch = Ring0Orchestrator(repos, JobService(repos))
    targets = [{"endpoint_id": f"ep_{i}", "minion_id": f"ep_{i}"} for i in range(1, 6)]
    record = await orch.create_ring0(
        component="hermes",
        version="0.24.1",
        targets=targets,
        actor_id="ops",
        request_id="adv-before-start",
        release_id="rel",
        config_revision="cfg",
    )
    record.state = "approved"
    record.thresholds_json["observationHoursPerBatch"] = 0
    await repos.rollouts.update(record)
    with pytest.raises(Exception):
        await orch.advance_batch(record.id)


@pytest.mark.asyncio
async def test_cannot_advance_while_jobs_pending(repos):
    orch = Ring0Orchestrator(repos, JobService(repos))
    targets = [{"endpoint_id": f"ep_{i}", "minion_id": f"ep_{i}"} for i in range(1, 6)]
    record = await orch.create_ring0(
        component="hermes",
        version="0.24.1",
        targets=targets,
        actor_id="ops",
        request_id="adv-pending",
        release_id="rel",
        config_revision="cfg",
    )
    record.state = "approved"
    record.thresholds_json["observationHoursPerBatch"] = 0
    await repos.rollouts.update(record)
    await orch.start_batch(record.id, actor_id="ops")
    with pytest.raises(Exception):
        await orch.advance_batch(record.id)


@pytest.mark.asyncio
async def test_cannot_complete_without_batch3_dispatch(repos):
    orch = Ring0Orchestrator(repos, JobService(repos))
    targets = [{"endpoint_id": f"ep_{i}", "minion_id": f"ep_{i}"} for i in range(1, 6)]
    record = await orch.create_ring0(
        component="hermes",
        version="0.24.1",
        targets=targets,
        actor_id="ops",
        request_id="skip-batch3",
        release_id="rel",
        config_revision="cfg",
    )
    record.state = "batch_observing"
    record.thresholds_json["observationHoursPerBatch"] = 0
    record.thresholds_json["observationDaysFinal"] = 7
    # Illegally claim batch 2 finished without batch 3 jobs.
    record.thresholds_json["currentBatch"] = 2
    record.batch_index = 2
    record.thresholds_json["batchStarted"] = True
    record.thresholds_json["batchStartedAt"] = "2020-01-01T00:00:00+00:00"
    await repos.rollouts.update(record)
    # Without batch jobs, advance must fail — never jump to completed.
    with pytest.raises(Exception):
        await orch.advance_batch(record.id)
    refreshed = await repos.rollouts.get(record.id)
    assert refreshed is not None
    assert refreshed.state != "completed"


def test_gateway_lifecycle_invocation_contract():
    start = build_invocation("start")
    stop = build_invocation("stop")
    restart = build_invocation("restart")
    assert start.function == "smc_hermes.gateway_start"
    assert stop.function == "smc_hermes.gateway_stop"
    assert restart.function == "smc_hermes.restart"
    # Module contract is covered by infra/salt loader tests; keep control-plane mapping strict here.
    assert start.kwarg == {}
    assert stop.kwarg == {}


@pytest.mark.asyncio
async def test_approval_role_cannot_be_self_reported(client, settings, repos):
    targets = [{"endpointId": f"ep_{i}", "minionId": f"ep_{i}"} for i in range(1, 6)]
    create = client.post(
        "/salt/v1/ring0/rollouts",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json={
            "component": "hermes",
            "version": "0.24.1",
            "requestId": "role-forge",
            "releaseId": "rel",
            "configRevision": "cfg",
            "targets": targets,
        },
    )
    assert create.status_code == 200
    rid = create.json()["rolloutId"]
    # Subject without role claim tries to self-report release_owner.
    token = mint_lab_jwt(subject="forger", scopes=[Scope.ROLLOUT_ADMIN], settings=settings)
    resp = client.post(
        f"/salt/v1/ring0/rollouts/{rid}:approve",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "release_owner", "decision": "approve"},
    )
    assert resp.status_code in {400, 403}


@pytest.mark.asyncio
async def test_return_identity_mismatch_does_not_complete_job(repos):
    from datetime import UTC, datetime

    from db.repositories.interfaces import ControlJobRecord
    from schemas.job_return import JobReturnBatchRequest, JobReturnItem
    from services.return_service import ReturnService

    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_id_mismatch",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="running",
            idempotency_key="idem-mismatch",
            requested_by="ops",
            claim_token="tok",
            salt_jid="jid-mismatch",
            expected_function="smc_hermes.health",
            accepted_at=datetime.now(UTC),
        )
    )
    svc = ReturnService(repos)
    await svc.batch_upsert(
        JobReturnBatchRequest(
            request_id="ret-mismatch",
            items=[
                JobReturnItem(
                    jid="jid-mismatch",
                    endpoint_id="ep_OTHER",
                    function="smc_hermes.doctor",
                    success=True,
                    payload_redacted={"ok": True},
                )
            ],
        )
    )
    updated = await repos.control_jobs.get(job.id)
    assert updated is not None
    assert updated.status == "running"


@pytest.mark.asyncio
async def test_final_observing_not_completed_without_seven_days(repos):
    orch = Ring0Orchestrator(repos, JobService(repos))
    targets = [{"endpoint_id": f"ep_{i}", "minion_id": f"ep_{i}"} for i in range(1, 6)]
    record = await orch.create_ring0(
        component="hermes",
        version="0.24.1",
        targets=targets,
        actor_id="ops",
        request_id="seven-day",
        release_id="rel",
        config_revision="cfg",
    )
    record.state = "final_observing"
    record.thresholds_json["currentBatch"] = 3
    record.thresholds_json["observationDaysFinal"] = 7
    await repos.rollouts.update(record)
    with pytest.raises(Exception):
        await orch.complete_signoff(record.id, actor_id="ops", roles_ready=False)
