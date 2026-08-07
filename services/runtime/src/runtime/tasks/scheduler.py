"""Task execution scheduler with concurrency limits (FR-506)."""

from __future__ import annotations

import asyncio
import heapq
from dataclasses import dataclass, field
from typing import Any

from core.logging import get_logger

logger = get_logger(__name__)

ENDPOINT_MAX_CONCURRENT = 2
INSTANCE_MAX_CONCURRENT = 1


@dataclass(order=True)
class _QueueItem:
    sort_key: tuple[int, float]
    task_id: str = field(compare=False)


class TaskExecutionScheduler:
    def __init__(
        self,
        *,
        endpoint_max: int = ENDPOINT_MAX_CONCURRENT,
        instance_max: int = INSTANCE_MAX_CONCURRENT,
    ) -> None:
        self._endpoint_max = endpoint_max
        self._instance_max = instance_max
        self._queue: list[_QueueItem] = []
        self._active_endpoint = 0
        self._active_by_instance: dict[str, int] = {}
        self._queued_ids: set[str] = set()
        self._lock = asyncio.Lock()

    async def enqueue(self, task_id: str, *, priority: int = 0, created_at: float = 0.0) -> None:
        async with self._lock:
            if task_id in self._queued_ids:
                return
            heapq.heappush(self._queue, _QueueItem(sort_key=(-priority, created_at), task_id=task_id))
            self._queued_ids.add(task_id)

    async def try_acquire(self, task_id: str, instance_id: str | None) -> bool:
        async with self._lock:
            if self._active_endpoint >= self._endpoint_max:
                return False
            inst = instance_id or "default"
            if self._active_by_instance.get(inst, 0) >= self._instance_max:
                return False
            self._active_endpoint += 1
            self._active_by_instance[inst] = self._active_by_instance.get(inst, 0) + 1
            self._queued_ids.discard(task_id)
            return True

    async def release(self, instance_id: str | None) -> None:
        async with self._lock:
            self._active_endpoint = max(0, self._active_endpoint - 1)
            inst = instance_id or "default"
            current = self._active_by_instance.get(inst, 0)
            if current <= 1:
                self._active_by_instance.pop(inst, None)
            else:
                self._active_by_instance[inst] = current - 1

    async def pop_next(self) -> str | None:
        async with self._lock:
            if not self._queue:
                return None
            item = heapq.heappop(self._queue)
            self._queued_ids.discard(item.task_id)
            return item.task_id

    def active_endpoint_count(self) -> int:
        return self._active_endpoint

    def active_instance_count(self, instance_id: str | None) -> int:
        return self._active_by_instance.get(instance_id or "default", 0)
