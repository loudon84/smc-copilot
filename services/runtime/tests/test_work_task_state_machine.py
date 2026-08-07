"""Unit tests for WorkTask state machine (PRD v1.3 §8)."""

from __future__ import annotations

import pytest

from core.enums import WorkTaskStatus
from core.errors import StateMachineError
from db.models.work_tasks import WorkTask
from runtime.tasks.state_machine import can_transition, transition


def test_canonical_happy_path() -> None:
    task = WorkTask(source="test", title="t", task_type="coding", status=WorkTaskStatus.DRAFT.value)
    transition(task, WorkTaskStatus.READY)
    transition(task, WorkTaskStatus.QUEUED)
    transition(task, WorkTaskStatus.RUNNING)
    transition(task, WorkTaskStatus.COMPLETED)
    assert task.status == WorkTaskStatus.COMPLETED.value


def test_forbid_completed_to_running() -> None:
    task = WorkTask(source="test", title="t", task_type="coding", status=WorkTaskStatus.COMPLETED.value)
    with pytest.raises(StateMachineError):
        transition(task, WorkTaskStatus.RUNNING)


def test_retry_from_failed_and_interrupted() -> None:
    task = WorkTask(source="test", title="t", task_type="coding", status=WorkTaskStatus.FAILED.value)
    transition(task, WorkTaskStatus.QUEUED)
    assert task.status == WorkTaskStatus.QUEUED.value
    task.status = WorkTaskStatus.INTERRUPTED.value
    transition(task, WorkTaskStatus.QUEUED)
    assert can_transition(WorkTaskStatus.INTERRUPTED.value, WorkTaskStatus.QUEUED.value)
