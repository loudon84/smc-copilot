"""Kanban API — instance-scoped Hermes Kanban facade (PRD v1.7)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from schemas.kanban import (
    CreateKanbanBoardInput,
    CreateKanbanTaskInput,
    KanbanAssigneeListResponse,
    KanbanBoard,
    KanbanBoardListResponse,
    KanbanCapabilities,
    KanbanCommentCreate,
    KanbanDispatchRequest,
    KanbanDispatchResult,
    KanbanTask,
    KanbanTaskActionInput,
    KanbanTaskDetail,
    KanbanTaskListResponse,
)
from services.kanban_service import KanbanService

router = APIRouter(
    prefix="/instances/{instance_id}/kanban",
    tags=["kanban"],
)


@router.get("/capabilities", response_model=KanbanCapabilities)
async def get_kanban_capabilities(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanCapabilities:
    return await KanbanService(settings, session).get_capabilities(instance_id)


@router.get("/boards", response_model=KanbanBoardListResponse)
async def list_kanban_boards(
    instance_id: str,
    include_archived: bool = Query(default=False, alias="includeArchived"),
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanBoardListResponse:
    return await KanbanService(settings, session).list_boards(
        instance_id,
        include_archived=include_archived,
    )


@router.post("/boards", response_model=KanbanBoard, status_code=status.HTTP_201_CREATED)
async def create_kanban_board(
    instance_id: str,
    body: CreateKanbanBoardInput,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanBoard:
    return await KanbanService(settings, session).create_board(instance_id, body)


@router.delete("/boards/{board_slug}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_kanban_board(
    instance_id: str,
    board_slug: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    await KanbanService(settings, session).archive_board(instance_id, board_slug)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/boards/{board_slug}/tasks", response_model=KanbanTaskListResponse)
async def list_kanban_tasks(
    instance_id: str,
    board_slug: str,
    status_filter: str | None = Query(default=None, alias="status"),
    assignee: str | None = None,
    tenant: str | None = None,
    include_archived: bool = Query(default=False, alias="includeArchived"),
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanTaskListResponse:
    return await KanbanService(settings, session).list_tasks(
        instance_id,
        board_slug,
        status=status_filter,
        assignee=assignee,
        tenant=tenant,
        include_archived=include_archived,
    )


@router.post(
    "/boards/{board_slug}/tasks",
    response_model=KanbanTask,
    status_code=status.HTTP_201_CREATED,
)
async def create_kanban_task(
    instance_id: str,
    board_slug: str,
    body: CreateKanbanTaskInput,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanTask:
    return await KanbanService(settings, session).create_task(instance_id, board_slug, body)


@router.get("/boards/{board_slug}/tasks/{task_id}", response_model=KanbanTaskDetail)
async def get_kanban_task(
    instance_id: str,
    board_slug: str,
    task_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanTaskDetail:
    return await KanbanService(settings, session).get_task(instance_id, board_slug, task_id)


@router.post("/boards/{board_slug}/tasks/{task_id}/actions", response_model=KanbanTask)
async def execute_kanban_task_action(
    instance_id: str,
    board_slug: str,
    task_id: str,
    body: KanbanTaskActionInput,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanTask:
    return await KanbanService(settings, session).execute_action(
        instance_id,
        board_slug,
        task_id,
        body,
    )


@router.post(
    "/boards/{board_slug}/tasks/{task_id}/comments",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def add_kanban_comment(
    instance_id: str,
    board_slug: str,
    task_id: str,
    body: KanbanCommentCreate,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    await KanbanService(settings, session).add_comment(instance_id, board_slug, task_id, body)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/boards/{board_slug}/assignees", response_model=KanbanAssigneeListResponse)
async def list_kanban_assignees(
    instance_id: str,
    board_slug: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanAssigneeListResponse:
    return await KanbanService(settings, session).list_assignees(instance_id, board_slug)


@router.post("/boards/{board_slug}/dispatch", response_model=KanbanDispatchResult)
async def dispatch_kanban(
    instance_id: str,
    board_slug: str,
    body: KanbanDispatchRequest | None = None,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> KanbanDispatchResult:
    return await KanbanService(settings, session).dispatch(
        instance_id,
        board_slug,
        body or KanbanDispatchRequest(),
    )
