from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from api.deps import get_app_settings
from core.config import Settings
from schemas.system import HealthResponse
from services.metrics_service import MetricsService
from version import __version__

router = APIRouter(tags=["system"])


def _supervisor(request: Request):
    return getattr(request.app.state, "worker_supervisor", None)


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(version=__version__)


@router.get("/health/live")
async def health_live() -> dict:
    return {"status": "alive", "version": __version__}


@router.get("/health/ready")
async def health_ready(request: Request, settings: Settings = Depends(get_app_settings)) -> dict:
    checks: dict[str, bool] = {"database": True}
    supervisor = _supervisor(request)
    if supervisor is not None:
        checks["criticalWorkers"] = supervisor.is_ready()
    job_service = getattr(request.app.state, "runtime_job_service", None)
    if job_service is not None:
        checks["runtimeJobWorker"] = True
    gateway = getattr(request.app.state, "gateway_supervisor", None)
    if gateway is not None:
        checks["gatewaySupervisor"] = True
    ready = all(checks.values())
    return {"status": "ready" if ready else "not_ready", "checks": checks}


@router.get("/health/details")
async def health_details(request: Request, settings: Settings = Depends(get_app_settings)) -> dict:
    supervisor = _supervisor(request)
    workers = supervisor.snapshot() if supervisor else []
    metrics = MetricsService.get().export_json()
    return {
        "version": __version__,
        "deploymentMode": settings.deployment_mode,
        "workers": workers,
        "metrics": metrics,
        "centerStub": settings.service_center_use_stub,
    }
