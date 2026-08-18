from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.models import ActionCreateRequest, ActionView

router = APIRouter(tags=["actions"])


@router.post("/actions", response_model=ActionView)
async def create_action(
    body: ActionCreateRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ACTION_DISPATCH))],
):
    return await request.app.state.actions.create(body, principal.subject)


@router.get("/actions/{request_id}", response_model=ActionView)
async def get_action(
    request_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.actions.get(request_id)


@router.get("/actions/{request_id}/results")
async def action_results(
    request_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return {"items": await request.app.state.actions.results(request_id)}
