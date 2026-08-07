"""Task event type validation tests (PRD v1.3 Phase 4)."""

from __future__ import annotations

import pytest

from schemas.task_events import TASK_EVENT_TYPES, validate_task_event_type


def test_task_event_types_count() -> None:
    assert len(TASK_EVENT_TYPES) == 21


def test_validate_task_event_type_accepts_official_types() -> None:
    assert validate_task_event_type("task.created") == "task.created"
    assert validate_task_event_type("task.interrupted") == "task.interrupted"


def test_validate_task_event_type_rejects_unknown() -> None:
    with pytest.raises(ValueError, match="unknown task event type"):
        validate_task_event_type("task.progress")
