"""Runtime Endpoint Control Plane decommission guard (Salt v2.2)."""

from __future__ import annotations

from fastapi import Depends

from core.config import Settings, get_settings
from core.runtime_errors import RuntimeServiceError

DECOMMISSION_CODE = "runtime_endpoint_control_decommissioned"


async def require_runtime_endpoint_control(settings: Settings = Depends(get_settings)) -> None:
    if settings.runtime_endpoint_control_enabled:
        return
    raise RuntimeServiceError(
        "Runtime Endpoint Control Plane is decommissioned; use Salt Control and infra/salt.",
        code=DECOMMISSION_CODE,
        http_status=410,
    )
