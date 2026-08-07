"""Durable ChatRun event models (PRD v1.2 §16) — Discriminated Union by ``type``."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRunEventBase(BaseModel):
    """Envelope fields shared by all durable chat-run events."""

    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(alias="eventId")
    sequence: int
    run_id: str = Field(alias="runId")
    turn_id: str = Field(default="", alias="turnId")
    timestamp: str | None = None
    instance_id: str | None = Field(default=None, alias="instanceId")
    session_id: str | None = Field(default=None, alias="sessionId")
    payload: dict[str, Any] = Field(default_factory=dict)


class RunStartedEvent(ChatRunEventBase):
    type: Literal["run.started"] = "run.started"


class SessionStartedEvent(ChatRunEventBase):
    type: Literal["session.started"] = "session.started"


class MessageDeltaEvent(ChatRunEventBase):
    type: Literal["agent.message.delta"] = "agent.message.delta"


class MessageCompletedEvent(ChatRunEventBase):
    type: Literal["agent.message.completed"] = "agent.message.completed"


class ReasoningDeltaEvent(ChatRunEventBase):
    type: Literal["reasoning.delta"] = "reasoning.delta"


class ReasoningCompletedEvent(ChatRunEventBase):
    type: Literal["reasoning.completed"] = "reasoning.completed"


class ToolStartedEvent(ChatRunEventBase):
    type: Literal["tool.started"] = "tool.started"


class ToolProgressEvent(ChatRunEventBase):
    type: Literal["tool.progress"] = "tool.progress"


class ToolCompletedEvent(ChatRunEventBase):
    type: Literal["tool.completed"] = "tool.completed"


class ToolFailedEvent(ChatRunEventBase):
    type: Literal["tool.failed"] = "tool.failed"


class ClarifyRequestedEvent(ChatRunEventBase):
    type: Literal["clarify.requested"] = "clarify.requested"


class ClarifyResolvedEvent(ChatRunEventBase):
    type: Literal["clarify.resolved"] = "clarify.resolved"


class ApprovalRequestedEvent(ChatRunEventBase):
    type: Literal["approval.requested"] = "approval.requested"


class ApprovalResolvedEvent(ChatRunEventBase):
    type: Literal["approval.resolved"] = "approval.resolved"


class UsageUpdatedEvent(ChatRunEventBase):
    type: Literal["usage.updated"] = "usage.updated"


class ArtifactCreatedEvent(ChatRunEventBase):
    type: Literal["artifact.created"] = "artifact.created"


class TurnCompletedEvent(ChatRunEventBase):
    type: Literal["turn.completed"] = "turn.completed"


class TurnFailedEvent(ChatRunEventBase):
    type: Literal["turn.failed"] = "turn.failed"


class TurnCancelledEvent(ChatRunEventBase):
    type: Literal["turn.cancelled"] = "turn.cancelled"


class QueueChangedEvent(ChatRunEventBase):
    type: Literal["queue.changed"] = "queue.changed"


ChatRunEvent = Annotated[
    RunStartedEvent
    | SessionStartedEvent
    | MessageDeltaEvent
    | MessageCompletedEvent
    | ReasoningDeltaEvent
    | ReasoningCompletedEvent
    | ToolStartedEvent
    | ToolProgressEvent
    | ToolCompletedEvent
    | ToolFailedEvent
    | ClarifyRequestedEvent
    | ClarifyResolvedEvent
    | ApprovalRequestedEvent
    | ApprovalResolvedEvent
    | UsageUpdatedEvent
    | ArtifactCreatedEvent
    | TurnCompletedEvent
    | TurnFailedEvent
    | TurnCancelledEvent
    | QueueChangedEvent,
    Field(discriminator="type"),
]

CHAT_RUN_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "run.started",
        "session.started",
        "agent.message.delta",
        "agent.message.completed",
        "reasoning.delta",
        "reasoning.completed",
        "tool.started",
        "tool.progress",
        "tool.completed",
        "tool.failed",
        "clarify.requested",
        "clarify.resolved",
        "approval.requested",
        "approval.resolved",
        "usage.updated",
        "artifact.created",
        "turn.completed",
        "turn.failed",
        "turn.cancelled",
        "queue.changed",
    }
)


def validate_chat_run_event_type(event_type: str) -> str:
    """Validate event_type is a known durable chat-run event; raise ValueError otherwise."""
    if event_type not in CHAT_RUN_EVENT_TYPES:
        raise ValueError(f"unknown chat run event type: {event_type}")
    return event_type
