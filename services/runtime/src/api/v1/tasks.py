"""Legacy `/api/v1/tasks` Compatibility Adapter → WorkTaskService (PRD v1.3 §7)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.deps import (
    get_app_settings,
    get_approval_service,
    get_db_session,
    get_gateway_supervisor,
    get_service_center,
    get_session_maker,
)
from core.config import Settings
from core.errors import NotFoundError
from integrations.service_center.protocol import ServiceCenterClient
from schemas.v12_tasks import (
    BindProfileBody,
    LocalTaskCreate,
    LocalTaskResponse,
    TaskEventResponse,
)
from schemas.work_tasks import WorkTaskAssignBody, WorkTaskCreate
from services.approval_service import ApprovalService
from services.gateway_supervisor import GatewaySupervisor
from services.sse_helpers import parse_last_event_id, stream_sse_headers
from services.task_event_service import TaskEventService
from services.work_task_service import WorkTaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _work_svc(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_app_settings),
    center: ServiceCenterClient = Depends(get_service_center),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> WorkTaskService:
    return WorkTaskService(settings, session, center, supervisor)


def _to_local_response(task: Any) -> LocalTaskResponse:
    data = task.model_dump(by_alias=True, mode="json") if hasattr(task, "model_dump") else dict(task)
    created = data.get("createdAt") or data.get("created_at")
    updated = data.get("updatedAt") or data.get("updated_at")
    if created is None or updated is None:
        raise NotFoundError("work task timestamps missing")
    return LocalTaskResponse(
        id=data["id"],
        title=data["title"],
        description=data.get("description"),
        task_type=data.get("taskType") or data.get("task_type") or "coding",
        source=data.get("source") or "local",
        remote_task_id=data.get("sourceTaskId") or data.get("source_task_id"),
        assignment_id=data.get("assignmentId") or data.get("assignment_id"),
        local_attempt_id=data["id"],
        target_profile_id=data.get("profileId") or data.get("profile_id"),
        workspace_id=data.get("workspaceId") or data.get("workspace_id"),
        status=data["status"],
        priority=int(data.get("priority") or 0),
        payload_json=None,
        result_json=data.get("resultSummary") or data.get("result_summary"),
        error_message=data.get("errorMessage") or data.get("error_message"),
        hermes_run_id=data.get("activeRunId") or data.get("active_run_id"),
        created_at=created,
        updated_at=updated,
    )


@router.get("", response_model=list[LocalTaskResponse])
async def list_tasks(
    svc: WorkTaskService = Depends(_work_svc),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[LocalTaskResponse]:
    listed = await svc.list_tasks(limit=limit)
    return [_to_local_response(item) for item in listed.items]


@router.post("", response_model=LocalTaskResponse, status_code=201)
async def create_task(
    body: LocalTaskCreate,
    svc: WorkTaskService = Depends(_work_svc),
) -> LocalTaskResponse:
    created = await svc.create_task(
        WorkTaskCreate(
            title=body.title,
            description=body.description,
            taskType=body.task_type,
            payload=body.payload,
            workspaceId=body.workspace_id,
            source="local",
        )
    )
    return _to_local_response(created)


@router.get("/{task_id}", response_model=LocalTaskResponse)
async def get_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> LocalTaskResponse:
    return _to_local_response(await svc.get_task(task_id))


@router.post("/{task_id}/run", response_model=LocalTaskResponse)
async def run_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> LocalTaskResponse:
    await svc.start(task_id)
    return _to_local_response(await svc.get_task(task_id))


@router.post("/{task_id}/cancel", response_model=LocalTaskResponse)
async def cancel_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> LocalTaskResponse:
    return _to_local_response(await svc.cancel(task_id))


@router.post("/{task_id}/bind-profile", response_model=LocalTaskResponse)
async def bind_profile(
    task_id: str,
    body: BindProfileBody,
    svc: WorkTaskService = Depends(_work_svc),
) -> LocalTaskResponse:
    return _to_local_response(
        await svc.assign(task_id, WorkTaskAssignBody(profileId=body.profile_id))
    )


@router.get("/{task_id}/events", response_model=list[TaskEventResponse])
async def list_events(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> list[TaskEventResponse]:
    events = await TaskEventService(session).list_events(task_id)
    return [
        TaskEventResponse(
            id=e["id"],
            task_id=e["taskId"],
            run_id=e.get("runId"),
            event_type=e["eventType"],
            message=None,
            event_payload=str(e.get("payload")) if e.get("payload") is not None else None,
            created_at=e.get("createdAt"),
        )
        for e in events
    ]


@router.post("/{task_id}/request-approval")
async def request_approval_ep(
    task_id: str,
    approvals: ApprovalService = Depends(get_approval_service),
    action_type: str = Query(min_length=1),
    risk_level: str = Query(default="medium"),
    requested_by: str | None = Query(default=None),
) -> dict[str, str]:
    # Keep legacy approval endpoint for LocalTask approval table compatibility during migration.
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
