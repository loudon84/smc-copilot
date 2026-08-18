from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.v2.models import V2ConfigCreateRequest, V2ConfigView

router = APIRouter(tags=["v2-configs"])


@router.post("/configs", response_model=V2ConfigView)
async def create_config(
    body: V2ConfigCreateRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.POLICY_APPLY))],
):
    return await request.app.state.v2_configs.create(body, principal.subject)


@router.get("/configs/{revision}", response_model=V2ConfigView)
async def get_config(
    revision: int,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.v2_configs.get(revision)
