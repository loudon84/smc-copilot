"""Hermes Kanban adapter protocol (PRD v1.7)."""

from __future__ import annotations

from typing import Any, Protocol

from schemas.kanban import (
    CreateKanbanBoardInput,
    CreateKanbanTaskInput,
    KanbanAssignee,
    KanbanBoard,
    KanbanCapabilities,
    KanbanDispatchResult,
    KanbanTask,
    KanbanTaskActionInput,
    KanbanTaskDetail,
)


class HermesKanbanAdapter(Protocol):
    async def get_capabilities(self, *, profile_name: str | None) -> KanbanCapabilities: ...

    async def list_boards(
        self,
        *,
        profile_name: str | None,
        include_archived: bool = False,
    ) -> list[KanbanBoard]: ...

    async def create_board(
        self,
        *,
        profile_name: str | None,
        input: CreateKanbanBoardInput,
    ) -> KanbanBoard: ...

    async def archive_board(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        hard_delete: bool = False,
    ) -> None: ...

    async def list_tasks(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        status: str | None = None,
        assignee: str | None = None,
        tenant: str | None = None,
        include_archived: bool = False,
    ) -> list[KanbanTask]: ...

    async def get_task(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        task_id: str,
    ) -> KanbanTaskDetail: ...

    async def create_task(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        input: CreateKanbanTaskInput,
    ) -> KanbanTask: ...

    async def execute_action(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        task_id: str,
        input: KanbanTaskActionInput,
    ) -> KanbanTask: ...

    async def add_comment(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        task_id: str,
        text: str,
    ) -> None: ...

    async def list_assignees(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
    ) -> list[KanbanAssignee]: ...

    async def dispatch(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        dry_run: bool = False,
    ) -> KanbanDispatchResult: ...
