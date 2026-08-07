from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.runtime_enums import InstanceStatus
from db.models.runtime import HermesInstance, RuntimeUpdatePlan
from db.repositories.runtime_repo import RuntimeUpdatePlanRepository, RuntimeVersionRepository
from services.compatibility_service import CompatibilityService


# @lat: [[runtime-service#更新与回滚]]
class RuntimeUpdatePlanService:
    """Creates Hermes update plans with compatibility and affected-instance analysis."""

    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._compat = CompatibilityService(settings)

    async def create_plan(
        self,
        *,
        version: str,
        channel: str,
        instance_ids: list[str] | None = None,
        strategy: str = "rolling",
    ) -> dict[str, Any]:
        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            active = await repo.get_active()
            from_version = active.version if active else None

            affected = await self._resolve_affected_instances(session, instance_ids)
            compat_detail = self._compat.check(from_version, version)
            compatibility = {
                "api": compat_detail.get("api", True),
                "config": compat_detail.get("config", True),
                "python": compat_detail.get("python", True),
            }
            warnings = list(compat_detail.get("warnings") or [])

            plan_repo = RuntimeUpdatePlanRepository(session)
            plan = RuntimeUpdatePlan(
                from_version=from_version,
                to_version=version,
                strategy=strategy,
                status="planned",
                affected_instances_json=json.dumps(affected),
            )
            await plan_repo.add(plan)
            await session.commit()

            return {
                "planId": plan.id,
                "fromVersion": from_version,
                "toVersion": version,
                "affectedInstances": affected,
                "compatibility": compatibility,
                "warnings": warnings,
            }

    async def _resolve_affected_instances(
        self,
        session: AsyncSession,
        instance_ids: list[str] | None,
    ) -> list[dict[str, Any]]:
        if instance_ids:
            result = await session.execute(
                select(HermesInstance).where(HermesInstance.id.in_(instance_ids))
            )
            instances = list(result.scalars().all())
        else:
            result = await session.execute(select(HermesInstance))
            instances = list(result.scalars().all())

        out: list[dict[str, Any]] = []
        for inst in instances:
            out.append(
                {
                    "instanceId": inst.id,
                    "name": inst.name,
                    "profileName": inst.profile_name,
                    "status": inst.status,
                    "autoStart": inst.auto_start,
                    "healthy": inst.healthy,
                }
            )
        return out

    async def pick_canary_instance_id(
        self,
        session: AsyncSession,
        instance_ids: list[str] | None,
    ) -> str | None:
        if instance_ids:
            result = await session.execute(
                select(HermesInstance).where(HermesInstance.id.in_(instance_ids))
            )
            candidates = list(result.scalars().all())
            if candidates:
                return candidates[0].id

        result = await session.execute(
            select(HermesInstance).where(
                HermesInstance.status.in_(
                    (InstanceStatus.RUNNING.value, InstanceStatus.STARTING.value)
                )
            )
        )
        running = list(result.scalars().all())
        if running:
            return running[0].id

        result = await session.execute(
            select(HermesInstance).where(HermesInstance.auto_start.is_(True))
        )
        auto = list(result.scalars().all())
        if auto:
            return auto[0].id

        result = await session.execute(select(HermesInstance).limit(1))
        first = result.scalar_one_or_none()
        return first.id if first else None
