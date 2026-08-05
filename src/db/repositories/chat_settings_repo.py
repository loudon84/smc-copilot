from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.chat_settings import ProfileChatSettings


class ChatSettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, profile_id: str) -> ProfileChatSettings | None:
        return await self._session.get(ProfileChatSettings, profile_id)

    async def get_by_instance_id(self, instance_id: str) -> ProfileChatSettings | None:
        result = await self._session.execute(
            select(ProfileChatSettings).where(ProfileChatSettings.instance_id == instance_id)
        )
        return result.scalar_one_or_none()

    async def get_for_chat(
        self,
        *,
        instance_id: str | None = None,
        profile_id: str | None = None,
    ) -> ProfileChatSettings | None:
        if instance_id:
            row = await self.get_by_instance_id(instance_id)
            if row is not None:
                return row
        if profile_id:
            return await self.get(profile_id)
        return None

    async def upsert(self, row: ProfileChatSettings) -> ProfileChatSettings:
        existing = await self.get(row.profile_id)
        if existing is None:
            self._session.add(row)
        else:
            existing.provider = row.provider
            existing.model_id = row.model_id
            existing.model_label = row.model_label
            existing.base_url = row.base_url
            existing.is_default = row.is_default
            existing.updated_at = row.updated_at
            if row.instance_id:
                existing.instance_id = row.instance_id
        await self._session.flush()
        return row if existing is None else existing

    async def upsert_for_instance(self, instance_id: str, row: ProfileChatSettings) -> ProfileChatSettings:
        existing = await self.get_by_instance_id(instance_id)
        if existing is None and row.profile_id:
            existing = await self.get(row.profile_id)
        if existing is None:
            row.instance_id = instance_id
            self._session.add(row)
            await self._session.flush()
            return row
        existing.provider = row.provider
        existing.model_id = row.model_id
        existing.model_label = row.model_label
        existing.base_url = row.base_url
        existing.is_default = row.is_default
        existing.updated_at = row.updated_at
        existing.instance_id = instance_id
        await self._session.flush()
        return existing

    async def delete(self, profile_id: str) -> None:
        row = await self.get(profile_id)
        if row is not None:
            await self._session.delete(row)
            await self._session.flush()
