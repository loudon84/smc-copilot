"""Unified agent execution events (PRD v1.3 §12.2)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

AgentExecutionEventType = Literal[
    "session.started",
    "agent.message.delta",
    "agent.message.completed",
    "reasoning.delta",
    "reasoning.completed",
    "tool.started",
    "tool.progress",
    "tool.completed",
    "tool.failed",
    "interaction.clarify",
    "interaction.approval",
    "usage.updated",
    "artifact.created",
    "execution.completed",
    "execution.failed",
    "execution.cancelled",
]


@dataclass(slots=True)
class AgentExecutionEvent:
    type: AgentExecutionEventType
    payload: dict[str, Any] = field(default_factory=dict)
