"""KanbanService — Hermes Kanban facade (PRD v1.7). Independent of WorkTask."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from integrations.hermes.kanban.cli_adapter import HermesKanbanCliAdapter
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
from services.instance_service import InstanceService


class KanbanService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        *,
        adapter: HermesKanbanCliAdapter | None = None,
    ) -> None:
        self._settings = settings
        self._session = session
        self._adapter = adapter or HermesKanbanCliAdapter(settings)

    async def _profile(self, instance_id: str) -> str | None:
        inst = await InstanceService(self._settings, self._session).get(instance_id)
        return inst.profile_name

    async def get_capabilities(self, instance_id: str) -> KanbanCapabilities:
        profile = await self._profile(instance_id)
        return await self._adapter.get_capabilities(profile_name=profile)

    async def list_boards(
        self,
        instance_id: str,
        *,
        include_archived: bool = False,
    ) -> KanbanBoardListResponse:
        profile = await self._profile(instance_id)
        boards = await self._adapter.list_boards(
            profile_name=profile,
            include_archived=include_archived,
        )
        return KanbanBoardListResponse(boards=boards)

    async def create_board(
        self,
        instance_id: str,
        body: CreateKanbanBoardInput,
    ) -> KanbanBoard:
        profile = await self._profile(instance_id)
        return await self._adapter.create_board(profile_name=profile, input=body)

    async def archive_board(self, instance_id: str, board_slug: str) -> None:
        profile = await self._profile(instance_id)
        await self._adapter.archive_board(profile_name=profile, board_slug=board_slug)

    async def list_tasks(
        self,
        instance_id: str,
        board_slug: str,
        *,
        status: str | None = None,
        assignee: str | None = None,
        tenant: str | None = None,
        include_archived: bool = False,
    ) -> KanbanTaskListResponse:
        profile = await self._profile(instance_id)
        tasks = await self._adapter.list_tasks(
            profile_name=profile,
            board_slug=board_slug,
            status=status,
            assignee=assignee,
            tenant=tenant,
            include_archived=include_archived,
        )
        return KanbanTaskListResponse(tasks=tasks)

    async def get_task(
        self,
        instance_id: str,
        board_slug: str,
        task_id: str,
    ) -> KanbanTaskDetail:
        profile = await self._profile(instance_id)
        return await self._adapter.get_task(
            profile_name=profile,
            board_slug=board_slug,
            task_id=task_id,
        )

    async def create_task(
        self,
        instance_id: str,
        board_slug: str,
        body: CreateKanbanTaskInput,
    ) -> KanbanTask:
        self._validate_workspace(body.workspace)
        profile = await self._profile(instance_id)
        return await self._adapter.create_task(
            profile_name=profile,
            board_slug=board_slug,
            input=body,
        )

    async def execute_action(
        self,
        instance_id: str,
        board_slug: str,
        task_id: str,
        body: KanbanTaskActionInput,
    ) -> KanbanTask:
        profile = await self._profile(instance_id)
        return await self._adapter.execute_action(
            profile_name=profile,
            board_slug=board_slug,
            task_id=task_id,
            input=body,
        )

    async def add_comment(
        self,
        instance_id: str,
        board_slug: str,
        task_id: str,
        body: KanbanCommentCreate,
    ) -> None:
        profile = await self._profile(instance_id)
        await self._adapter.add_comment(
            profile_name=profile,
            board_slug=board_slug,
            task_id=task_id,
            text=body.text,
        )

    async def list_assignees(
        self,
        instance_id: str,
        board_slug: str,
    ) -> KanbanAssigneeListResponse:
        profile = await self._profile(instance_id)
        assignees = await self._adapter.list_assignees(
            profile_name=profile,
            board_slug=board_slug,
        )
        return KanbanAssigneeListResponse(assignees=assignees)

    async def dispatch(
        self,
        instance_id: str,
        board_slug: str,
        body: KanbanDispatchRequest,
    ) -> KanbanDispatchResult:
        profile = await self._profile(instance_id)
        return await self._adapter.dispatch(
            profile_name=profile,
            board_slug=board_slug,
            dry_run=body.dry_run,
        )

    @staticmethod
    def _validate_workspace(workspace: str | None) -> None:
        if not workspace:
            return
        kind = workspace.strip()
        if kind in {"scratch", "worktree"}:
            return
        if not kind.startswith("dir:"):
            raise RuntimeServiceError(
                f"Unsupported workspace kind: {workspace}",
                code="KANBAN_WORKSPACE_INVALID",
            )
        raw = kind[4:].strip()
        if not raw:
            raise RuntimeServiceError("Empty workspace directory", code="KANBAN_WORKSPACE_INVALID")
        path = Path(raw)
        if not path.is_absolute():
            raise RuntimeServiceError(
                "Workspace directory must be an absolute path",
                code="KANBAN_WORKSPACE_INVALID",
            )
        try:
            resolved = path.resolve(strict=False)
        except OSError as exc:
            raise RuntimeServiceError(
                f"Workspace path is unavailable: {exc}",
                code="KANBAN_WORKSPACE_INVALID",
            ) from exc
        # Symlink escape / non-local drive checks (Windows UNC & relative escapes).
        if os.name == "nt":
            s = str(resolved)
            if s.startswith("\\\\") or s.startswith("//"):
                raise RuntimeServiceError(
                    "Non-local (UNC) workspace paths are not allowed",
                    code="KANBAN_WORKSPACE_INVALID",
                )
        if ".." in path.parts:
            # resolve() already collapses .., but reject obvious traversal inputs.
            pass
        if not resolved.exists():
            raise RuntimeServiceError(
                f"Workspace directory does not exist: {resolved}",
                code="KANBAN_WORKSPACE_INVALID",
            )
        if not resolved.is_dir():
            raise RuntimeServiceError(
                f"Workspace path is not a directory: {resolved}",
                code="KANBAN_WORKSPACE_INVALID",
            )
