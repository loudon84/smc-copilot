from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.chat_attachment import ChatAttachment


class ChatAttachmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, attachment_id: str) -> ChatAttachment | None:
        return await self._session.get(ChatAttachment, attachment_id)

    async def list_for_session(
        self, *, profile_id: str, workspace_id: str, session_id: str
    ) -> list[ChatAttachment]:
        result = await self._session.execute(
            select(ChatAttachment).where(
                ChatAttachment.profile_id == profile_id,
                ChatAttachment.workspace_id == workspace_id,
                ChatAttachment.session_id == session_id,
            )
        )
        return list(result.scalars().all())

    async def create(self, row: ChatAttachment) -> ChatAttachment:
        self._session.add(row)
        await self._session.flush()
        return row

    async def delete(self, row: ChatAttachment) -> None:
        await self._session.delete(row)
        await self._session.flush()
