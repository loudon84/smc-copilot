"""Durable WorkTask event models (PRD v1.3 §14) — validated before persistence."""

from __future__ import annotations

TASK_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "task.created",
        "task.updated",
        "task.queued",
        "task.started",
        "task.message.delta",
        "task.message.completed",
        "task.reasoning.delta",
        "task.tool.started",
        "task.tool.progress",
        "task.tool.completed",
        "task.tool.failed",
        "task.approval.requested",
        "task.approval.resolved",
        "task.input.requested",
        "task.input.resolved",
        "task.artifact.created",
        "task.usage.updated",
        "task.completed",
        "task.failed",
        "task.cancelled",
        "task.interrupted",
    }
)


def validate_task_event_type(event_type: str) -> str:
    """Validate event_type is a known durable task event; raise ValueError otherwise."""
    if event_type not in TASK_EVENT_TYPES:
        raise ValueError(f"unknown task event type: {event_type}")
    return event_type
