"""
Work task control plane API (PRD v1.3 Domain SOT).

Mounted at `/work-tasks`. Legacy `/tasks` routes adapt to WorkTaskService.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
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
from schemas.work_tasks import (
    TaskArtifactOpenResult,
    TaskArtifactResponse,
    TaskArtifactSaveAsBody,
    TaskApprovalResponse,
    TaskEventResponse,
    TaskInteractionResolveBody,
    TaskInteractionResponse,
    TaskSnapshotResponse,
    TaskStartResult,
    TaskRunResponse,
    WorkTaskAssignBody,
    WorkTaskCreate,
    WorkTaskListResponse,
    WorkTaskPatch,
    WorkTaskResponse,
)
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


@router.get("", response_model=WorkTaskListResponse)
async def list_work_tasks(
    svc: WorkTaskService = Depends(_work_svc),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    task_type: str | None = Query(default=None, alias="taskType"),
    source: str | None = None,
    profile_id: str | None = Query(default=None, alias="profileId"),
    instance_id: str | None = Query(default=None, alias="instanceId"),
    workspace_id: str | None = Query(default=None, alias="workspaceId"),
    search: str | None = None,
    created_after: datetime | None = Query(default=None, alias="createdAfter"),
    created_before: datetime | None = Query(default=None, alias="createdBefore"),
) -> WorkTaskListResponse:
    return await svc.list_tasks(
        limit=limit,
        cursor=cursor,
        status=status_filter,
        task_type=task_type,
        source=source,
        profile_id=profile_id,
        instance_id=instance_id,
        workspace_id=workspace_id,
        search=search,
        created_after=created_after,
        created_before=created_before,
    )


@router.post("", response_model=WorkTaskResponse, status_code=201)
async def create_work_task(
    body: WorkTaskCreate,
    svc: WorkTaskService = Depends(_work_svc),
) -> WorkTaskResponse:
    return await svc.create_task(body)


@router.get("/{task_id}", response_model=WorkTaskResponse)
async def get_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> WorkTaskResponse:
    return await svc.get_task(task_id)


@router.patch("/{task_id}", response_model=WorkTaskResponse)
async def patch_work_task(
    task_id: str,
    body: WorkTaskPatch,
    svc: WorkTaskService = Depends(_work_svc),
) -> WorkTaskResponse:
    return await svc.patch_task(task_id, body)


@router.delete("/{task_id}", status_code=204, response_class=Response)
async def delete_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> Response:
    await svc.delete_task(task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{task_id}/assign", response_model=WorkTaskResponse)
async def assign_work_task(
    task_id: str,
    body: WorkTaskAssignBody,
    svc: WorkTaskService = Depends(_work_svc),
) -> WorkTaskResponse:
    return await svc.assign(task_id, body)


@router.post("/{task_id}/start", response_model=TaskStartResult, status_code=202)
async def start_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> TaskStartResult:
    return await svc.start(task_id)


@router.post("/{task_id}/cancel", response_model=WorkTaskResponse)
async def cancel_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> WorkTaskResponse:
    return await svc.cancel(task_id)


@router.post("/{task_id}/retry", response_model=TaskStartResult, status_code=202)
async def retry_work_task(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> TaskStartResult:
    return await svc.retry(task_id)


@router.get("/{task_id}/approvals", response_model=list[TaskApprovalResponse])
async def list_task_approvals(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> list[TaskApprovalResponse]:
    return await svc.list_approvals(task_id)


@router.post("/{task_id}/approvals/{approval_id}/approve", response_model=TaskApprovalResponse)
async def approve_task(
    task_id: str,
    approval_id: str,
    svc: WorkTaskService = Depends(_work_svc),
) -> TaskApprovalResponse:
    return await svc.approve(task_id, approval_id)


@router.post("/{task_id}/approvals/{approval_id}/reject", response_model=TaskApprovalResponse)
async def reject_task_approval(
    task_id: str,
    approval_id: str,
    svc: WorkTaskService = Depends(_work_svc),
) -> TaskApprovalResponse:
    return await svc.reject_approval(task_id, approval_id)


@router.get("/{task_id}/interactions", response_model=list[TaskInteractionResponse])
async def list_task_interactions(
    task_id: str,
    svc: WorkTaskService = Depends(_work_svc),
) -> list[TaskInteractionResponse]:
    return await svc.list_interactions(task_id)


@router.post("/{task_id}/interactions/{interaction_id}/resolve", response_model=TaskInteractionResponse)
async def resolve_task_interaction(
    task_id: str,
    interaction_id: str,
    body: TaskInteractionResolveBody,
    svc: WorkTaskService = Depends(_work_svc),
) -> TaskInteractionResponse:
    return await svc.resolve_interaction(task_id, interaction_id, response=body.response)


@router.get("/{task_id}/snapshot", response_model=TaskSnapshotResponse)
async def get_task_snapshot(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> TaskSnapshotResponse:
    return await svc.get_snapshot(task_id)


@router.get("/{task_id}/artifacts", response_model=list[TaskArtifactResponse])
async def list_task_artifacts(task_id: str, svc: WorkTaskService = Depends(_work_svc)) -> list[TaskArtifactResponse]:
    return await svc.list_artifacts(task_id)


@router.get("/{task_id}/artifacts/{artifact_id}", response_model=TaskArtifactResponse)
async def get_task_artifact(
    task_id: str,
    artifact_id: str,
    svc: WorkTaskService = Depends(_work_svc),
) -> TaskArtifactResponse:
    return await svc.get_artifact(task_id, artifact_id)


@router.post("/{task_id}/artifacts/{artifact_id}/open", response_model=TaskArtifactOpenResult)
async def open_task_artifact(
    task_id: str,
    artifact_id: str,
    svc: WorkTaskService = Depends(_work_svc),
) -> TaskArtifactOpenResult:
    result = await svc.open_artifact(task_id, artifact_id)
    return TaskArtifactOpenResult(localPath=result["localPath"])


@router.post("/{task_id}/artifacts/{artifact_id}/save-as")
async def save_task_artifact_as(
    task_id: str,
    artifact_id: str,
    body: TaskArtifactSaveAsBody,
    svc: WorkTaskService = Depends(_work_svc),
) -> dict[str, str]:
    return await svc.save_artifact_as(task_id, artifact_id, body.destination_path)


@router.get("/{task_id}/runs", response_model=list[TaskRunResponse])
async def list_task_runs(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, Any]]:
    return await TaskRunService(session).list_runs(task_id)


@router.get("/{task_id}/events", response_model=list[TaskEventResponse])
async def list_task_events(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
    after_sequence: int | None = Query(default=None, alias="afterSequence"),
    after_sequence_snake: int | None = Query(default=None, alias="after_sequence"),
) -> list[dict[str, Any]]:
    return await TaskEventService(session).list_events(
        task_id,
        after_sequence=after_sequence if after_sequence is not None else after_sequence_snake,
    )


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
