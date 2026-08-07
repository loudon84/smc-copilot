"""Task worker manager — poll loop + concurrency limits (PRD v1.3 Phase 2)."""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from integrations.service_center.protocol import ServiceCenterClient
from runtime.tasks.scheduler import ENDPOINT_MAX_CONCURRENT, INSTANCE_MAX_CONCURRENT
from runtime.tasks.task_worker import TaskWorker
from services.gateway_supervisor import GatewaySupervisor

logger = get_logger(__name__)

POLL_INTERVAL_SECONDS = 0.5


# @lat: [[task-runtime#Durable Task Scheduler]]
class TaskWorkerManager:
    """Owns TaskWorker slots (Endpoint=2, Instance=1) and a durable queue poll loop."""

    _instance: TaskWorkerManager | None = None

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        session_maker: async_sessionmaker[AsyncSession] | None = None,
        center: ServiceCenterClient | None = None,
        supervisor: GatewaySupervisor | None = None,
        endpoint_max: int = ENDPOINT_MAX_CONCURRENT,
        instance_max: int = INSTANCE_MAX_CONCURRENT,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._center = center
        self._supervisor = supervisor
        self._endpoint_max = endpoint_max
        self._instance_max = instance_max
        self._active = 0
        self._wake = asyncio.Event()
        self._stop = asyncio.Event()
        self._poll_task: asyncio.Task[Any] | None = None
        self._inflight: set[asyncio.Task[Any]] = set()
        self._accepting = True

    @classmethod
    def get(cls) -> TaskWorkerManager:
        if cls._instance is None:
            cls._instance = TaskWorkerManager()
        return cls._instance

    @classmethod
    def configure(
        cls,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        center: ServiceCenterClient,
        supervisor: GatewaySupervisor,
    ) -> TaskWorkerManager:
        mgr = cls.get()
        mgr._settings = settings
        mgr._session_maker = session_maker
        mgr._center = center
        mgr._supervisor = supervisor
        return mgr

    @classmethod
    def reset(cls) -> None:
        if cls._instance is not None:
            cls._instance._accepting = False
            cls._instance._stop.set()
            cls._instance._wake.set()
        cls._instance = None

    def wake(self) -> None:
        """Signal that a new queue row may be available."""
        self._wake.set()
        if (
            self._poll_task is None
            and self._accepting
            and self._session_maker is not None
            and self._settings is not None
            and self._center is not None
            and self._supervisor is not None
        ):
            # One-shot drain when poll loop is not running (e.g. tests with workers disabled).
            task = asyncio.create_task(self._drain_available(), name="task-worker-oneshot")
            self._inflight.add(task)
            task.add_done_callback(self._inflight.discard)

    async def start(self) -> None:
        if self._poll_task is not None:
            return
        self._accepting = True
        self._stop.clear()
        self._poll_task = asyncio.create_task(self._poll_loop(), name="task-worker-manager")
        logger.info("task_worker_manager_started")

    async def stop(self) -> None:
        self._accepting = False
        self._stop.set()
        self._wake.set()
        if self._poll_task is not None:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None
        if self._inflight:
            await asyncio.gather(*list(self._inflight), return_exceptions=True)
            self._inflight.clear()
        logger.info("task_worker_manager_stopped")

    async def _poll_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self._drain_available()
            except Exception:
                logger.exception("task_worker_manager_tick_failed")
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=POLL_INTERVAL_SECONDS)
                self._wake.clear()
            except TimeoutError:
                pass

    async def _drain_available(self) -> None:
        if not self._accepting:
            return
        if self._session_maker is None or self._settings is None or self._center is None or self._supervisor is None:
            return
        # Brief yield so the HTTP request session can commit before claim.
        await asyncio.sleep(0)
        while self._accepting and self._active < self._endpoint_max:
            if self._active >= self._endpoint_max:
                break
            self._active += 1
            try:
                worker = TaskWorker(
                    self._settings,
                    self._session_maker,
                    self._center,
                    self._supervisor,
                )
                did_work = await worker.process_one()
                if not did_work:
                    break
            finally:
                self._active = max(0, self._active - 1)
