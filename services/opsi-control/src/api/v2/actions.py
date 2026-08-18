from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.v2.models import V2ActionCreateRequest, V2BatchActionView, V2CancelRequest
from schemas.models import ActionView

router = APIRouter(tags=["v2-actions"])


@router.post("/actions", response_model=ActionView)
async def create_v2_action(
    body: V2ActionCreateRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ACTION_DISPATCH))],
):
    return await request.app.state.v2_actions.create(body, principal.subject)


@router.get("/actions/{request_id}", response_model=ActionView)
async def get_v2_action(
    request_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.v2_actions.get(request_id)


@router.get("/actions/{request_id}/results")
async def v2_action_results(
    request_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return {"items": await request.app.state.v2_actions.results(request_id)}


@router.post("/actions/{request_id}/cancel", response_model=ActionView)
async def cancel_v2_action(
    request_id: str,
    body: V2CancelRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ACTION_DISPATCH))],
):
    return await request.app.state.v2_actions.cancel(request_id, principal.subject, body.reason)


@router.get("/actions/{request_id}/batch", response_model=V2BatchActionView)
async def v2_batch_status(
    request_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.v2_actions.batch_status(request_id)
