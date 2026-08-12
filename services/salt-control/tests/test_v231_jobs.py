from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from conftest import operator_token

from db.repositories.interfaces import ControlJobRecord, RolloutRecord
from services.job_service import JobService
from services.secret_service import SecretService
from workers.job_worker import JobWorker
from workers.observer import ControlPlaneObserver


@pytest.mark.asyncio
async def test_job_claim_atomic_single_owner(repos, masters):
    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_claim_1",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="queued",
            idempotency_key="idem-claim-1",
            requested_by="ops",
            accepted_at=datetime.now(UTC),
        )
    )
    masters[0].accepted[job.minion_id] = "fp"

    async def claim(worker_id: str):
        return await repos.control_jobs.claim_next(
            worker_id=worker_id,
            lease_seconds=30,
            now=datetime.now(UTC),
        )

    first, second = await asyncio.gather(claim("w1"), claim("w2"))
    winners = [j for j in (first, second) if j is not None]
    assert len(winners) == 1
    assert winners[0].lease_owner in {"w1", "w2"}
    assert winners[0].claim_token


@pytest.mark.asyncio
async def test_job_reclaim_after_lease_expiry(repos):
    now = datetime.now(UTC)
    await repos.control_jobs.create(
        ControlJobRecord(
            id="job_reclaim_1",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="running",
            idempotency_key="idem-reclaim-1",
            requested_by="ops",
            claim_token="old",
            lease_owner="dead-worker",
            lease_expires_at=now - timedelta(seconds=5),
            accepted_at=now,
        )
    )
    claimed = await repos.control_jobs.reclaim_expired(
        worker_id="w-new",
        lease_seconds=30,
        now=now,
    )
    assert claimed is not None
    assert claimed.lease_owner == "w-new"
    assert claimed.claim_token != "old"
    assert claimed.attempt == 1


@pytest.mark.asyncio
async def test_redis_wake_and_db_poll_same_claim(repos, masters):
    """Wake + poll converge on claim_next — only one Salt publish."""
    masters[0].accepted["ep_wake"] = "fp"
    await repos.control_jobs.create(
        ControlJobRecord(
            id="job_wake_1",
            endpoint_id="ep_wake",
            minion_id="ep_wake",
            operation="health",
            status="queued",
            idempotency_key="idem-wake-1",
            requested_by="ops",
            accepted_at=datetime.now(UTC),
        )
    )
    w1 = JobWorker(masters=masters, repos=repos, worker_id="w1", poll_interval=0.01)
    w2 = JobWorker(masters=masters, repos=repos, worker_id="w2", poll_interval=0.01)
    await asyncio.gather(w1.tick(), w2.tick())
    job = await repos.control_jobs.get("job_wake_1")
    assert job is not None
    assert job.status == "succeeded"
    assert job.attempt == 1


@pytest.mark.asyncio
async def test_salt_jid_conflict_does_not_mutate_owner(repos):
    now = datetime.now(UTC)
    owner = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_owner",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="running",
            idempotency_key="idem-owner",
            requested_by="ops",
            claim_token="tok-owner",
            salt_jid="jid-shared",
            accepted_at=now,
        )
    )
    challenger = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_challenger",
            endpoint_id="ep_2",
            minion_id="ep_2",
            operation="health",
            status="dispatching",
            idempotency_key="idem-challenger",
            requested_by="ops",
            claim_token="tok-challenger",
            accepted_at=now,
        )
    )
    conflict, assigned = await repos.control_jobs.set_salt_jid(
        challenger.id,
        claim_token="tok-challenger",
        salt_jid="jid-shared",
        now=now,
    )
    assert assigned is False
    assert conflict.id == owner.id
    refreshed = await repos.control_jobs.get(owner.id)
    assert refreshed is not None
    assert refreshed.salt_jid == "jid-shared"
    assert refreshed.status == "running"

    service = JobService(repos)
    response = await service.fail_jid_conflict(challenger, conflict)
    assert response.error_code == "salt_jid_conflict"
    assert response.conflict_job_id == owner.id
    failed = await repos.control_jobs.get(challenger.id)
    assert failed is not None
    assert failed.status == "failed"
    assert failed.error_code == "salt_jid_conflict"


