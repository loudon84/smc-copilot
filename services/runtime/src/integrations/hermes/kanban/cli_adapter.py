"""CLI-backed Hermes Kanban adapter (PRD v1.7 P0)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.config import Settings
from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError
from integrations.hermes.cli_adapter import HermesCliAdapter
from integrations.hermes.kanban import command_builder as cb
from integrations.hermes.kanban.allowed_actions import allowed_actions_for_status
from integrations.hermes.kanban.errors import map_executable_missing, raise_for_cli_failure
from schemas.kanban import (
    CreateKanbanBoardInput,
    CreateKanbanTaskInput,
    KanbanAssignee,
    KanbanBoard,
    KanbanCapabilities,
    KanbanComment,
    KanbanDispatchResult,
    KanbanEvent,
    KanbanRun,
    KanbanTask,
    KanbanTaskActionInput,
    KanbanTaskDetail,
)

logger = get_logger(__name__)

_TIMEOUT_READ = 10.0
_TIMEOUT_ACTION = 20.0
_TIMEOUT_DISPATCH = 30.0
_TIMEOUT_SPECIFY = 120.0


class HermesKanbanCliAdapter:
    """Execute `hermes kanban` via HermesCliAdapter; never touch kanban.db."""

    def __init__(
        self,
        settings: Settings,
        *,
        cli: HermesCliAdapter | None = None,
        cwd: Path | None = None,
    ) -> None:
        self._settings = settings
        self._cli = cli or HermesCliAdapter(settings)
        self._cwd = cwd

    async def get_capabilities(self, *, profile_name: str | None) -> KanbanCapabilities:
        _ = profile_name
        try:
            code, out, err = await self._cli.run_profile(
                profile_name,
                ["kanban", "--help"],
                timeout=_TIMEOUT_READ,
                cwd=self._cwd,
            )
            supported = code == 0 or "kanban" in (out + err).lower()
        except RuntimeServiceError as exc:
            if exc.code in {"hermes_executable_missing", "HERMES_NOT_INSTALLED"}:
                return KanbanCapabilities(supported=False, transport="cli", liveEvents=False)
            raise
        except FileNotFoundError:
            return KanbanCapabilities(supported=False, transport="cli", liveEvents=False)
        return KanbanCapabilities(
            supported=supported,
            transport="cli",
            liveEvents=False,
            supportsDispatch=True,
            supportsWorkspaceDir=True,
            supportsDecompose=True,
            supportsAttachments=True,
        )

    async def list_boards(
        self,
        *,
        profile_name: str | None,
        include_archived: bool = False,
    ) -> list[KanbanBoard]:
        data = await self._run_json(
            profile_name,
            cb.boards_list(include_archived=include_archived),
            timeout=_TIMEOUT_READ,
            default_code="KANBAN_BOARD_NOT_FOUND",
        )
        items = data if isinstance(data, list) else data.get("boards", []) if isinstance(data, dict) else []
        return [self._map_board(item) for item in items if isinstance(item, dict)]

    async def create_board(
        self,
        *,
        profile_name: str | None,
        input: CreateKanbanBoardInput,
    ) -> KanbanBoard:
        await self._run(
            profile_name,
            cb.boards_create(input),
            timeout=_TIMEOUT_ACTION,
            default_code="KANBAN_BOARD_NOT_FOUND",
        )
        boards = await self.list_boards(profile_name=profile_name, include_archived=True)
        for board in boards:
            if board.slug == input.slug:
                return board
        return KanbanBoard(slug=input.slug, name=input.name or input.slug)

    async def archive_board(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        hard_delete: bool = False,
    ) -> None:
        await self._run(
            profile_name,
            cb.boards_remove(board_slug, hard_delete=hard_delete),
            timeout=_TIMEOUT_ACTION,
            default_code="KANBAN_BOARD_NOT_FOUND",
        )

    async def list_tasks(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        status: str | None = None,
        assignee: str | None = None,
        tenant: str | None = None,
        include_archived: bool = False,
    ) -> list[KanbanTask]:
        data = await self._run_json(
            profile_name,
            cb.list_tasks(
                board_slug,
                status=status,
                assignee=assignee,
                tenant=tenant,
                include_archived=include_archived,
            ),
            timeout=_TIMEOUT_READ,
            default_code="KANBAN_TASK_NOT_FOUND",
        )
        items = data if isinstance(data, list) else data.get("tasks", []) if isinstance(data, dict) else []
        return [self._map_task(item) for item in items if isinstance(item, dict)]

    async def get_task(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        task_id: str,
    ) -> KanbanTaskDetail:
        data = await self._run_json(
            profile_name,
            cb.show_task(board_slug, task_id),
            timeout=_TIMEOUT_READ,
            default_code="KANBAN_TASK_NOT_FOUND",
        )
        if not isinstance(data, dict):
            raise RuntimeServiceError("Unexpected kanban show payload", code="KANBAN_TASK_NOT_FOUND")
        task_raw = data.get("task") if isinstance(data.get("task"), dict) else data
        assert isinstance(task_raw, dict)
        return KanbanTaskDetail(
            task=self._map_task(task_raw),
            comments=[self._map_comment(c) for c in data.get("comments") or [] if isinstance(c, dict)],
            events=[self._map_event(e) for e in data.get("events") or [] if isinstance(e, dict)],
            parents=[str(p) for p in data.get("parents") or []],
            children=[str(c) for c in data.get("children") or []],
            runs=[self._map_run(r) for r in data.get("runs") or [] if isinstance(r, dict)],
            latestSummary=data.get("latest_summary") or data.get("latestSummary"),
        )

    async def create_task(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        input: CreateKanbanTaskInput,
    ) -> KanbanTask:
        data = await self._run_json(
            profile_name,
            cb.create_task(board_slug, input),
            timeout=_TIMEOUT_ACTION,
            default_code="KANBAN_DISPATCH_FAILED",
        )
        task_id = ""
        if isinstance(data, dict):
            task_id = str(data.get("id") or data.get("task_id") or "")
            if isinstance(data.get("task"), dict):
                return self._map_task(data["task"])
        if not task_id:
            raise RuntimeServiceError("Kanban create returned no task id", code="KANBAN_DISPATCH_FAILED")
        detail = await self.get_task(profile_name=profile_name, board_slug=board_slug, task_id=task_id)
        return detail.task

    async def execute_action(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        task_id: str,
        input: KanbanTaskActionInput,
    ) -> KanbanTask:
        try:
            args = cb.action_args(board_slug, task_id, input)
        except ValueError as exc:
            raise RuntimeServiceError(str(exc), code="KANBAN_INVALID_TRANSITION") from exc
        timeout = _TIMEOUT_SPECIFY if input.action in {"specify", "decompose"} else _TIMEOUT_ACTION
        await self._run(
            profile_name,
            args,
            timeout=timeout,
            default_code="KANBAN_INVALID_TRANSITION",
        )
        detail = await self.get_task(profile_name=profile_name, board_slug=board_slug, task_id=task_id)
        return detail.task

    async def add_comment(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        task_id: str,
        text: str,
    ) -> None:
        await self._run(
            profile_name,
            cb.comment(board_slug, task_id, text),
            timeout=_TIMEOUT_ACTION,
            default_code="KANBAN_TASK_NOT_FOUND",
        )

    async def list_assignees(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
    ) -> list[KanbanAssignee]:
        data = await self._run_json(
            profile_name,
            cb.assignees(board_slug),
            timeout=_TIMEOUT_READ,
            default_code="KANBAN_DISPATCH_FAILED",
        )
        items = data if isinstance(data, list) else data.get("assignees", []) if isinstance(data, dict) else []
        result: list[KanbanAssignee] = []
        for item in items:
            if isinstance(item, str):
                result.append(KanbanAssignee(name=item, profile=item, available=True))
            elif isinstance(item, dict):
                name = str(item.get("name") or item.get("profile") or item.get("id") or "")
                if name:
                    result.append(
                        KanbanAssignee(
                            name=name,
                            profile=item.get("profile"),
                            available=bool(item.get("available", True)),
                        )
                    )
        return result

    async def dispatch(
        self,
        *,
        profile_name: str | None,
        board_slug: str,
        dry_run: bool = False,
    ) -> KanbanDispatchResult:
        data = await self._run_json(
            profile_name,
            cb.dispatch(board_slug, dry_run=dry_run),
            timeout=_TIMEOUT_DISPATCH,
            default_code="KANBAN_DISPATCH_FAILED",
        )
        if not isinstance(data, dict):
            return KanbanDispatchResult(dryRun=dry_run, details={"raw": data})
        return KanbanDispatchResult(
            dryRun=bool(data.get("dry_run", data.get("dryRun", dry_run))),
            claimed=int(data.get("claimed") or 0),
            started=int(data.get("started") or 0),
            skipped=int(data.get("skipped") or 0),
            details=data,
        )

    async def _run(
        self,
        profile_name: str | None,
        kanban_args: list[str],
        *,
        timeout: float,
        default_code: str,
    ) -> tuple[str, str]:
        try:
            code, out, err = await self._cli.run_profile(
                profile_name,
                ["kanban", *kanban_args],
                timeout=timeout,
                cwd=self._cwd,
            )
        except RuntimeServiceError as exc:
            if "timed out" in str(exc).lower() or exc.code == "hermes_install_failed":
                raise RuntimeServiceError(str(exc), code="KANBAN_TIMEOUT") from exc
            if exc.code == "hermes_executable_missing":
                raise map_executable_missing(exc) from exc
            raise
        except FileNotFoundError as exc:
            raise map_executable_missing(exc) from exc
        raise_for_cli_failure(exit_code=code, stdout=out, stderr=err, default_code=default_code)
        return out, err

    async def _run_json(
        self,
        profile_name: str | None,
        kanban_args: list[str],
        *,
        timeout: float,
        default_code: str,
    ) -> Any:
        out, err = await self._run(
            profile_name,
            kanban_args,
            timeout=timeout,
            default_code=default_code,
        )
        text = out.strip() or err.strip()
        if not text:
            return {}
        # Hermes sometimes prints logs before JSON — take the last JSON blob.
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            start_arr = text.find("[")
            if start_arr >= 0 and (start < 0 or start_arr < start):
                start = start_arr
            if start >= 0:
                try:
                    return json.loads(text[start:])
                except json.JSONDecodeError:
                    pass
            raise RuntimeServiceError(
                f"Failed to parse Hermes kanban JSON: {text[:500]}",
                code=default_code,
            ) from None

    @staticmethod
    def _map_board(raw: dict[str, Any]) -> KanbanBoard:
        counts_raw = raw.get("counts") or {}
        counts = {str(k): int(v) for k, v in counts_raw.items()} if isinstance(counts_raw, dict) else {}
        return KanbanBoard(
            slug=str(raw.get("slug") or ""),
            name=str(raw.get("name") or raw.get("slug") or ""),
            description=raw.get("description"),
            icon=raw.get("icon"),
            color=raw.get("color"),
            isCurrent=bool(raw.get("is_current", raw.get("isCurrent", False))),
            archived=bool(raw.get("archived", False)),
            total=int(raw.get("total") or sum(counts.values()) or 0),
            counts=counts,
            dbPath=raw.get("db_path") or raw.get("dbPath"),
        )

    @staticmethod
    def _map_task(raw: dict[str, Any]) -> KanbanTask:
        status = str(raw.get("status") or "todo")
        skills_raw = raw.get("skills") or []
        skills = [str(s) for s in skills_raw] if isinstance(skills_raw, list) else []
        return KanbanTask(
            id=str(raw.get("id") or ""),
            title=str(raw.get("title") or ""),
            body=raw.get("body"),
            assignee=raw.get("assignee"),
            status=status,
            priority=int(raw.get("priority") or 0),
            tenant=raw.get("tenant"),
            workspaceKind=str(raw.get("workspace_kind") or raw.get("workspaceKind") or "scratch"),
            workspacePath=raw.get("workspace_path") or raw.get("workspacePath"),
            createdBy=raw.get("created_by") or raw.get("createdBy"),
            createdAt=_as_float(raw.get("created_at") or raw.get("createdAt")),
            startedAt=_as_float(raw.get("started_at") or raw.get("startedAt")),
            completedAt=_as_float(raw.get("completed_at") or raw.get("completedAt")),
            result=raw.get("result"),
            skills=skills,
            maxRetries=_as_int(raw.get("max_retries") or raw.get("maxRetries")),
            allowedActions=allowed_actions_for_status(status),
        )

    @staticmethod
    def _map_comment(raw: dict[str, Any]) -> KanbanComment:
        return KanbanComment(
            id=int(raw.get("id") or 0),
            taskId=str(raw.get("task_id") or raw.get("taskId") or ""),
            author=raw.get("author"),
            body=str(raw.get("body") or ""),
            createdAt=float(raw.get("created_at") or raw.get("createdAt") or 0),
        )

    @staticmethod
    def _map_event(raw: dict[str, Any]) -> KanbanEvent:
        payload = raw.get("payload")
        return KanbanEvent(
            id=int(raw.get("id") or 0),
            taskId=str(raw.get("task_id") or raw.get("taskId") or ""),
            kind=str(raw.get("kind") or ""),
            payload=payload if isinstance(payload, dict) else None,
            createdAt=float(raw.get("created_at") or raw.get("createdAt") or 0),
            runId=_as_int(raw.get("run_id") or raw.get("runId")),
        )

    @staticmethod
    def _map_run(raw: dict[str, Any]) -> KanbanRun:
        return KanbanRun(
            id=int(raw.get("id") or 0),
            taskId=str(raw.get("task_id") or raw.get("taskId") or ""),
            profile=raw.get("profile"),
            status=raw.get("status"),
            outcome=raw.get("outcome"),
            summary=raw.get("summary"),
            error=raw.get("error"),
            startedAt=_as_float(raw.get("started_at") or raw.get("startedAt")),
            endedAt=_as_float(raw.get("ended_at") or raw.get("endedAt")),
            lastHeartbeatAt=_as_float(raw.get("last_heartbeat_at") or raw.get("lastHeartbeatAt")),
        )


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
