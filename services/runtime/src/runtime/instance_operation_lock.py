"""Per-instance asyncio locks to serialize start/stop/restart/health recovery."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class InstanceOperationLock:
    """In-process lock registry keyed by instance id (PRD v1.5 §35)."""

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}
        self._guard = asyncio.Lock()

    async def _get(self, instance_id: str) -> asyncio.Lock:
        async with self._guard:
            lock = self._locks.get(instance_id)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[instance_id] = lock
            return lock

    @asynccontextmanager
    async def acquire(self, instance_id: str) -> AsyncIterator[None]:
        lock = await self._get(instance_id)
        async with lock:
            yield


# Process-wide singleton for GatewaySupervisor + HealthWorker coordination
INSTANCE_OPERATION_LOCK = InstanceOperationLock()