@pytest.mark.asyncio
async def test_secret_scope_idempotent_upsert(repos, secret_provider):
    service = SecretService(repos, secret_provider)
    for _ in range(3):
        await service.upsert_scope(
            tenant_id="t1",
            endpoint_id="ep_1",
            scope_type="user_ref",
            scope_key="smc://providers/dashscope",
            secret_ref="smc://providers/dashscope",
            version="1",
            checksum_redacted="abcd",
        )
    scopes = await repos.secret_scopes.list_for_endpoint("ep_1")
    assert len(scopes) == 1
    assert scopes[0].secret_ref == "smc://providers/dashscope"
    assert "value" not in scopes[0].__dict__ or getattr(scopes[0], "value", None) is None


@pytest.mark.asyncio
async def test_job_api_create_and_duplicate(client, settings):
    payload = {
        "endpointId": "ep_api_1",
        "minionId": "ep_api_1",
        "operation": "health",
        "idempotencyKey": "idem-api-1",
        "requestedBy": "ops",
        "correlationId": "corr-1",
        "configRevision": "r1",
        "releaseId": "rel-1",
    }
    first = client.post(
        "/salt/v1/jobs",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json=payload,
    )
    assert first.status_code == 200
    body = first.json()
    assert body["jobId"].startswith("job_")
    assert body["status"] == "queued"
    assert body["duplicate"] is False

    second = client.post(
        "/salt/v1/jobs",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json=payload,
    )
    assert second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["jobId"] == body["jobId"]


@pytest.mark.asyncio
async def test_handover_rollback_remigrate_orchestration(client, settings, app_state, masters):
    masters[0].accepted["ep_mig"] = "fp"
    headers = {"Authorization": f"Bearer {operator_token(settings)}"}

    handover = await app_state.handover_service.handover(
        endpoint_id="ep_mig",
        minion_id="ep_mig",
        idempotency_key="idem-handover-1",
        requested_by="ops",
        release_id="rel-1",
        config_revision="cfg-1",
        correlation_id="corr-mig",
    )
    assert handover.operation == "handover"
    await app_state.job_worker.tick()
    got = client.get(f"/salt/v1/jobs/{handover.job_id}", headers=headers)
    assert got.json()["status"] == "succeeded"

    rollback = await app_state.handover_service.rollback(
        endpoint_id="ep_mig",
        minion_id="ep_mig",
        idempotency_key="idem-rollback-1",
        requested_by="ops",
    )
    await app_state.job_worker.tick()
    assert (await app_state.repos.control_jobs.get(rollback.job_id)).status == "succeeded"

    remigrate = await app_state.handover_service.remigrate(
        endpoint_id="ep_mig",
        minion_id="ep_mig",
        idempotency_key="idem-remigrate-1",
        requested_by="ops",
    )
    await app_state.job_worker.tick()
    assert (await app_state.repos.control_jobs.get(remigrate.job_id)).status == "succeeded"

    # Remigrate with same idempotency key is duplicate
    again = await app_state.handover_service.remigrate(
        endpoint_id="ep_mig",
        minion_id="ep_mig",
        idempotency_key="idem-remigrate-1",
        requested_by="ops",
    )
    assert again.duplicate is True


@pytest.mark.asyncio
async def test_observer_pauses_rollout_when_master_unavailable(repos, masters):
    record = RolloutRecord(
        id="ro_obs_1",
        component="hermes",
        version="1",
        ring="ring0",
        state="running",
        thresholds_json={},
        created_by="ops",
    )
    await repos.rollouts.create(record)
    repos.extras["active_rollouts"] = [record]

    class DownMaster:
        name = "down"

        async def ready(self) -> bool:
            return False

    observer = ControlPlaneObserver(
        masters=[DownMaster()],  # type: ignore[list-item]
        repos=repos,
        interval_seconds=1,
        master_unavailable_threshold=1,
    )
    await observer.tick()
    updated = await repos.rollouts.get("ro_obs_1")
    assert updated is not None
    assert updated.state == "paused"
    assert observer.metrics["rollout_pause_master_unavailable_total"] >= 1


@pytest.mark.asyncio
async def test_endpoint_status_aggregation(client, settings, repos):
    now = datetime.now(UTC)
    await repos.control_jobs.create(
        ControlJobRecord(
            id="job_status_1",
            endpoint_id="ep_status",
            minion_id="ep_status",
            operation="handover",
            status="succeeded",
            idempotency_key="idem-status",
            requested_by="ops",
            release_id="rel-9",
            config_revision="cfg-9",
            accepted_at=now,
            completed_at=now,
        )
    )
    resp = client.get(
        "/salt/v1/endpoints/ep_status/status",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["endpointId"] == "ep_status"
    assert body["lastJob"]["jobId"] == "job_status_1"
    assert body["migrationPhase"] == "handover_completed"
    assert body["currentRelease"] == "rel-9"
