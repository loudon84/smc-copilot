"""Desired-state apply worker."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.errors import CopilotError
from core.logging import get_logger
from integrations.service_center.protocol import ServiceCenterClient
from services.desired_state_service import DesiredStateService
from services.runtime_sync_service import RuntimeSyncService

logger = get_logger(__name__)


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
            if latest is not None and latest.status == "pending":
                await desired.apply_revision(latest.revision)
            await session.commit()
        except CopilotError as exc:
            await session.rollback()
            logger.info("desired_state_skipped", reason=exc.code)
        finally:
            await session.close()
