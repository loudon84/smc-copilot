"""v1.5 background workers: heartbeat, outbox, desired-state, assignments, StaffDeck reviews."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from integrations.service_center.protocol import ServiceCenterClient
from services.desired_state_service import DesiredStateService
from services.remote_task_service import RemoteTaskService
from services.runtime_sync_service import RuntimeSyncService
from services.staffdeck_bridge_service import StaffDeckBridgeService

logger = get_logger(__name__)


class EndpointHeartbeatWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._center = center

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("endpoint_heartbeat_tick_failed")
            await asyncio.sleep(self._settings.endpoint_heartbeat_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            await RuntimeSyncService(self._settings, session, self._center).heartbeat_tick()
            await session.commit()
        finally:
            await session.close()


class DeliveryOutboxWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._center = center

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("delivery_outbox_tick_failed")
            await asyncio.sleep(self._settings.delivery_outbox_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            await RuntimeSyncService(self._settings, session, self._center).flush_outbox()
            await session.commit()
        finally:
            await session.close()


class DesiredStateWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._center = center

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("desired_state_tick_failed")
            await asyncio.sleep(self._settings.sync_poll_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            sync = RuntimeSyncService(self._settings, session, self._center)
            await sync.sync_now()
            desired = DesiredStateService(self._settings, session, self._center)
            latest = await desired._repo.get_latest_revision()  # noqa: SLF001
            if latest and latest.status == "pending":
                await desired.apply_revision(latest.revision)
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


class AssignmentWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._center = center

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("assignment_worker_tick_failed")
            await asyncio.sleep(self._settings.task_poll_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            await RemoteTaskService(self._settings, session, self._center).process_ready_assignments()
            await session.commit()
        finally:
            await session.close()


class StaffDeckReviewWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._center = center

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("staffdeck_review_tick_failed")
            await asyncio.sleep(self._settings.sync_poll_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            await StaffDeckBridgeService(self._settings, session, self._center).sync_reviews()
            await session.commit()
        finally:
            await session.close()
