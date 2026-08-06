"""Service Center / deployment mode status APIs (PRD v1.6 §20.1)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from api.deps import get_app_settings
from core.config import Settings
from core.deployment_mode import parse_deployment_mode
from integrations.service_center.circuit_breaker import CircuitState
from integrations.service_center.transport import get_shared_transport

router = APIRouter(tags=["service-center"])


@router.get("/runtime/mode")
async def runtime_mode(settings: Settings = Depends(get_app_settings)) -> dict:
    mode = parse_deployment_mode(settings.deployment_mode)
    return {
        "deploymentMode": mode.value,
        "serviceCenterUseStub": settings.service_center_use_stub,
        "serviceCenterConfigured": bool((settings.service_center_base_url or "").strip()),
        "apiVersion": "1.3",
    }


@router.get("/service-center/status")
async def service_center_status(request: Request, settings: Settings = Depends(get_app_settings)) -> dict:
    mode = parse_deployment_mode(settings.deployment_mode)
    transport = get_shared_transport()
    circuit = transport.circuit_breaker.snapshot()
    center = getattr(request.app.state, "service_center", None)
    return {
        "deploymentMode": mode.value,
        "usingStub": type(center).__name__ == "StubServiceCenterClient" if center else True,
        "baseUrlConfigured": bool((settings.service_center_base_url or "").strip()),
        "circuitBreaker": circuit,
        "offline": any(v.get("state") == "open" for v in circuit.values()),
    }


@router.post("/service-center/reconnect")
async def service_center_reconnect(settings: Settings = Depends(get_app_settings)) -> dict:
    transport = get_shared_transport()
    for hc in transport.circuit_breaker.hosts.values():
        hc.state = CircuitState.CLOSED
        hc.open_until = 0.0
        hc.consecutive_failures = 0
        hc.half_open_probe_in_flight = False
    await transport.start()
    return {"ok": True, "deploymentMode": parse_deployment_mode(settings.deployment_mode).value}
