from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from core.auth import AuthPrincipal, Scope, require_scope
from core.errors import ErrorCode, OpsiControlError
from schemas.rollout import (
    AbortRequest,
    ApproveRequest,
    ArtifactPromoteRequest,
    PauseRequest,
    PreflightRequest,
    ResumeRequest,
    RollbackRequest,
    RolloutCreateRequest,
    StartRequest,
)

router = APIRouter(tags=["rollouts"])


def _revision(if_match: str | None) -> int:
    if not if_match:
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "If-Match required", status_code=400)
    try:
        return int(if_match)
    except ValueError as exc:
        raise OpsiControlError(
            ErrorCode.VALIDATION_ERROR, "If-Match must be campaign revision", status_code=400
        ) from exc


@router.post("/rollouts")
async def create_rollout(
    body: RolloutCreateRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_CREATE))],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    return await request.app.state.rollouts.create(body, principal, idempotency_key or "")


@router.get("/rollouts")
async def list_rollouts(
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    items = await request.app.state.rollouts.list_campaigns()
    return {"items": items}


@router.get("/rollouts/metrics")
async def rollout_metrics(
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return await request.app.state.rollouts.metrics()


@router.get("/rollouts/{campaign_id}")
async def get_rollout(
    campaign_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return await request.app.state.rollouts.get(campaign_id)


@router.get("/rollouts/{campaign_id}/targets")
async def rollout_targets(
    campaign_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return {"items": await request.app.state.rollouts.list_targets(campaign_id)}


@router.post("/rollouts/{campaign_id}/preflight")
async def preflight_rollout(
    campaign_id: str,
    body: PreflightRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_CREATE))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.preflight(campaign_id, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/approve")
async def approve_rollout(
    campaign_id: str,
    body: ApproveRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_APPROVE))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.approve(campaign_id, body, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/start")
async def start_rollout(
    campaign_id: str,
    body: StartRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_START))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.start(campaign_id, body, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/pause")
async def pause_rollout(
    campaign_id: str,
    body: PauseRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_PAUSE))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.pause(campaign_id, body, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/resume")
async def resume_rollout(
    campaign_id: str,
    body: ResumeRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_RESUME))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.resume(campaign_id, body, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/abort")
async def abort_rollout(
    campaign_id: str,
    body: AbortRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_ABORT))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.abort(campaign_id, body, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/rollback")
async def rollback_rollout(
    campaign_id: str,
    body: RollbackRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_ROLLBACK))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.rollback(campaign_id, body, principal, _revision(if_match))


@router.get("/rollouts/{campaign_id}/evidence")
async def rollout_evidence(
    campaign_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return await request.app.state.rollouts.evidence(campaign_id)


@router.post("/artifacts/promote")
async def promote_artifact(
    body: ArtifactPromoteRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_CREATE))],
):
    return await request.app.state.rollouts.promote(body, principal)
