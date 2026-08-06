"""Shared task execution scheduler singleton."""

from __future__ import annotations

from runtime.tasks.scheduler import TaskExecutionScheduler

_SCHEDULER = TaskExecutionScheduler()
_TEST_ADAPTER: object | None = None


def get_task_scheduler() -> TaskExecutionScheduler:
    return _SCHEDULER


def reset_task_scheduler() -> TaskExecutionScheduler:
    global _SCHEDULER
    _SCHEDULER = TaskExecutionScheduler()
    return _SCHEDULER


def set_test_hermes_adapter(adapter: object | None) -> None:
    global _TEST_ADAPTER
    _TEST_ADAPTER = adapter


def get_test_hermes_adapter() -> object | None:
    return _TEST_ADAPTER
