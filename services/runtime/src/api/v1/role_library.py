from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import get_role_library_service
from schemas.role_library import (
    PresetImportRequest,
    PresetImportResponse,
    RoleLibrarySyncRequest,
    RoleLibrarySyncResponse,
    RoleSpecResponse,
)
from services.role_library_service import RoleLibraryService

router = APIRouter(tags=["role-library"])


@router.post("/role-library/sync", response_model=RoleLibrarySyncResponse)
async def sync_role_library(
    body: RoleLibrarySyncRequest | None = None,
    svc: RoleLibraryService = Depends(get_role_library_service),
) -> RoleLibrarySyncResponse:
    return await svc.sync_library(body)


@router.post("/profiles/import-preset", response_model=PresetImportResponse)
async def import_preset(
    body: PresetImportRequest,
    svc: RoleLibraryService = Depends(get_role_library_service),
) -> PresetImportResponse:
    return await svc.import_preset(body)


@router.post("/role-library/recompile/{profile_id}", response_model=RoleSpecResponse)
async def recompile_role(
    profile_id: str,
    svc: RoleLibraryService = Depends(get_role_library_service),
) -> RoleSpecResponse:
    return await svc.recompile_role(profile_id)


@router.get("/role-library/specs", response_model=list[RoleSpecResponse])
async def list_role_specs(
    svc: RoleLibraryService = Depends(get_role_library_service),
) -> list[RoleSpecResponse]:
    return await svc.list_specs()
