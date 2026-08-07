from __future__ import annotations

from core.enums import TaskStatus
from core.errors import StateMachineError

_ALLOWED: dict[str, frozenset[str]] = {
    TaskStatus.REMOTE_ASSIGNED.value: frozenset({TaskStatus.LOCAL_CREATED.value}),
    TaskStatus.LOCAL_CREATED.value: frozenset(
        {
            TaskStatus.WAITING_APPROVAL.value,
            TaskStatus.APPROVED.value,
            TaskStatus.CANCELLED.value,
            TaskStatus.FAILED.value,
        }
    ),
    TaskStatus.WAITING_APPROVAL.value: frozenset(
        {
            TaskStatus.APPROVED.value,
            TaskStatus.FAILED.value,
            TaskStatus.CANCELLED.value,
        }
    ),
    TaskStatus.APPROVED.value: frozenset({TaskStatus.RUNNING.value, TaskStatus.CANCELLED.value, TaskStatus.FAILED.value}),
    TaskStatus.RUNNING.value: frozenset(
        {
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value,
            TaskStatus.CANCELLED.value,
            TaskStatus.NEED_HUMAN_INPUT.value,
        }
    ),
    TaskStatus.NEED_HUMAN_INPUT.value: frozenset(
        {
            TaskStatus.RUNNING.value,
            TaskStatus.CANCELLED.value,
            TaskStatus.FAILED.value,
        }
    ),
    TaskStatus.COMPLETED.value: frozenset({TaskStatus.SYNCED.value}),
    TaskStatus.FAILED.value: frozenset({TaskStatus.SYNCED.value}),
    TaskStatus.CANCELLED.value: frozenset({TaskStatus.SYNCED.value}),
}


def assert_transition_allowed(current: str, target: str) -> None:
    if current == target:
        return
    allowed = _ALLOWED.get(current)
    if allowed is None or target not in allowed:
        raise StateMachineError(f"Cannot transition task from {current} to {target}")
