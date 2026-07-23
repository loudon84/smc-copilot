from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.runtime_enums import RuntimeJobStatus, RuntimeVersionStatus
from db.models.runtime import RuntimeJob, RuntimeJobEvent, RuntimeVersion


class RuntimeVersionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[RuntimeVersion]:
        result = await self._session.execute(select(RuntimeVersion).order_by(RuntimeVersion.created_at.desc()))
        return list(result.scalars().all())

    async def get_by_id(self, version_id: str) -> RuntimeVersion | None:
        return await self._session.get(RuntimeVersion, version_id)

    async def get_by_version(self, version: str) -> RuntimeVersion | None:
        result = await self._session.execute(select(RuntimeVersion).where(RuntimeVersion.version == version))
        return result.scalar_one_or_none()

    async def get_active(self) -> RuntimeVersion | None:
        result = await self._session.execute(
            select(RuntimeVersion).where(RuntimeVersion.status == RuntimeVersionStatus.ACTIVE.value)
        )
        return result.scalar_one_or_none()

    async def add(self, row: RuntimeVersion) -> RuntimeVersion:
        self._session.add(row)
        await self._session.flush()
        return row

    async def deactivate_all(self) -> None:
        await self._session.execute(
            update(RuntimeVersion)
            .where(RuntimeVersion.status == RuntimeVersionStatus.ACTIVE.value)
            .values(status=RuntimeVersionStatus.INACTIVE.value)
        )

    async def set_active(self, version_id: str) -> RuntimeVersion | None:
        await self.deactivate_all()
        row = await self.get_by_id(version_id)
        if row is None:
            return None
        row.status = RuntimeVersionStatus.ACTIVE.value
        row.activated_at = datetime.now(timezone.utc)
        await self._session.flush()
        return row

    async def delete(self, row: RuntimeVersion) -> None:
        await self._session.delete(row)
        await self._session.flush()


class RuntimeJobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, job: RuntimeJob) -> RuntimeJob:
        self._session.add(job)
        await self._session.flush()
        return job

    async def get(self, job_id: str) -> RuntimeJob | None:
        return await self._session.get(RuntimeJob, job_id)

    async def list_jobs(self, *, limit: int = 50) -> list[RuntimeJob]:
        result = await self._session.execute(
            select(RuntimeJob).order_by(RuntimeJob.created_at.desc()).limit(limit)
        )
        return list(result.scalars().all())

    async def find_active_write_job(self) -> RuntimeJob | None:
        write_types = ("install", "update", "rollback", "restore", "config_migrate", "runtime_cleanup")
        result = await self._session.execute(
            select(RuntimeJob)
            .where(
                RuntimeJob.job_type.in_(write_types),
                RuntimeJob.status.in_(
                    (RuntimeJobStatus.PENDING.value, RuntimeJobStatus.RUNNING.value)
                ),
            )
            .order_by(RuntimeJob.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_incomplete(self) -> list[RuntimeJob]:
        result = await self._session.execute(
            select(RuntimeJob).where(
                RuntimeJob.status.in_(
                    (RuntimeJobStatus.PENDING.value, RuntimeJobStatus.RUNNING.value)
                )
            )
        )
        return list(result.scalars().all())

    async def add_event(self, event: RuntimeJobEvent) -> RuntimeJobEvent:
        self._session.add(event)
        await self._session.flush()
        return event

    async def list_events(self, job_id: str, *, after_sequence: int = 0) -> list[RuntimeJobEvent]:
        result = await self._session.execute(
            select(RuntimeJobEvent)
            .where(RuntimeJobEvent.job_id == job_id, RuntimeJobEvent.sequence > after_sequence)
            .order_by(RuntimeJobEvent.sequence.asc())
        )
        return list(result.scalars().all())

    async def next_sequence(self, job_id: str) -> int:
        result = await self._session.execute(
            select(RuntimeJobEvent.sequence)
            .where(RuntimeJobEvent.job_id == job_id)
            .order_by(RuntimeJobEvent.sequence.desc())
            .limit(1)
        )
        current = result.scalar_one_or_none()
        return (current or 0) + 1
