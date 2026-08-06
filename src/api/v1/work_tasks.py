"""
Work task control plane API (PRD v1.6 FR-401–406).

Mounted at `/work-tasks` because `/tasks` serves legacy LocalTask routes.
PRD `/api/v1/tasks` WorkTask operations are available here; `/remote-tasks` delegates internally.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.deps import (
    get_app_settings,
    get_db_session,
    get_gateway_supervisor,
    get_service_center,
    get_session_maker,
)
from core.config import Settings
from integrations.service_center.protocol import ServiceCenterClient
from services.gateway_supervisor import GatewaySupervisor
from services.sse_helpers import parse_last_event_id, stream_sse_headers
from services.task_event_service import TaskEventService
from services.task_run_service import TaskRunService
from services.work_task_service import WorkTaskService

router = APIRouter(prefix="/work-tasks", tags=["work-tasks"])


def _work_svc(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_app_settings),
    center: ServiceCenterClient = Depends(get_service_center),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> WorkTaskService:
    return WorkTaskService(settings, session, center, supervisor)


@router.get("")
async def list_work_tasks(svc: WorkTaskService = Depends(_work_svc)) -> list[dict[str, Any]]:
    return await svc.list_tasks()


@router.get("/{task_id}")
async def get_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> dict[str, Any]:
    return await svc.get_task(task_id)


@router.post("/{task_id}/start")
async def start_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> dict[str, Any]:
    return await svc.start(task_id)


@router.post("/{task_id}/cancel")
async def cancel_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> dict[str, Any]:
    return await svc.cancel(task_id)


@router.post("/{task_id}/retry")
async def retry_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> dict[str, Any]:
    return await svc.retry(task_id)


@router.get("/{task_id}/runs")
async def list_task_runs(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, Any]]:
    return await TaskRunService(session).list_runs(task_id)


@router.get("/{task_id}/events")
async def list_task_events(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
    after_sequence: int | None = None,
) -> list[dict[str, Any]]:
    return await TaskEventService(session).list_events(task_id, after_sequence=after_sequence)


@router.get("/{task_id}/events/stream")
async def stream_task_events(
    task_id: str,
    request: Request,
    settings: Annotated[Settings, Depends(get_app_settings)],
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> StreamingResponse:
    last_id = parse_last_event_id(request.headers.get("Last-Event-ID"))

    async def gen() -> object:
        async for chunk in TaskEventService(session_maker()).iter_sse(
            request,
            session_maker,
            task_id,
            last_event_id=last_id,
        ):
            yield chunk

    allowed = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers=stream_sse_headers(origin=request.headers.get("origin"), allowed_origins=allowed or None),
    )
