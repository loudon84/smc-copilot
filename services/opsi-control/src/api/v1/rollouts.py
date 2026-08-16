from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from core.auth import AuthPrincipal, Scope, require_scope
from core.errors import ErrorCode, OpsiControlError
from schemas.rollout import (
    AbortRequest,
    ApproveRequest,
    ArtifactPromoteRequest,
    DepotAttestationRequest,
    DepotPauseRequest,
    FreezeClearRequest,
    LiveGateImportRequest,
    LiveGateRevokeRequest,
    PauseRequest,
    PreflightRequest,
    ReleaseFreezeRequest,
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
    cursor: str | None = None,
    limit: int = 50,
):
    items = await request.app.state.rollouts.list_campaigns()
    if cursor:
        items = [item for item in items if item.campaign_id > cursor]
    sliced = items[: max(1, min(limit, 100))]
    next_cursor = sliced[-1].campaign_id if len(sliced) == limit else None
    return {"items": sliced, "nextCursor": next_cursor}


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
    cursor: str | None = None,
    limit: int | None = None,
):
    items = await request.app.state.rollouts.list_targets(campaign_id)
    if cursor:
        items = [item for item in items if item.client_id > cursor]
    if limit is not None:
        items = items[: max(1, min(limit, 100))]
    return {"items": items, "nextCursor": items[-1].client_id if limit and len(items) == limit else None}


@router.get("/rollouts/{campaign_id}/depots")
async def rollout_depots(
    campaign_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return {"items": await request.app.state.rollouts.list_depots(campaign_id)}


@router.get("/rollouts/{campaign_id}/rings")
async def rollout_rings(
    campaign_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return {"items": await request.app.state.rollouts.list_rings(campaign_id)}


@router.post("/rollouts/{campaign_id}/rings/{ring_index}/approve")
async def approve_ring(
    campaign_id: str,
    ring_index: int,
    body: ApproveRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_APPROVE))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.approve_ring(campaign_id, ring_index, body, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/depots/{depot_id}/pause")
async def pause_depot(
    campaign_id: str,
    depot_id: str,
    body: DepotPauseRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_PAUSE))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.pause_depot(campaign_id, depot_id, body, principal, _revision(if_match))


@router.post("/rollouts/{campaign_id}/depots/{depot_id}/resume")
async def resume_depot(
    campaign_id: str,
    depot_id: str,
    body: ResumeRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_RESUME))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.resume_depot(campaign_id, depot_id, body, principal, _revision(if_match))


@router.get("/rollouts/{campaign_id}/compliance")
async def rollout_compliance(
    campaign_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return {"items": await request.app.state.rollouts.fleet_compliance(campaign_id)}


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


@router.post("/depot-attestations")
async def create_attestation(
    body: DepotAttestationRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_CREATE))],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    if not idempotency_key:
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "Idempotency-Key required", status_code=400)
    return await request.app.state.rollouts.attest_depot(body, principal)


@router.post("/release-freezes")
async def create_freeze(
    body: ReleaseFreezeRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_PAUSE))],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    if not idempotency_key:
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "Idempotency-Key required", status_code=400)
    return await request.app.state.rollouts.freeze(body, principal)


@router.post("/release-freezes/{freeze_id}/clear")
async def clear_freeze(
    freeze_id: str,
    body: FreezeClearRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_RESUME))],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
):
    return await request.app.state.rollouts.clear_freeze(freeze_id, body, principal)


@router.get("/fleet/compliance")
async def fleet_compliance(
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
    cursor: str | None = None,
    limit: int = 50,
):
    return await request.app.state.rollouts.list_fleet_compliance(cursor=cursor, limit=limit)


@router.post("/live-gates/import")
async def import_live_gate(
    body: LiveGateImportRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_APPROVE))],
):
    return await request.app.state.rollouts.import_live_gate(body, principal)


@router.get("/live-gates/{gate_id}")
async def get_live_gate(
    gate_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.ROLLOUT_EVIDENCE))],
):
    return await request.app.state.rollouts.get_live_gate(gate_id)


@router.post("/live-gates/{gate_id}/revoke")
async def revoke_live_gate(
    gate_id: str,
    body: LiveGateRevokeRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ROLLOUT_ABORT))],
):
    return await request.app.state.rollouts.revoke_live_gate(gate_id, principal, body.reason)
