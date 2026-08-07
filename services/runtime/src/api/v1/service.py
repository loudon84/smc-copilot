from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from local_service.service_state import build_service_status
from schemas.system import ServiceProfileCountsResponse, ServiceStatusResponse
from services.runtime_service_update import RuntimeServiceUpdateService

router = APIRouter(prefix="/service", tags=["service"])


@router.get("/status", response_model=ServiceStatusResponse)
async def service_status(request: Request, settings: Settings = Depends(get_app_settings)) -> ServiceStatusResponse:
    session_maker = request.app.state.session_maker
    status = await build_service_status(settings, session_maker)
    return ServiceStatusResponse(
        service=status.service,
        version=status.version,
        pid=status.pid,
        uptime_seconds=status.uptime_seconds,
        host=status.host,
        port=status.port,
        sqlite_path=status.sqlite_path,
        hermes_home=status.hermes_home,
        profiles=ServiceProfileCountsResponse(
            total=status.profiles.total,
            running=status.profiles.running,
            error=status.profiles.error,
        ),
    )


@router.get("/update/check")
async def service_update_check(
    channel: str = "stable",
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await RuntimeServiceUpdateService(settings, session).check(channel=channel)


@router.post("/update/download")
async def service_update_download(
    body: dict | None = None,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    payload = body or {}
    return await RuntimeServiceUpdateService(settings, session).download(
        version=payload.get("version"),
        channel=str(payload.get("channel") or "stable"),
    )


@router.post("/update/apply")
async def service_update_apply(
    body: dict | None = None,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    payload = body or {}
    version = payload.get("version")
    if not version:
        raise RuntimeServiceError("version is required", code="validation_error")
    return await RuntimeServiceUpdateService(settings, session).apply(version=str(version))
