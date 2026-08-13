"""v2.4.1 schema: unique constraints, optimistic lock, alembic cycle."""

from __future__ import annotations

from dataclasses import replace

import pytest

from core.errors import SaltControlError
from db.repositories.interfaces import RolloutRecord, RolloutTargetJobRecord
from services.job_service import JobService
from services.ring0_service import Ring0Orchestrator


def _targets() -> list[dict[str, str]]:
    return [{"endpoint_id": f"ep_{i}", "minion_id": f"ep_{i}"} for i in range(1, 6)]


@pytest.mark.asyncio
async def test_target_job_unique_allows_verify_and_retry(repos):
    orch = Ring0Orchestrator(repos, JobService(repos))
    record = await orch.create_ring0(
        component="hermes",
        version="0.24.1",
        targets=_targets(),
        actor_id="ops",
        request_id="uq-1",
        release_id="rel",
        config_revision="cfg",
    )
    first = await repos.rollout_target_jobs.upsert(
        RolloutTargetJobRecord(
            rollout_id=record.id,
            endpoint_id="ep_1",
            batch_index=0,
            job_id="job_h1",
            state="dispatched",
            operation="handover",
            attempt=1,
        )
    )
    verify = await repos.rollout_target_jobs.upsert(
        RolloutTargetJobRecord(
            rollout_id=record.id,
            endpoint_id="ep_1",
            batch_index=0,
            job_id="job_v1",
            state="dispatched",
            operation="verify",
            attempt=1,
        )
    )
    retry = await repos.rollout_target_jobs.upsert(
        RolloutTargetJobRecord(
            rollout_id=record.id,
            endpoint_id="ep_1",
            batch_index=0,
            job_id="job_h2",
            state="dispatched",
            operation="handover",
            attempt=2,
        )
    )
    again = await repos.rollout_target_jobs.upsert(
        RolloutTargetJobRecord(
            rollout_id=record.id,
            endpoint_id="ep_1",
            batch_index=0,
            job_id="job_h1b",
            state="succeeded",
            operation="handover",
            attempt=1,
        )
    )
    assert first.id != verify.id
    assert first.id != retry.id
    assert again.id == first.id
    assert again.state == "succeeded"
    listed = await repos.rollout_target_jobs.list_for_rollout(record.id, batch_index=0)
    assert len(listed) == 3


@pytest.mark.asyncio
async def test_dual_instance_optimistic_lock_conflict(repos):
    record = RolloutRecord(
        id="ro_lock",
        component="hermes",
        version="1",
        ring="ring0",
        state="approved",
        thresholds_json={},
        created_by="ops",
        state_version=0,
    )
    await repos.rollouts.create(record)
    a = await repos.rollouts.get("ro_lock")
    assert a is not None
    b = replace(a, state="paused")
    a.state = "batch_running"
    await repos.rollouts.update(a, expected_version=0)
    with pytest.raises(SaltControlError) as exc:
        await repos.rollouts.update(b, expected_version=0)
    assert exc.value.status_code == 409
    latest = await repos.rollouts.get("ro_lock")
    assert latest is not None
    assert latest.state == "batch_running"
    assert latest.state_version == 1


@pytest.mark.integration
def test_alembic_unique_and_cycle_against_postgres():
    import os

    from alembic import command
    from alembic.config import Config

    url = os.environ.get("DATABASE_URL", "")
    if not url.startswith("postgresql"):
        pytest.skip("DATABASE_URL postgresql required")
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "20260812_v24_job_payload")
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
