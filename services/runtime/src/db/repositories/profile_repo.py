from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.profile import Profile


class ProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[Profile]:
        result = await self._session.execute(select(Profile).order_by(Profile.created_at))
        return list(result.scalars().all())

    async def get_by_id(self, profile_id: str) -> Profile | None:
        return await self._session.get(Profile, profile_id)

    async def get_by_name(self, name: str) -> Profile | None:
        result = await self._session.execute(select(Profile).where(Profile.name == name))
        return result.scalar_one_or_none()

    async def get_by_port(self, port: int, *, exclude_id: str | None = None) -> Profile | None:
        stmt = select(Profile).where(Profile.gateway_port == port)
        if exclude_id:
            stmt = stmt.where(Profile.id != exclude_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_first_by_type(self, profile_type: str) -> Profile | None:
        result = await self._session.execute(
            select(Profile)
            .where(Profile.type == profile_type)
            .order_by(Profile.created_at)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create(self, profile: Profile) -> Profile:
        self._session.add(profile)
        await self._session.flush()
        await self._session.refresh(profile)
        return profile

    async def update(self, profile: Profile) -> Profile:
        await self._session.flush()
        await self._session.refresh(profile)
        return profile

    async def delete(self, profile: Profile) -> None:
        await self._session.delete(profile)
        await self._session.flush()
