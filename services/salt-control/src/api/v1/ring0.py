from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import Field

from api.deps import RequestServicesDep
from core.auth import OperatorAuth
from core.errors import ErrorCode, SaltControlError
from schemas.common import CamelModel
from services.gate_evaluator import evaluate_rollout
from services.ring0_service import Ring0Orchestrator

router = APIRouter(prefix="/ring0", tags=["ring0"])


class Ring0CreateRequest(CamelModel):
    component: str
    version: str
    request_id: str
    release_id: str
    config_revision: str
    targets: list[dict[str, Any]] = Field(default_factory=list)


class Ring0ApprovalRequest(CamelModel):
    decision: str = "approve"
    reason: str = ""
    # role in body is ignored — taken from OIDC/JWT salt_roles claim


class Ring0RollbackRequest(CamelModel):
    scope: str = "target"  # target | batch | rollout
    endpoint_id: str | None = None
    reason: str = ""


@router.post("/rollouts")
async def create_ring0(
    body: Ring0CreateRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service, backend=services.backend)
    record = await orch.create_ring0(
        component=body.component,
        version=body.version,
        targets=body.targets,
        actor_id=auth.subject,
        request_id=body.request_id,
        release_id=body.release_id,
        config_revision=body.config_revision,
    )
    return {
        "rolloutId": record.id,
        "state": record.state,
        "snapshotDigest": record.thresholds_json.get("snapshotDigest"),
        "targetCount": record.target_count,
    }


@router.post("/rollouts/{rollout_id}:approve")
async def approve_ring0(
    rollout_id: str,
    body: Ring0ApprovalRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    roles = sorted(auth.roles)
    if not roles:
        raise SaltControlError(ErrorCode.FORBIDDEN, "approval role not granted to subject", status_code=403)
    # One approval action per request — use the first granted required role present.
    role = next((r for r in ("release_owner", "platform_owner", "security_owner") if r in auth.roles), roles[0])
    record = await orch.approve_role(
        rollout_id,
        role=role,
        subject=auth.subject,
        decision=body.decision,
        reason=body.reason,
        role_source="oidc",
        claimed_roles=auth.roles,
    )
    return {"rolloutId": record.id, "state": record.state, "role": role}


@router.post("/rollouts/{rollout_id}:start-batch")
async def start_batch(
    rollout_id: str,
    request: Request,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    job_ids = await orch.start_batch(rollout_id, actor_id=auth.subject)
    worker = getattr(request.app.state, "job_worker", None)
    if worker is not None:
        worker.notify()
    return {"rolloutId": rollout_id, "jobIds": job_ids}


@router.post("/rollouts/{rollout_id}:advance-batch")
async def advance_batch(
    rollout_id: str,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    record = await orch.advance_batch(rollout_id, actor_id=auth.subject)
    return {"rolloutId": record.id, "state": record.state, "batch": record.thresholds_json.get("currentBatch")}


@router.post("/rollouts/{rollout_id}:rollback")
async def rollback_ring0(
    rollout_id: str,
    body: Ring0RollbackRequest,
    request: Request,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    job_ids = await orch.rollback_scope(
        rollout_id,
        scope=body.scope,
        endpoint_id=body.endpoint_id,
        actor_id=auth.subject,
    )
    worker = getattr(request.app.state, "job_worker", None)
    if worker is not None:
        worker.notify()
    return {"rolloutId": rollout_id, "jobIds": job_ids, "scope": body.scope}


class Ring0ResumeRequest(CamelModel):
    reason: str = ""
    gate_digest: str | None = None


@router.get("/rollouts/{rollout_id}/status")
async def ring0_status(rollout_id: str, services: RequestServicesDep, _auth: OperatorAuth) -> dict[str, Any]:
    record = await services.repos.rollouts.get(rollout_id)
    if record is None:
        raise SaltControlError(ErrorCode.NOT_FOUND, "rollout not found", status_code=404)
    targets = await services.repos.rollouts.list_targets(rollout_id)
    return {
        "rolloutId": record.id,
        "state": record.state,
        "stateVersion": record.state_version,
        "batch": record.thresholds_json.get("currentBatch"),
        "snapshotDigest": record.snapshot_digest,
        "targets": [{"endpointId": t.endpoint_id, "state": t.state, "batchIndex": t.batch_index} for t in targets],
    }


@router.get("/rollouts/{rollout_id}/gates")
async def ring0_gates(rollout_id: str, services: RequestServicesDep, _auth: OperatorAuth) -> dict[str, Any]:
    return await evaluate_rollout(services.repos, rollout_id)


@router.get("/rollouts/{rollout_id}/observations")
async def ring0_observations(rollout_id: str, services: RequestServicesDep, _auth: OperatorAuth) -> dict[str, Any]:
    rows = await services.repos.rollout_observations.list_for_rollout(rollout_id)
    return {
        "rolloutId": rollout_id,
        "observations": [
            {
                "window": r.window,
                "capturedAt": r.captured_at.isoformat() if r.captured_at else None,
                "payload": r.payload_json,
            }
            for r in rows
        ],
    }


@router.post("/rollouts/{rollout_id}:pause")
async def pause_ring0(
    rollout_id: str,
    body: Ring0ResumeRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    record = await orch.pause(rollout_id, actor_id=auth.subject, reason=body.reason)
    return {"rolloutId": record.id, "state": record.state}


@router.post("/rollouts/{rollout_id}:resume")
async def resume_ring0(
    rollout_id: str,
    body: Ring0ResumeRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    record = await orch.resume(
        rollout_id,
        actor_id=auth.subject,
        reason=body.reason,
        gate_digest_submitted=body.gate_digest,
    )
    return {"rolloutId": record.id, "state": record.state}


@router.post("/rollouts/{rollout_id}:complete-signoff")
async def complete_signoff(
    rollout_id: str,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    roles = auth.roles
    ready = {"release_owner", "platform_owner", "security_owner"} <= set(roles)
    record = await orch.complete_signoff(rollout_id, actor_id=auth.subject, roles_ready=ready)
    return {"rolloutId": record.id, "state": record.state}
