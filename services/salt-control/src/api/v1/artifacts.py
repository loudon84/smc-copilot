from __future__ import annotations

from fastapi import APIRouter, Query, Request

from core.auth import ArtifactAuth
from schemas.artifact import ArtifactMetadataResponse

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


@router.get("/{component}/{version}", response_model=ArtifactMetadataResponse)
async def get_artifact(
    component: str,
    version: str,
    request: Request,
    _auth: ArtifactAuth,
    platform: str = Query(default="windows"),
    arch: str = Query(default="AMD64"),
) -> ArtifactMetadataResponse:
    return await request.app.state.artifact_service.get(component, version, platform=platform, arch=arch)
