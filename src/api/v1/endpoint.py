"""Endpoint identity local API (PRD §18.1)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session, get_service_center
from core.config import Settings, get_settings
from integrations.service_center.protocol import ServiceCenterClient
from schemas.endpoint import EnrollmentCompleteRequest, EnrollmentStartRequest
from services.endpoint_enrollment_service import EndpointEnrollmentService
from services.endpoint_inventory_service import EndpointInventoryService

router = APIRouter(prefix="/endpoint", tags=["endpoint"])


def _enrollment(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    center: ServiceCenterClient = Depends(get_service_center),
) -> EndpointEnrollmentService:
    return EndpointEnrollmentService(settings, session, center)


def _inventory(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    center: ServiceCenterClient = Depends(get_service_center),
) -> EndpointInventoryService:
    return EndpointInventoryService(settings, session, center)


@router.get("/status")
async def endpoint_status(svc: EndpointEnrollmentService = Depends(_enrollment)) -> dict[str, Any]:
    return await svc.status()


@router.post("/enrollment/start")
async def enrollment_start(
    body: EnrollmentStartRequest,
    svc: EndpointEnrollmentService = Depends(_enrollment),
) -> dict[str, Any]:
    return await svc.start(enrollment_code=body.enrollment_code, user_id=body.user_id)


@router.post("/enrollment/complete")
async def enrollment_complete(
    body: EnrollmentCompleteRequest,
    svc: EndpointEnrollmentService = Depends(_enrollment),
) -> dict[str, Any]:
    return await svc.complete(
        enrollment_code=body.enrollment_code,
        enrollment_id=body.enrollment_id,
        user_id=body.user_id,
        tenant_hint=body.tenant_hint,
    )


@router.post("/enrollment/revoke")
async def enrollment_revoke(svc: EndpointEnrollmentService = Depends(_enrollment)) -> dict[str, Any]:
    return await svc.revoke()


@router.get("/inventory")
async def endpoint_inventory(svc: EndpointInventoryService = Depends(_inventory)) -> dict[str, Any]:
    return await svc.get_latest()
