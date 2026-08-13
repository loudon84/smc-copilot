from __future__ import annotations

import pytest
from conftest import operator_token

from core.auth import Scope, mint_lab_jwt
from services.invocation import function_for_operation
from services.ring0_service import Ring0Orchestrator


def test_invocation_mapping():
    assert function_for_operation("start") == "smc_hermes.gateway_start"
    assert function_for_operation("stop") == "smc_hermes.gateway_stop"
    assert function_for_operation("restart") == "smc_hermes.restart"
    assert function_for_operation("configure") == "smc_hermes.apply_config"
    assert function_for_operation("upgrade") == "smc_hermes.upgrade"
    assert function_for_operation("handover") == "smc_handover.migrate"
    assert function_for_operation("remigrate") == "smc_handover.remigrate"
    assert function_for_operation("rollback") == "smc_handover.rollback"


@pytest.mark.asyncio
async def test_ring0_rejects_system_and_mismatched_identity(repos):
    from datetime import UTC, datetime

    from db.repositories.interfaces import BindingRecord
    from services.job_service import JobService
    from services.ring0_service import Ring0Orchestrator

    await repos.bindings.upsert(
        BindingRecord(
            endpoint_id="ep_1",
            user_id="u1",
            windows_account="SYSTEM",
            windows_sid="S-1-5-18",
            profile_dir=r"C:\Windows",
            active=True,
            revision="b1",
            bound_at=datetime.now(UTC),
        )
    )
    orch = Ring0Orchestrator(repos, JobService(repos))
    with pytest.raises(Exception):
        await orch.create_ring0(
            component="hermes",
            version="1",
            targets=[{"endpoint_id": f"ep_{i}", "minion_id": f"ep_{i}"} for i in range(1, 6)],
            actor_id="ops",
            request_id="sys-bind",
            release_id="rel",
            config_revision="cfg",
        )


@pytest.mark.asyncio
async def test_ring0_requires_five_targets(repos):
    from services.job_service import JobService

    orch = Ring0Orchestrator(repos, JobService(repos))
    with pytest.raises(Exception):
        await orch.create_ring0(
            component="hermes",
            version="1",
            targets=[{"endpoint_id": "ep_1"}],
            actor_id="ops",
            request_id="r1",
            release_id="rel",
            config_revision="cfg",
        )


async def _seed_ring0_bindings(repos) -> None:
    from datetime import UTC, datetime

    from db.repositories.interfaces import BindingRecord

    for i in range(1, 6):
        await repos.bindings.upsert(
            BindingRecord(
                endpoint_id=f"ep_{i}",
                user_id=f"u{i}",
                windows_account=rf"DOMAIN\user{i}",
                windows_sid=f"S-1-5-21-{i}",
                profile_dir=rf"C:\Users\user{i}",
                active=True,
                revision=f"b{i}",
                bound_at=datetime.now(UTC),
            )
        )


@pytest.mark.asyncio
async def test_ring0_triple_approval_and_batches(client, settings, repos):
    await _seed_ring0_bindings(repos)
    targets = [{"endpointId": f"ep_{i}", "minionId": f"ep_{i}", "bindingRevision": f"b{i}"} for i in range(1, 6)]
    create = client.post(
        "/salt/v1/ring0/rollouts",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json={
            "component": "hermes",
            "version": "0.24.0",
            "requestId": "ring0-1",
            "releaseId": "rel-24",
            "configRevision": "cfg-24",
            "targets": targets,
        },
    )
    assert create.status_code == 200
    rid = create.json()["rolloutId"]
    assert create.json()["state"] == "waiting_approval"

    # Lab/test: skip 24h batch observation gate.
    record = await repos.rollouts.get(rid)
    assert record is not None
    record.thresholds_json["observationHoursPerBatch"] = 0
    await repos.rollouts.update(record)

    subjects = [
        ("release_owner", "alice"),
        ("platform_owner", "bob"),
        ("security_owner", "carol"),
    ]
    for role, subject in subjects:
        token = mint_lab_jwt(
            subject=subject,
            scopes=[Scope.ROLLOUT_ADMIN],
            settings=settings,
            extra={"salt_roles": [role]},
        )
        resp = client.post(
            f"/salt/v1/ring0/rollouts/{rid}:approve",
            headers={"Authorization": f"Bearer {token}"},
            json={"decision": "approve"},
        )
        assert resp.status_code == 200, resp.text
    assert resp.json()["state"] == "approved"

    started = client.post(
        f"/salt/v1/ring0/rollouts/{rid}:start-batch",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
    )
    assert started.status_code == 200
    assert len(started.json()["jobIds"]) == 1

    for job_id in started.json()["jobIds"]:
        job = await repos.control_jobs.get(job_id)
        assert job is not None
        job.status = "succeeded"
        await repos.control_jobs.update(job)
    for target in await repos.rollouts.list_targets(rid):
        if target.endpoint_id == "ep_1":
            target.state = "observing_passed"

    advanced = client.post(
        f"/salt/v1/ring0/rollouts/{rid}:advance-batch",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
    )
    assert advanced.status_code == 200, advanced.text


