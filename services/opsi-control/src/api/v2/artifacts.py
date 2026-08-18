from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.v2.models import V2ArtifactTokenRequest, V2ArtifactTokenView, V2ArtifactView

router = APIRouter(tags=["v2-artifacts"])


@router.get("/artifacts/{artifact_id}", response_model=V2ArtifactView)
async def get_artifact(
    artifact_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.v2_artifacts.get(artifact_id)


@router.post("/artifacts/token", response_model=V2ArtifactTokenView)
async def mint_artifact_token(
    body: V2ArtifactTokenRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.ACTION_DISPATCH))],
):
    return await request.app.state.v2_artifacts.mint_token(body, principal.subject)
