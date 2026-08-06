"""Worker supervisor with backoff, circuit breaker, and readiness (PRD FR-801–805)."""

from __future__ import annotations

import asyncio
import random
from datetime import UTC, datetime, timedelta
from typing import Any

from core.logging import get_logger
from workers.registry import WorkerRegistration, WorkerState, WorkerStatus

logger = get_logger(__name__)


# @lat: [[architecture#Worker Supervisor]]
class WorkerSupervisor:
    def __init__(self) -> None:
        self._workers: dict[str, WorkerRegistration] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._draining = False
        self._started = False

    def register(self, registration: WorkerRegistration) -> None:
        self._workers[registration.name] = registration

    def get_state(self, name: str) -> WorkerState | None:
        reg = self._workers.get(name)
        return reg.state if reg else None

    def list_states(self) -> list[WorkerState]:
        return [w.state for w in self._workers.values()]

    def is_ready(self) -> bool:
        for reg in self._workers.values():
            if not reg.critical:
                continue
            if reg.state.paused:
                continue
            if reg.state.status in (WorkerStatus.FAILED, WorkerStatus.CIRCUIT_OPEN):
                return False
        return True

    def critical_healthy(self) -> bool:
        return self.is_ready()

    async def start_all(self) -> None:
        if self._started:
            return
        self._started = True
        for name, reg in self._workers.items():
            self._tasks[name] = asyncio.create_task(self._run_loop(reg), name=f"worker-{name}")

    async def stop_all(self) -> None:
        self._draining = True
        for task in self._tasks.values():
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()
        self._started = False
        for reg in self._workers.values():
            reg.state.status = WorkerStatus.STOPPED

    async def drain(self) -> None:
        """Graceful drain: stop accepting new ticks, wait for in-flight."""
        self._draining = True
        await self.stop_all()

    def pause(self, name: str) -> bool:
        reg = self._workers.get(name)
        if reg is None:
            return False
        reg.state.paused = True
        reg.state.status = WorkerStatus.PAUSED
        return True

    def resume(self, name: str) -> bool:
        reg = self._workers.get(name)
        if reg is None:
            return False
        reg.state.paused = False
        reg.state.status = WorkerStatus.STARTING
        reg.state.consecutive_failures = 0
        return True

    async def restart(self, name: str) -> bool:
        reg = self._workers.get(name)
        if reg is None:
            return False
        task = self._tasks.get(name)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        reg.state.consecutive_failures = 0
        reg.state.status = WorkerStatus.STARTING
        reg.state.paused = False
        self._tasks[name] = asyncio.create_task(self._run_loop(reg), name=f"worker-{name}")
        return True

    def snapshot(self) -> list[dict[str, Any]]:
        return [
            {
                "name": s.name,
                "status": s.status.value,
                "critical": s.critical,
                "lastStartedAt": s.last_started_at,
                "lastTickAt": s.last_tick_at,
                "lastSuccessAt": s.last_success_at,
                "lastErrorAt": s.last_error_at,
                "lastErrorCode": s.last_error_code,
                "consecutiveFailures": s.consecutive_failures,
                "nextRunAt": s.next_run_at,
                "paused": s.paused,
            }
            for s in self.list_states()
        ]

    def _now_iso(self) -> str:
        return datetime.now(UTC).isoformat()

    def _compute_backoff(self, reg: WorkerRegistration) -> float:
        exp = min(
            reg.backoff_max_seconds,
            reg.backoff_base_seconds * (2 ** max(0, reg.state.consecutive_failures - 1)),
        )
        jitter = exp * reg.jitter_fraction * random.random()
        return exp + jitter

    async def _run_loop(self, reg: WorkerRegistration) -> None:
        state = reg.state
        state.status = WorkerStatus.STARTING
        state.last_started_at = self._now_iso()
        logger.info("worker_started", worker=reg.name)
        try:
            while not self._draining:
                if state.paused:
                    await asyncio.sleep(1.0)
                    continue
                if state.status == WorkerStatus.CIRCUIT_OPEN:
                    if state.next_run_at:
                        try:
                            next_at = datetime.fromisoformat(state.next_run_at.replace("Z", "+00:00"))
                            wait = (next_at - datetime.now(UTC)).total_seconds()
                            if wait > 0:
                                await asyncio.sleep(min(wait, reg.circuit_open_seconds))
                        except ValueError:
                            pass
                    state.status = WorkerStatus.BACKING_OFF
                    state.consecutive_failures = 0

                state.last_tick_at = self._now_iso()
                try:
                    await asyncio.wait_for(reg.tick(), timeout=reg.tick_timeout_seconds)
                    state.last_success_at = self._now_iso()
                    state.consecutive_failures = 0
                    state.last_error_code = None
                    state.status = WorkerStatus.RUNNING
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    state.last_error_at = self._now_iso()
                    state.last_error_code = getattr(exc, "code", type(exc).__name__)
                    state.consecutive_failures += 1
                    logger.exception("worker_tick_failed", worker=reg.name)
                    if state.consecutive_failures >= reg.max_consecutive_failures:
                        state.status = WorkerStatus.CIRCUIT_OPEN
                        state.next_run_at = (
                            datetime.now(UTC) + timedelta(seconds=reg.circuit_open_seconds)
                        ).isoformat()
                    else:
                        state.status = WorkerStatus.BACKING_OFF
                        backoff = self._compute_backoff(reg)
                        state.next_run_at = (datetime.now(UTC) + timedelta(seconds=backoff)).isoformat()
                        await asyncio.sleep(backoff)
                        continue

                await asyncio.sleep(reg.interval_seconds)
        except asyncio.CancelledError:
            state.status = WorkerStatus.STOPPED
            raise
        except Exception:
            state.status = WorkerStatus.FAILED
            logger.exception("worker_failed", worker=reg.name)
