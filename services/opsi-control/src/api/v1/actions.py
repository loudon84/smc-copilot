from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.models import ActionCreateRequest

router = APIRouter(tags=["actions"])


@router.post("/actions")
async def create_action(
    body: ActionCreateRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ACTION_DISPATCH))],
):
    return await request.app.state.actions.create(body, principal.subject)


@router.get("/actions/{request_id}")
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
