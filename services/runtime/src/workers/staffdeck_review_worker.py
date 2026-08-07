"""StaffDeck review sync worker."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.errors import CopilotError
from core.logging import get_logger
from integrations.service_center.protocol import ServiceCenterClient
from services.staffdeck_bridge_service import StaffDeckBridgeService

logger = get_logger(__name__)


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
            bridge = StaffDeckBridgeService(self._settings, session, self._center)
            updated = await bridge.sync_reviews()
            await session.commit()
            if updated:
                logger.info("staffdeck_reviews_synced", count=len(updated) if hasattr(updated, "__len__") else updated)
        except CopilotError as exc:
            await session.rollback()
            logger.info("staffdeck_review_skipped", reason=exc.code)
        finally:
            await session.close()
