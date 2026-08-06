"""Endpoint inventory snapshot build + report (PRD FR-34)."""

from __future__ import annotations

import json
import platform
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import CopilotError
from db.models.endpoint_sync import EndpointInventorySnapshot
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.protocol import ServiceCenterClient
from services.endpoint_enrollment_service import EndpointEnrollmentService
from version import __version__


class EndpointInventoryService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._enrollment = EndpointEnrollmentService(settings, session, center)

    def build_local_snapshot(self) -> dict[str, Any]:
        """Inventory without real paths, MAC, or serial numbers."""
        return {
            "runtimeVersion": __version__,
            "osFamily": platform.system(),
            "osVersion": platform.release(),
            "architecture": platform.machine(),
            "deviceIdHash": self._settings.device_id,
            "features": [],
            "profiles": [],
            "instances": [],
            "reportedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }

    async def get_latest(self) -> dict[str, Any]:
        cred = await self._repo.get_credential()
        if cred is None:
            snap = self.build_local_snapshot()
            return {"endpointId": None, "snapshot": snap, "reported": False}
        row = await self._repo.get_latest_inventory(cred.endpoint_id)
        if row is None:
            return {"endpointId": cred.endpoint_id, "snapshot": self.build_local_snapshot(), "reported": False}
        return {
            "endpointId": cred.endpoint_id,
            "snapshot": json.loads(row.snapshot_json),
            "reportedAt": row.reported_at.isoformat() if row.reported_at else None,
            "reported": True,
        }

    async def report(self, snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
        cred = await self._enrollment.ensure_access_token()
        snap = snapshot or self.build_local_snapshot()
        # Strip forbidden fields if callers pass them
        for forbidden in ("macAddress", "diskSerial", "localPaths", "providerSecrets", "chatBodies"):
            snap.pop(forbidden, None)
        await self._center.inventory(cred.endpoint_id, snap)
        now = datetime.now(UTC)
        row = EndpointInventorySnapshot(
            endpoint_id=cred.endpoint_id,
            snapshot_json=json.dumps(snap, ensure_ascii=False),
            reported_at=now,
        )
        await self._repo.add_inventory(row)
        return {"endpointId": cred.endpoint_id, "reportedAt": now.isoformat()}

    async def require_enrolled(self) -> str:
        cred = await self._repo.get_credential()
        if cred is None or cred.status != "active":
            raise CopilotError("endpoint not enrolled", code="not_enrolled")
        return cred.endpoint_id
