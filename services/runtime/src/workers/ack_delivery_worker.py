"""ACK outbox delivery worker (commit-before-ack)."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.errors import CopilotError
from core.logging import get_logger
from integrations.service_center.protocol import ServiceCenterClient
from services.runtime_sync_service import RuntimeSyncService

logger = get_logger(__name__)


class AckDeliveryWorker:
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
                logger.exception("ack_delivery_tick_failed")
            await asyncio.sleep(self._settings.delivery_outbox_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            sync = RuntimeSyncService(self._settings, session, self._center)
            await sync.flush_ack_outbox()
            await session.commit()
        except CopilotError as exc:
            await session.rollback()
            logger.info("ack_delivery_skipped", reason=exc.code)
        finally:
            await session.close()
