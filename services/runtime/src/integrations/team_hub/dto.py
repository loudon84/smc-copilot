from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RemoteAssignmentDTO:
    remote_task_id: str
    assignment_id: str
    title: str
    task_type: str
    description: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    source_agent_id: str | None = None
    target_agent_id: str | None = None
    workspace_id: str | None = None
