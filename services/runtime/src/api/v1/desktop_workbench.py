from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.deps import get_app_settings, get_db_session, get_session_maker, get_team_hub
from core.config import Settings
from integrations.team_hub.client import TeamHubClient
from schemas.v12_tasks import TaskWorkbenchSummary
from services.sse_helpers import stream_sse_headers
from services.workbench_event_stream import iter_workbench_events, resolve_last_event_id
from services.workbench_summary import build_task_workbench_summary

router = APIRouter(prefix="/desktop/task-workbench", tags=["desktop"])


@router.get("/summary", response_model=TaskWorkbenchSummary)
async def workbench_summary(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    hub: Annotated[TeamHubClient, Depends(get_team_hub)],
) -> TaskWorkbenchSummary:
    """DB aggregates plus Team Hub bookkeeping for the Electron workbench."""
    return await build_task_workbench_summary(session, settings, hub)


@router.get("/events/stream")
async def workbench_events_stream(
    request: Request,
    settings: Annotated[Settings, Depends(get_app_settings)],
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> StreamingResponse:
    """Global task workbench SSE: task_created / task_updated / approval_created + ping."""
    last_id = resolve_last_event_id(request)

    async def gen() -> object:
        async for chunk in iter_workbench_events(request, session_maker, last_event_id=last_id):
            yield chunk

    allowed = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers=stream_sse_headers(origin=request.headers.get("origin"), allowed_origins=allowed or None),
    )
