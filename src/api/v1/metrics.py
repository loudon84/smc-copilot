from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from services.metrics_service import MetricsService

router = APIRouter(tags=["observability"])


@router.get("/metrics")
async def metrics() -> PlainTextResponse:
    body = MetricsService.get().export_prometheus()
    return PlainTextResponse(body, media_type="text/plain; version=0.0.4")
