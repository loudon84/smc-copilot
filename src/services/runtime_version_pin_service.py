from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.runtime_enums import RuntimeVersionStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeJob, RuntimeVersion
from db.repositories.runtime_repo import RuntimeUpdatePlanRepository, RuntimeVersionRepository


# @lat: [[runtime-service#更新与回滚]]
class RuntimeVersionPinService:
    """Checks whether a Hermes version is pinned and must not be deleted."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._versions = RuntimeVersionRepository(session)
        self._plans = RuntimeUpdatePlanRepository(session)

    async def assert_deletable(self, row: RuntimeVersion) -> None:
        reason = await self.pin_reason(row)
        if reason:
            raise RuntimeServiceError(
                f"Version {row.version} is pinned: {reason}",
                code="runtime_version_pinned",
                details={"version": row.version, "reason": reason},
            )

    async def pin_reason(self, row: RuntimeVersion) -> str | None:
        if row.status == RuntimeVersionStatus.ACTIVE.value:
            return "active"

        result = await self._session.execute(
            select(HermesInstance.id).where(HermesInstance.runtime_version_id == row.id).limit(1)
        )
        if result.scalar_one_or_none() is not None:
            return "referenced_by_instance"

        plans = await self._plans.list_referencing_version(row.version)
        if plans:
            return "referenced_by_update_plan"

        if await self._is_last_healthy_version(row):
            return "last_healthy_version"

        if await self._is_rollback_reserved(row.id):
            return "rollback_reserved"

        return None

    async def _is_last_healthy_version(self, row: RuntimeVersion) -> bool:
        versions = await self._versions.list_all()
        healthy = []
        for ver in versions:
            if ver.status in (RuntimeVersionStatus.INVALID.value, RuntimeVersionStatus.PENDING_DELETE.value):
                continue
            exe = Path(ver.executable_path or "")
            if exe.is_file():
                healthy.append(ver)
        return len(healthy) == 1 and healthy[0].id == row.id

    async def _is_rollback_reserved(self, version_id: str) -> bool:
        result = await self._session.execute(
            select(RuntimeJob).where(RuntimeJob.rollback_state_json.is_not(None))
        )
        for job in result.scalars().all():
            if not job.rollback_state_json:
                continue
            try:
                state = json.loads(job.rollback_state_json)
            except json.JSONDecodeError:
                continue
            if not isinstance(state, dict):
                continue
            reserved = state.get("reservedVersionIds") or state.get("reserved_version_ids") or []
            if version_id in reserved:
                return True
            if state.get("previousVersionId") == version_id or state.get("targetVersionId") == version_id:
                return True
        return False
