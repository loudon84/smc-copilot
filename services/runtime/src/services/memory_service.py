from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from integrations.hermes.memory_adapter import HermesMemoryAdapter
from integrations.hermes.session_adapter import HermesSessionAdapter
from schemas.memory import (
    MemoryEntry,
    MemoryFileInfo,
    MemoryInfoResponse,
    MemoryMutationResponse,
    SessionStatsInfo,
    UserProfileInfo,
)
from services.instance_service import InstanceService


class MemoryService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session

    async def _adapter(self, instance_id: str) -> HermesMemoryAdapter:
        inst = await InstanceService(self._settings, self._session).get(instance_id)
        return HermesMemoryAdapter(self._settings, profile_name=inst.profile_name)

    async def _session_adapter(self, instance_id: str) -> HermesSessionAdapter:
        inst = await InstanceService(self._settings, self._session).get(instance_id)
        return HermesSessionAdapter(
            self._settings,
            gateway_port=inst.gateway_port,
            profile_name=inst.profile_name,
        )

    async def get_memory(self, instance_id: str) -> MemoryInfoResponse:
        mem_adapter = await self._adapter(instance_id)
        sess_adapter = await self._session_adapter(instance_id)
        memory = mem_adapter.read_memory()
        user = mem_adapter.read_user()
        stats = await sess_adapter.stats()
        return MemoryInfoResponse(
            memory=MemoryFileInfo(
                content=memory["content"],
                exists=memory["exists"],
                lastModified=memory["lastModified"],
                entries=[MemoryEntry(**e) for e in memory["entries"]],
                charCount=memory["charCount"],
                charLimit=memory["charLimit"],
            ),
            user=UserProfileInfo(
                content=user["content"],
                exists=user["exists"],
                lastModified=user["lastModified"],
                charCount=user["charCount"],
                charLimit=user["charLimit"],
            ),
            stats=SessionStatsInfo(
                totalSessions=stats["totalSessions"],
                totalMessages=stats["totalMessages"],
            ),
        )

    async def add_entry(self, instance_id: str, content: str) -> MemoryMutationResponse:
        result = (await self._adapter(instance_id)).add_entry(content)
        return MemoryMutationResponse(**result)

    async def update_entry(self, instance_id: str, index: int, content: str) -> MemoryMutationResponse:
        result = (await self._adapter(instance_id)).update_entry(index, content)
        return MemoryMutationResponse(**result)

    async def remove_entry(self, instance_id: str, index: int) -> MemoryMutationResponse:
        ok = (await self._adapter(instance_id)).remove_entry(index)
        return MemoryMutationResponse(success=ok, error=None if ok else "Entry not found")

    async def write_content(self, instance_id: str, content: str) -> MemoryMutationResponse:
        result = (await self._adapter(instance_id)).write_content(content)
        return MemoryMutationResponse(**result)

    async def write_user_profile(self, instance_id: str, content: str) -> MemoryMutationResponse:
        result = (await self._adapter(instance_id)).write_user(content)
        return MemoryMutationResponse(**result)