@pytest.mark.asyncio
async def test_returner_updates_control_job(repos):
    from datetime import UTC, datetime

    from db.repositories.interfaces import ControlJobRecord
    from schemas.job_return import JobReturnBatchRequest, JobReturnItem
    from services.return_service import ReturnService

    job = await repos.control_jobs.create(
        ControlJobRecord(
            id="job_ret_1",
            endpoint_id="ep_1",
            minion_id="ep_1",
            operation="health",
            status="running",
            idempotency_key="idem-ret",
            requested_by="ops",
            claim_token="tok",
            salt_jid="jid-ret-1",
            expected_function="smc_hermes.health",
            accepted_at=datetime.now(UTC),
        )
    )
    svc = ReturnService(repos)
    await svc.batch_upsert(
        JobReturnBatchRequest(
            request_id="rr1",
            items=[
                JobReturnItem(
                    jid="jid-ret-1",
                    endpoint_id="ep_1",
                    function="smc_hermes.health",
                    success=True,
                    payload_redacted={"ok": True},
                )
            ],
        )
    )
    updated = await repos.control_jobs.get(job.id)
    assert updated is not None
    assert updated.status == "succeeded"


@pytest.mark.asyncio
async def test_idempotency_conflict_on_digest(repos):
    from core.errors import SaltControlError
    from schemas.rollout import RolloutCreateRequest
    from services.rollout_service import RolloutService

    svc = RolloutService(repos)
    body = RolloutCreateRequest(
        component="hermes",
        version="1",
        ring="ring0",
        request_id="idem-1",
        thresholds={},
    )
    first = await svc.create(body, actor_id="ops")
    again = await svc.create(body, actor_id="ops")
    assert again.rollout_id == first.rollout_id
    conflict = body.model_copy(update={"version": "2"})
    with pytest.raises(SaltControlError) as exc:
        await svc.create(conflict, actor_id="ops")
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_endpoint_status_includes_rollout(repos):
    from datetime import UTC, datetime

    from db.repositories.interfaces import EndpointRecord
    from services.job_service import JobService
    from services.ring0_service import Ring0Orchestrator

    await repos.endpoints.create(
        EndpointRecord(
            id="ep_1",
            tenant_id="t",
            machine_guid_hash="h",
            hostname="host",
            platform="windows",
            arch="AMD64",
            status="active",
            device_credential_hash="c",
            created_at=datetime.now(UTC),
        )
    )
    orch = Ring0Orchestrator(repos, JobService(repos))
    targets = [{"endpoint_id": f"ep_{i}", "minion_id": f"ep_{i}"} for i in range(1, 6)]
    record = await orch.create_ring0(
        component="hermes",
        version="0.24.0",
        targets=targets,
        actor_id="ops",
        request_id="st1",
        release_id="rel",
        config_revision="cfg",
    )
    status = await JobService(repos).endpoint_status("ep_1")
    assert status.rollout is not None
    assert status.rollout["rolloutId"] == record.id
    assert status.desired_release == "0.24.0"
