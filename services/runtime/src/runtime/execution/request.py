"""Agent execution request (PRD v1.3 §12.1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class AgentExecutionRequest:
    execution_id: str
    profile_id: str | None = None
    instance_id: str | None = None
    session_id: str | None = None
    input: str = ""
    model_id: str | None = None
    workspace_id: str | None = None
    attachment_ids: list[str] = field(default_factory=list)
    tool_policy: dict[str, Any] | None = None
    data_policy: dict[str, Any] | None = None
    approval_policy: dict[str, Any] | None = None
    context: dict[str, Any] | None = None
    messages: list[dict[str, str]] | None = None
