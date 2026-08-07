"""WorkTask state machine (PRD v1.3 §8).

All status mutations must go through ``transition()``. Direct assignment is forbidden.
"""

from __future__ import annotations

from core.enums import WorkTaskStatus
from core.errors import StateMachineError
from db.models.work_tasks import WorkTask

# Canonical PRD transitions plus legacy compatibility edges used by existing executor paths.
_ALLOWED: dict[str, frozenset[str]] = {
    WorkTaskStatus.DRAFT.value: frozenset(
        {
            WorkTaskStatus.READY.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.PENDING.value: frozenset(
        {
            WorkTaskStatus.VALIDATING.value,
            WorkTaskStatus.READY.value,
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.VALIDATING.value: frozenset(
        {
            WorkTaskStatus.READY.value,
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.EXPIRED.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.READY.value: frozenset(
        {
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.CLAIMING.value,
            WorkTaskStatus.VALIDATING.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.QUEUED.value: frozenset(
        {
            WorkTaskStatus.CLAIMING.value,
            WorkTaskStatus.STARTING.value,
            WorkTaskStatus.VALIDATING.value,
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.INTERRUPTED.value,
        }
    ),
    WorkTaskStatus.CLAIMING.value: frozenset(
        {
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.READY.value,
            WorkTaskStatus.EXPIRED.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.STARTING.value: frozenset(
        {
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.INTERRUPTED.value,
            WorkTaskStatus.ORPHANED.value,
        }
    ),
    WorkTaskStatus.RUNNING.value: frozenset(
        {
            WorkTaskStatus.WAITING_APPROVAL.value,
            WorkTaskStatus.WAITING_INPUT.value,
            WorkTaskStatus.FINALIZING.value,
            WorkTaskStatus.COMPLETED.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.INTERRUPTED.value,
            WorkTaskStatus.ORPHANED.value,
            WorkTaskStatus.LEASE_AT_RISK.value,
            WorkTaskStatus.EXPIRED.value,
        }
    ),
    WorkTaskStatus.WAITING_APPROVAL.value: frozenset(
        {
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.INTERRUPTED.value,
            WorkTaskStatus.ORPHANED.value,
        }
    ),
    WorkTaskStatus.WAITING_INPUT.value: frozenset(
        {
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.INTERRUPTED.value,
        }
    ),
    WorkTaskStatus.FINALIZING.value: frozenset(
        {
            WorkTaskStatus.DELIVERING.value,
            WorkTaskStatus.COMPLETED.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.ORPHANED.value,
        }
    ),
    WorkTaskStatus.DELIVERING.value: frozenset(
        {
            WorkTaskStatus.COMPLETED.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.LEASE_AT_RISK.value: frozenset(
        {
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.EXPIRED.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.ORPHANED.value,
        }
    ),
    WorkTaskStatus.FAILED.value: frozenset(
        {
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.INTERRUPTED.value: frozenset(
        {
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.FAILED.value,
        }
    ),
    WorkTaskStatus.ORPHANED.value: frozenset(
        {
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.FAILED.value,
            WorkTaskStatus.EXPIRED.value,
        }
    ),
    WorkTaskStatus.EXPIRED.value: frozenset(
        {
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.MIGRATION_PENDING_REVIEW.value: frozenset(
        {
            WorkTaskStatus.READY.value,
            WorkTaskStatus.QUEUED.value,
            WorkTaskStatus.CANCELLED.value,
        }
    ),
    WorkTaskStatus.COMPLETED.value: frozenset(),
    WorkTaskStatus.CANCELLED.value: frozenset(),
}


def can_transition(current: str, target: str) -> bool:
    if current == target:
        return True
    allowed = _ALLOWED.get(current)
    if allowed is None:
        return False
    return target in allowed


def transition(task: WorkTask, target: str | WorkTaskStatus) -> WorkTask:
    """Apply a validated status transition onto ``task`` in-place."""
    target_value = target.value if isinstance(target, WorkTaskStatus) else target
    current = task.status
    if current == target_value:
        return task
    if current in {WorkTaskStatus.COMPLETED.value, WorkTaskStatus.CANCELLED.value} and target_value in {
        WorkTaskStatus.RUNNING.value,
        WorkTaskStatus.QUEUED.value,
        WorkTaskStatus.STARTING.value,
    }:
        raise StateMachineError(f"cannot transition from terminal status {current!r} to {target_value!r}")
    if not can_transition(current, target_value):
        raise StateMachineError(f"invalid work task transition: {current!r} → {target_value!r}")
    task.status = target_value
    return task
