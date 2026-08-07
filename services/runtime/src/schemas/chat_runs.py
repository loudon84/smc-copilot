"""Pydantic schemas for Chat Runtime v2 (Desktop camelCase contract)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatCreateRunBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client_run_id: str = Field(alias="clientRunId", min_length=1)
    instance_id: str = Field(alias="instanceId", min_length=1)
    session_id: str | None = Field(default=None, alias="sessionId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")


class ChatTurnContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    expert_id: str | None = Field(default=None, alias="expertId")
    team_id: str | None = Field(default=None, alias="teamId")
    skill_name: str | None = Field(default=None, alias="skillName")
    work_mode: str | None = Field(default=None, alias="workMode")
    permission_mode: str | None = Field(default=None, alias="permissionMode")
    invocation_source: str | None = Field(default=None, alias="invocationSource")


class ChatCreateTurnBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client_run_id: str | None = Field(default=None, alias="clientRunId")
    client_turn_id: str = Field(alias="clientTurnId", min_length=1)
    instance_id: str | None = Field(default=None, alias="instanceId")
    session_id: str | None = Field(default=None, alias="sessionId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")
    message: str = Field(min_length=1)
    model_id: str | None = Field(default=None, alias="modelId")
    attachment_ids: list[str] = Field(default_factory=list, alias="attachmentIds")
    context: ChatTurnContext | None = None


class ChatAcceptedResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    accepted: bool = True
    run_id: str = Field(alias="runId")
    turn_id: str = Field(default="", alias="turnId")
    event_cursor: int = Field(default=0, alias="eventCursor")


class ChatClarifyRespondBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    turn_id: str = Field(alias="turnId")
    type: Literal["clarify"] = "clarify"
    answer: str


class ChatApprovalRespondBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    turn_id: str = Field(alias="turnId")
    type: Literal["approval"] = "approval"
    decision: Literal["approved", "denied"]
    reason: str | None = None


ChatInteractionRespondBody = ChatClarifyRespondBody | ChatApprovalRespondBody


class ChatQueueCreateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    status: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class ChatQueuePatchBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    status: str | None = None
    payload: dict[str, Any] | None = None


class ChatRunResponse(BaseModel):
    """GET /chat-runs/{runId} response."""

    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    id: str | None = None
    client_run_id: str = Field(alias="clientRunId")
    instance_id: str = Field(alias="instanceId")
    session_id: str | None = Field(default=None, alias="sessionId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")
    status: str
    event_cursor: int = Field(default=0, alias="eventCursor")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    completed_at: str | None = Field(default=None, alias="completedAt")


class ChatEventResponse(BaseModel):
    """Single durable chat-run event as returned by list/snapshot APIs."""

    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(alias="eventId")
    id: str | None = None
    sequence: int
    run_id: str = Field(alias="runId")
    turn_id: str = Field(default="", alias="turnId")
    type: str
    event_type: str | None = Field(default=None, alias="eventType")
    timestamp: str | None = None
    created_at: str | None = Field(default=None, alias="createdAt")
    instance_id: str | None = Field(default=None, alias="instanceId")
    session_id: str | None = Field(default=None, alias="sessionId")
    payload: dict[str, Any] = Field(default_factory=dict)


class ChatQueueEntryResponse(BaseModel):
    """Queue entry as returned by queue CRUD APIs."""

    model_config = ConfigDict(populate_by_name=True)

    queue_id: str = Field(alias="queueId")
    id: str | None = None
    run_id: str = Field(alias="runId")
    status: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    ok: bool | None = None


class ChatSnapshotResponse(BaseModel):
    """GET /chat-runs/{runId}/snapshot response."""

    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    session_id: str | None = Field(default=None, alias="sessionId")
    status: str
    event_cursor: int = Field(default=0, alias="eventCursor")
    events: list[ChatEventResponse] = Field(default_factory=list)
    queue: list[ChatQueueEntryResponse] = Field(default_factory=list)


class ChatAbortResponse(BaseModel):
    """POST /chat-runs/{runId}/abort response."""

    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    run_id: str = Field(alias="runId")
    status: str
    cancelled_turns: list[str] = Field(default_factory=list, alias="cancelledTurns")


class ChatInteractionResponse(BaseModel):
    """POST /chat-runs/{runId}/interactions/{requestId}/respond response."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    accepted: bool = True
    request_id: str = Field(alias="requestId")
    status: str
    already_resolved: bool | None = Field(default=None, alias="alreadyResolved")
    turn_id: str | None = Field(default=None, alias="turnId")
    interaction_type: str | None = Field(default=None, alias="interactionType")
    response: dict[str, Any] | None = None
