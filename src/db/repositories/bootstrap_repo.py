from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.runtime_enums import BootstrapSessionStatus
from db.models.runtime import BootstrapSession


class BootstrapSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, row: BootstrapSession) -> BootstrapSession:
        self._session.add(row)
        await self._session.flush()
        return row

    async def get(self, session_id: str) -> BootstrapSession | None:
        return await self._session.get(BootstrapSession, session_id)

    async def get_by_token_hash(self, token_hash: str) -> BootstrapSession | None:
        result = await self._session.execute(
            select(BootstrapSession).where(BootstrapSession.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def list_active(self) -> list[BootstrapSession]:
        result = await self._session.execute(
            select(BootstrapSession).where(
                BootstrapSession.status.in_(
                    (
                        BootstrapSessionStatus.PENDING.value,
                        BootstrapSessionStatus.ACTIVE.value,
                    )
                )
            )
        )
        return list(result.scalars().all())

    async def mark_completed(self, row: BootstrapSession) -> BootstrapSession:
        now = datetime.now(timezone.utc)
        row.status = BootstrapSessionStatus.COMPLETED.value
        row.completed_at = now
        await self._session.flush()
        return row

    async def mark_expired(self, row: BootstrapSession) -> BootstrapSession:
        row.status = BootstrapSessionStatus.EXPIRED.value
        await self._session.flush()
        return row

    async def invalidate_all_active(self) -> int:
        rows = await self.list_active()
        now = datetime.now(timezone.utc)
        for row in rows:
            row.status = BootstrapSessionStatus.INVALIDATED.value
            row.completed_at = now
        await self._session.flush()
        return len(rows)
