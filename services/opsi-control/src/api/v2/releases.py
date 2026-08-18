from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.v2.models import V2ReleaseUpsertRequest, V2ReleaseView

router = APIRouter(tags=["v2-releases"])


@router.post("/releases", response_model=V2ReleaseView)
async def upsert_release(
    body: V2ReleaseUpsertRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.POLICY_APPLY))],
):
    return await request.app.state.v2_releases.upsert(body, principal.subject)


@router.get("/releases/{release_version}", response_model=V2ReleaseView)
async def get_release(
    release_version: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.v2_releases.get(release_version)
