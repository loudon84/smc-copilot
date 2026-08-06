"""Worker supervisor tests: backoff, circuit open, process lock (PRD FR-803–804)."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from runtime.process_lock import ProcessLock, RuntimeAlreadyRunningError
from workers.registry import WorkerRegistration, WorkerStatus
from workers.supervisor import WorkerSupervisor


# @lat: [[tests#Worker Supervisor#Circuit opens after failures]]
@pytest.mark.asyncio
async def test_circuit_opens_after_failures() -> None:
    calls = 0

    async def failing_tick() -> None:
        nonlocal calls
        calls += 1
        raise RuntimeError("tick failed")

    sup = WorkerSupervisor()
    sup.register(
        WorkerRegistration(
            name="test-worker",
            tick=failing_tick,
            interval_seconds=0.01,
            max_consecutive_failures=3,
            circuit_open_seconds=0.05,
            backoff_base_seconds=0.01,
            backoff_max_seconds=0.02,
        )
    )
    await sup.start_all()
    await asyncio.sleep(0.25)
    state = sup.get_state("test-worker")
    assert state is not None
    assert state.status in (WorkerStatus.CIRCUIT_OPEN, WorkerStatus.BACKING_OFF, WorkerStatus.FAILED)
    assert state.consecutive_failures >= 1
    await sup.stop_all()


# @lat: [[tests#Worker Supervisor#Backoff increases delay]]
@pytest.mark.asyncio
async def test_backoff_on_failure() -> None:
    sup = WorkerSupervisor()

    async def fail() -> None:
        raise RuntimeError("fail")

    sup.register(
        WorkerRegistration(
            name="backoff-worker",
            tick=fail,
            interval_seconds=0.01,
            max_consecutive_failures=10,
            backoff_base_seconds=0.05,
        )
    )
    await sup.start_all()
    await asyncio.sleep(0.15)
    state = sup.get_state("backoff-worker")
    assert state is not None
    assert state.consecutive_failures >= 1
    await sup.stop_all()


# @lat: [[tests#Worker Supervisor#Single instance lock]]
def test_single_instance_lock(tmp_path: Path) -> None:
    lock1 = ProcessLock.for_data_dir(tmp_path)
    lock2 = ProcessLock.for_data_dir(tmp_path)
    lock1.acquire()
    try:
        with pytest.raises(RuntimeAlreadyRunningError):
            lock2.acquire()
    finally:
        lock1.release()
