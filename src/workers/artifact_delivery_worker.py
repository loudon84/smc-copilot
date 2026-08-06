"""Artifact delivery background worker (PRD FR-801)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from integrations.service_center.protocol import ServiceCenterClient
from services.artifact_delivery_service import ArtifactDeliveryService

logger = get_logger(__name__)


class ArtifactDeliveryWorker:
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
        import asyncio

        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("artifact_delivery_tick_failed")
            await asyncio.sleep(self._settings.delivery_outbox_interval_seconds)

    async def tick(self) -> None:
        session = self._session_maker()
        try:
            svc = ArtifactDeliveryService(self._settings, session, self._center)
            processed = await svc.process_queued_uploads(limit=5)
            if processed:
                await session.commit()
                logger.info("artifact_delivery_processed", count=processed)
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
