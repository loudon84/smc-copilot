"""Pydantic schemas for Hermes Kanban facade (PRD v1.7).

KanbanTask is independent of WorkTask — Hermes Agent remains the SOT.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

KanbanTaskActionLiteral = Literal[
    "assign",
    "complete",
    "block",
    "unblock",
    "archive",
    "reclaim",
    "promote",
    "schedule",
    "specify",
    "decompose",
    "link",
    "unlink",
]

KanbanStatusLiteral = Literal[
    "triage",
    "todo",
    "scheduled",
    "ready",
    "running",
    "blocked",
    "review",
    "done",
    "archived",
]


class KanbanCapabilities(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    supported: bool = True
    transport: Literal["cli", "plugin"] = "cli"
    live_events: bool = Field(default=False, alias="liveEvents")
    supports_dispatch: bool = Field(default=True, alias="supportsDispatch")
    supports_workspace_dir: bool = Field(default=True, alias="supportsWorkspaceDir")
    supports_decompose: bool = Field(default=True, alias="supportsDecompose")
    supports_attachments: bool = Field(default=True, alias="supportsAttachments")


class KanbanBoard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug: str
    name: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_current: bool = Field(default=False, alias="isCurrent")
    archived: bool = False
    total: int = 0
    counts: dict[str, int] = Field(default_factory=dict)
    db_path: str | None = Field(default=None, alias="dbPath")


class CreateKanbanBoardInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug: str = Field(min_length=1)
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None


class KanbanTask(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    body: str | None = None
    assignee: str | None = None
    status: str
    priority: int = 0
    tenant: str | None = None
    workspace_kind: str = Field(default="scratch", alias="workspaceKind")
    workspace_path: str | None = Field(default=None, alias="workspacePath")
    created_by: str | None = Field(default=None, alias="createdBy")
    created_at: float | None = Field(default=None, alias="createdAt")
    started_at: float | None = Field(default=None, alias="startedAt")
    completed_at: float | None = Field(default=None, alias="completedAt")
    result: str | None = None
    skills: list[str] = Field(default_factory=list)
    max_retries: int | None = Field(default=None, alias="maxRetries")
    allowed_actions: list[KanbanTaskActionLiteral] = Field(
        default_factory=list,
        alias="allowedActions",
    )


class CreateKanbanTaskInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1)
    body: str | None = None
    assignee: str | None = None
    priority: int | None = None
    tenant: str | None = None
    workspace: str | None = None  # scratch | worktree | dir:<path>
    triage: bool = False
    skills: list[str] = Field(default_factory=list)
    max_retries: int | None = Field(default=None, alias="maxRetries")


class KanbanComment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    task_id: str = Field(alias="taskId")
    author: str | None = None
    body: str
    created_at: float = Field(alias="createdAt")


class KanbanEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    task_id: str = Field(alias="taskId")
    kind: str
    payload: dict[str, Any] | None = None
    created_at: float = Field(alias="createdAt")
    run_id: int | None = Field(default=None, alias="runId")


class KanbanRun(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    task_id: str = Field(alias="taskId")
    profile: str | None = None
    status: str | None = None
    outcome: str | None = None
    summary: str | None = None
    error: str | None = None
    started_at: float | None = Field(default=None, alias="startedAt")
    ended_at: float | None = Field(default=None, alias="endedAt")
    last_heartbeat_at: float | None = Field(default=None, alias="lastHeartbeatAt")


class KanbanTaskDetail(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task: KanbanTask
    comments: list[KanbanComment] = Field(default_factory=list)
    events: list[KanbanEvent] = Field(default_factory=list)
    parents: list[str] = Field(default_factory=list)
    children: list[str] = Field(default_factory=list)
    runs: list[KanbanRun] = Field(default_factory=list)
    latest_summary: str | None = Field(default=None, alias="latestSummary")


class KanbanCommentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(min_length=1)


class KanbanDispatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dry_run: bool = Field(default=False, alias="dryRun")


class KanbanDispatchResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dry_run: bool = Field(default=False, alias="dryRun")
    claimed: int = 0
    started: int = 0
    skipped: int = 0
    details: dict[str, Any] | None = None


class KanbanAssignee(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    profile: str | None = None
    available: bool = True


class KanbanTaskActionInput(BaseModel):
    """Unified task action payload (PRD §25). Extra fields are action-specific."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    action: KanbanTaskActionLiteral
    assignee: str | None = None
    result: str | None = None
    reason: str | None = None
    at: str | None = None
    parent_id: str | None = Field(default=None, alias="parentId")


class KanbanBoardListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    boards: list[KanbanBoard] = Field(default_factory=list)


class KanbanTaskListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tasks: list[KanbanTask] = Field(default_factory=list)


class KanbanAssigneeListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assignees: list[KanbanAssignee] = Field(default_factory=list)
