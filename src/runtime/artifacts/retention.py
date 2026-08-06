"""Artifact spool retention cleanup (PRD FR-701)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from core.logging import get_logger
from runtime.artifacts.spool import ArtifactSpool, ArtifactSpoolState

logger = get_logger(__name__)

DEFAULT_UPLOADED_RETENTION_HOURS = 24
DEFAULT_EXPIRED_RETENTION_HOURS = 72


# @lat: [[runtime-service#Artifact 保留策略]]
class ArtifactRetention:
    def __init__(
        self,
        spool: ArtifactSpool | None = None,
        *,
        uploaded_retention_hours: int = DEFAULT_UPLOADED_RETENTION_HOURS,
        expired_retention_hours: int = DEFAULT_EXPIRED_RETENTION_HOURS,
    ) -> None:
        self._spool = spool or ArtifactSpool()
        self._uploaded_retention = timedelta(hours=uploaded_retention_hours)
        self._expired_retention = timedelta(hours=expired_retention_hours)

    def _is_older_than(self, iso_ts: str, delta: timedelta) -> bool:
        try:
            ts = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        except ValueError:
            return True
        return datetime.now(UTC) - ts > delta

    def expire_stale_uploaded(self) -> int:
        count = 0
        for entry in self._spool.list_by_state(ArtifactSpoolState.UPLOADED):
            if self._is_older_than(entry.updated_at, self._uploaded_retention):
                self._spool.transition(entry.id, ArtifactSpoolState.EXPIRED)
                count += 1
        return count

    def purge_expired(self) -> int:
        count = 0
        for entry in self._spool.list_by_state(ArtifactSpoolState.EXPIRED):
            if self._is_older_than(entry.updated_at, self._expired_retention):
                self._spool.transition(entry.id, ArtifactSpoolState.DELETED)
                self._spool.delete_entry(entry.id)
                count += 1
        return count

    def run_cleanup(self) -> dict[str, int]:
        expired = self.expire_stale_uploaded()
        purged = self.purge_expired()
        logger.info("artifact_retention_cleanup", expired=expired, purged=purged)
        return {"expired": expired, "purged": purged}
