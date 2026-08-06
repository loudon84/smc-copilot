"""Worker supervisor registry (PRD FR-801)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class WorkerStatus(StrEnum):
    STARTING = "starting"
    RUNNING = "running"
    BACKING_OFF = "backing_off"
    CIRCUIT_OPEN = "circuit_open"
    DEGRADED = "degraded"
    STOPPED = "stopped"
    FAILED = "failed"
    PAUSED = "paused"


@dataclass
class WorkerState:
    name: str
    status: WorkerStatus = WorkerStatus.STOPPED
    critical: bool = False
    last_started_at: str | None = None
    last_tick_at: str | None = None
    last_success_at: str | None = None
    last_error_at: str | None = None
    last_error_code: str | None = None
    consecutive_failures: int = 0
    next_run_at: str | None = None
    paused: bool = False


TickFn = Callable[[], Awaitable[None]]


@dataclass
class WorkerRegistration:
    name: str
    tick: TickFn
    interval_seconds: float = 5.0
    critical: bool = False
    tick_timeout_seconds: float = 60.0
    max_consecutive_failures: int = 5
    backoff_base_seconds: float = 2.0
    backoff_max_seconds: float = 120.0
    jitter_fraction: float = 0.1
    circuit_open_seconds: float = 30.0
    state: WorkerState = field(default_factory=lambda: WorkerState(name=""))  # noqa: ARG005

    def __post_init__(self) -> None:
        self.state.name = self.name
        self.state.critical = self.critical
