from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import get_app_settings
from core.config import Settings
from schemas.system import SystemInfoResponse
from version import __version__

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/info", response_model=SystemInfoResponse)
async def system_info(settings: Settings = Depends(get_app_settings)) -> SystemInfoResponse:
    return SystemInfoResponse(
        service="smc-copilot-serve",
        version=__version__,
        hermes_home=str(settings.hermes_home_path),
        sqlite_path=settings.sqlite_path,
        default_gateway_port=settings.default_gateway_port,
    )
