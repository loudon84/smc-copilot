from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.deps import (
    get_app_settings,
    get_approval_service,
    get_db_session,
    get_session_maker,
    get_task_runtime,
)
from core.config import Settings
from core.errors import NotFoundError
from db.repositories.v12_repos import TaskEventRepository
from services.sse_helpers import stream_sse_headers
from services.workbench_event_stream import iter_task_timeline_events, resolve_last_event_id
from schemas.v12_tasks import (
    BindProfileBody,
    LocalTaskCreate,
    LocalTaskResponse,
    TaskEventResponse,
)
from services.approval_service import ApprovalService
from services.task_runtime import TaskRuntimeService

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[LocalTaskResponse])
async def list_tasks(
    rt: TaskRuntimeService = Depends(get_task_runtime),
    limit: int = 200,
) -> list[LocalTaskResponse]:
    tasks = await rt.list_local_tasks(limit=limit)
    return [LocalTaskResponse.model_validate(t) for t in tasks]


@router.post("", response_model=LocalTaskResponse, status_code=201)
async def create_task(
    body: LocalTaskCreate,
    rt: TaskRuntimeService = Depends(get_task_runtime),
) -> LocalTaskResponse:
    t = await rt.create_local_task(
        title=body.title,
        task_type=body.task_type,
        payload=body.payload,
        workspace_id=body.workspace_id,
    )
    if body.description is not None:
        t.description = body.description
        await rt.save_local_task(t)
    return LocalTaskResponse.model_validate(t)


@router.get("/{task_id}", response_model=LocalTaskResponse)
async def get_task(
    task_id: str,
    rt: TaskRuntimeService = Depends(get_task_runtime),
) -> LocalTaskResponse:
    t = await rt.load_local_task(task_id)
    if t is None:
        raise NotFoundError("Task not found")
    return LocalTaskResponse.model_validate(t)


@router.post("/{task_id}/run", response_model=LocalTaskResponse)
async def run_task(task_id: str, rt: TaskRuntimeService = Depends(get_task_runtime)) -> LocalTaskResponse:
    t = await rt.execute_run(task_id)
    return LocalTaskResponse.model_validate(t)


@router.post("/{task_id}/cancel", response_model=LocalTaskResponse)
async def cancel_task(task_id: str, rt: TaskRuntimeService = Depends(get_task_runtime)) -> LocalTaskResponse:
    t = await rt.cancel_task(task_id)
    return LocalTaskResponse.model_validate(t)


@router.post("/{task_id}/bind-profile", response_model=LocalTaskResponse)
async def bind_profile(
    task_id: str,
    body: BindProfileBody,
    rt: TaskRuntimeService = Depends(get_task_runtime),
) -> LocalTaskResponse:
    t = await rt.bind_profile(task_id, body.profile_id)
    return LocalTaskResponse.model_validate(t)


@router.get("/{task_id}/events", response_model=list[TaskEventResponse])
async def list_events(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> list[TaskEventResponse]:
    evs = await TaskEventRepository(session).list_by_task(task_id)
    return [TaskEventResponse.model_validate(e) for e in evs]


@router.post("/{task_id}/request-approval")
async def request_approval_ep(
    task_id: str,
    approvals: ApprovalService = Depends(get_approval_service),
    action_type: str = Query(min_length=1),
    risk_level: str = Query(default="medium"),
    requested_by: str | None = Query(default=None),
) -> dict[str, str]:
    ap = await approvals.request_approval(
        task_id, action_type=action_type, risk_level=risk_level, requested_by=requested_by
    )
    return {"approval_id": ap.id}


@router.get("/{task_id}/events/stream")
async def stream_events(
    task_id: str,
    request: Request,
    settings: Annotated[Settings, Depends(get_app_settings)],
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> StreamingResponse:
    last_id = resolve_last_event_id(request)

    async def gen() -> object:
        async for chunk in iter_task_timeline_events(
            request,
            session_maker,
            task_id=task_id,
            last_event_id=last_id,
        ):
            yield chunk

    allowed = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers=stream_sse_headers(origin=request.headers.get("origin"), allowed_origins=allowed or None),
    )
