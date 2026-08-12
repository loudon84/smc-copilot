from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import Field

from api.deps import RequestServicesDep
from core.auth import OperatorAuth
from schemas.common import CamelModel
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
    role: str
    decision: str = "approve"
    reason: str = ""


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
    orch = Ring0Orchestrator(services.repos, services.job_service)
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
    record = await orch.approve_role(
        rollout_id,
        role=body.role,
        subject=auth.subject,
        decision=body.decision,
        reason=body.reason,
    )
    return {"rolloutId": record.id, "state": record.state}


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
    _auth: OperatorAuth,
) -> dict[str, Any]:
    orch = Ring0Orchestrator(services.repos, services.job_service)
    record = await orch.advance_batch(rollout_id)
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
