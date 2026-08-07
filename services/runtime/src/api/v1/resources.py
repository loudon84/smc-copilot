"""Resource reconciliation and probe API (PRD FR-307–308)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session, get_service_center
from core.config import Settings, get_settings
from integrations.service_center.protocol import ServiceCenterClient
from services.desired_state_service import DesiredStateService
from services.resource_sync_service import ResourceSyncService

router = APIRouter(prefix="/resources", tags=["resources"])


def _desired(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    center: ServiceCenterClient = Depends(get_service_center),
) -> DesiredStateService:
    return DesiredStateService(settings, session, center)


def _resources(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> ResourceSyncService:
    return ResourceSyncService(settings, session)


@router.get("/reconciliations")
async def list_reconciliations(svc: DesiredStateService = Depends(_desired)) -> list[dict[str, Any]]:
    return await svc.list_reconciliations()


@router.get("/reconciliations/{revision}")
async def get_reconciliation(revision: int, svc: DesiredStateService = Depends(_desired)) -> dict[str, Any]:
    return await svc.get_reconciliation(revision)


@router.post("/reconciliations/{revision}/apply")
async def apply_reconciliation(revision: int, svc: DesiredStateService = Depends(_desired)) -> dict[str, Any]:
    return await svc.apply_revision(revision)


@router.post("/reconciliations/{revision}/rollback")
async def rollback_reconciliation(revision: int, svc: DesiredStateService = Depends(_desired)) -> dict[str, Any]:
    return await svc.rollback_revision(revision)


@router.get("/{resource_type}/{resource_id}/probe")
async def probe_resource(
    resource_type: str,
    resource_id: str,
    svc: ResourceSyncService = Depends(_resources),
) -> dict[str, Any]:
    return await svc.probe_resource(resource_type, resource_id)
