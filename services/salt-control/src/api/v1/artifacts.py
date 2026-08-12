from __future__ import annotations

from fastapi import APIRouter, Query

from api.deps import RequestServicesDep
from core.auth import ArtifactAuth
from schemas.artifact import ArtifactMetadataResponse

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


@router.get("/{component}/{version}", response_model=ArtifactMetadataResponse)
async def get_artifact(
    component: str,
    version: str,
    services: RequestServicesDep,
    _auth: ArtifactAuth,
    platform: str = Query(default="windows"),
    arch: str = Query(default="AMD64"),
) -> ArtifactMetadataResponse:
    return await services.artifact_service.get(component, version, platform=platform, arch=arch)
