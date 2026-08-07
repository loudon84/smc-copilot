from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.role_spec import ProfileRoleSpec


class RoleSpecRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[ProfileRoleSpec]:
        result = await self._session.execute(
            select(ProfileRoleSpec).order_by(ProfileRoleSpec.created_at)
        )
        return list(result.scalars().all())

    async def get_by_id(self, spec_id: str) -> ProfileRoleSpec | None:
        return await self._session.get(ProfileRoleSpec, spec_id)

    async def get_by_profile_id(self, profile_id: str) -> ProfileRoleSpec | None:
        result = await self._session.execute(
            select(ProfileRoleSpec).where(ProfileRoleSpec.profile_id == profile_id)
        )
        return result.scalar_one_or_none()

    async def create(self, spec: ProfileRoleSpec) -> ProfileRoleSpec:
        self._session.add(spec)
        await self._session.flush()
        await self._session.refresh(spec)
        return spec

    async def update(self, spec: ProfileRoleSpec) -> ProfileRoleSpec:
        await self._session.flush()
        await self._session.refresh(spec)
        return spec

    async def delete(self, spec: ProfileRoleSpec) -> None:
        await self._session.delete(spec)
        await self._session.flush()
