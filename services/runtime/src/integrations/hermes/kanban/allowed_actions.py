"""Derive allowedActions from Hermes Kanban task status (PRD §13)."""

from __future__ import annotations

from schemas.kanban import KanbanTaskActionLiteral

# Status → lifecycle verbs the Desktop may offer. Hermes CLI remains the
# ultimate enforcer; this list only drives UI affordances / drag targets.
_STATUS_ACTIONS: dict[str, list[KanbanTaskActionLiteral]] = {
    "triage": ["assign", "specify", "decompose", "schedule", "archive", "promote", "block"],
    "todo": ["assign", "promote", "schedule", "block", "archive", "link", "unlink"],
    "scheduled": ["assign", "promote", "block", "archive", "reclaim"],
    "ready": ["assign", "complete", "block", "schedule", "archive", "link", "unlink"],
    "running": ["reclaim", "block", "complete"],
    "blocked": ["unblock", "assign", "archive"],
    "review": ["complete", "reclaim", "block", "archive"],
    "done": ["archive"],
    "archived": [],
}


def allowed_actions_for_status(status: str) -> list[KanbanTaskActionLiteral]:
    key = (status or "").strip().lower()
    return list(_STATUS_ACTIONS.get(key, ["assign", "archive"]))
