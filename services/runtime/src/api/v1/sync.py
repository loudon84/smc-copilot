"""Sync status / resources / dead-letter local API (PRD §18.2)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session, get_service_center
from core.config import Settings, get_settings
from integrations.service_center.protocol import ServiceCenterClient
from schemas.sync import ConflictResolveRequest
from services.desired_state_service import DesiredStateService
from services.resource_sync_service import ResourceSyncService
from services.runtime_sync_service import RuntimeSyncService

router = APIRouter(prefix="/sync", tags=["sync"])


def _sync(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    center: ServiceCenterClient = Depends(get_service_center),
) -> RuntimeSyncService:
    return RuntimeSyncService(settings, session, center)


def _resources(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> ResourceSyncService:
    return ResourceSyncService(settings, session)


def _desired(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    center: ServiceCenterClient = Depends(get_service_center),
) -> DesiredStateService:
    return DesiredStateService(settings, session, center)


@router.get("/status")
async def sync_status(svc: RuntimeSyncService = Depends(_sync)) -> dict[str, Any]:
    return await svc.status()


@router.post("/now")
async def sync_now(svc: RuntimeSyncService = Depends(_sync)) -> dict[str, Any]:
    return await svc.sync_now()


@router.get("/channels")
async def sync_channels(svc: RuntimeSyncService = Depends(_sync)) -> list[dict[str, Any]]:
    return await svc.list_channels()


@router.get("/resources")
async def sync_resources(svc: ResourceSyncService = Depends(_resources)) -> list[dict[str, Any]]:
    return await svc.list_resources()


@router.get("/conflicts")
async def sync_conflicts(svc: ResourceSyncService = Depends(_resources)) -> list[dict[str, Any]]:
    return await svc.list_conflicts()


@router.post("/conflicts/{conflict_id}/resolve")
async def resolve_conflict(
    conflict_id: str,
    body: ConflictResolveRequest,
    svc: ResourceSyncService = Depends(_resources),
) -> dict[str, Any]:
    return await svc.resolve_conflict(conflict_id, resolution=body.resolution)


@router.get("/dead-letters")
async def list_dead_letters(svc: RuntimeSyncService = Depends(_sync)) -> list[dict[str, Any]]:
    return await svc.list_dead_letters()


@router.post("/dead-letters/{outbox_id}/retry")
async def retry_dead_letter(
    outbox_id: str,
    svc: RuntimeSyncService = Depends(_sync),
) -> dict[str, Any]:
    return await svc.retry_dead_letter(outbox_id)
