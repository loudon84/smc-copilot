"""Artifact delivery worker using LeaseManager (PRD FR-801)."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.tasks.lease_manager import LeaseManager

logger = get_logger(__name__)


class LeaseRenewalWorker:
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
        interval = getattr(self._settings, "lease_renewal_interval_seconds", 30.0)
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("lease_renewal_tick_failed")
            await asyncio.sleep(interval)

    async def tick(self) -> None:
        session = self._session_maker()
        try:
            repo = EndpointSyncRepository(session)
            cred = await repo.get_credential()
            if cred is None:
                return
            manager = LeaseManager(session, self._center, cred.endpoint_id)
            leases = await repo.list_active_leases()
            renewed = 0
            for lease in leases:
                if await manager.renew(lease):
                    renewed += 1
            if renewed:
                await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
