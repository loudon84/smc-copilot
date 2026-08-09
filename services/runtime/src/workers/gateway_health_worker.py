"""Periodic Gateway health probe + bounded auto-recovery (PRD v1.5 §22–32)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from services.gateway_supervisor import GatewaySupervisor

logger = get_logger(__name__)


class GatewayHealthWorker:
    """Runtime-owned worker: observes Gateway process/API and recovers crashes."""

    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        supervisor: GatewaySupervisor,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._supervisor = supervisor

    async def tick(self) -> None:
        instances = self._supervisor._instances  # noqa: SLF001 — same process supervisor facade
        ids = await instances.list_managed_instance_ids_for_health()
        for instance_id in ids:
            try:
                await instances.probe_and_recover(instance_id)
            except Exception as exc:
                logger.warning(
                    "gateway_health_worker_tick_failed",
                    instance_id=instance_id,
                    error=str(exc),
                )
