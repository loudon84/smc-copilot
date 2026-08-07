"""Artifact spool retention background worker (PRD FR-801)."""

from __future__ import annotations

import asyncio

from core.config import Settings
from core.logging import get_logger
from runtime.artifacts.retention import ArtifactRetention
from runtime.artifacts.spool import ArtifactSpool

logger = get_logger(__name__)


class RetentionWorker:
    def __init__(self, *, settings: Settings, spool: ArtifactSpool | None = None) -> None:
        self._settings = settings
        self._retention = ArtifactRetention(spool=spool)

    async def run_forever(self) -> None:
        interval = getattr(self._settings, "retention_interval_seconds", 3600.0)
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("retention_tick_failed")
            await asyncio.sleep(interval)

    async def tick(self) -> None:
        result = self._retention.run_cleanup()
        if result["expired"] or result["purged"]:
            logger.info("retention_cleanup", **result)
