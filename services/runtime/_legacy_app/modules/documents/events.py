from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.documents.repository import DocumentRepository


class EventService:
    def __init__(self, repo: DocumentRepository) -> None:
        self._repo = repo

    async def emit(
        self,
        session: AsyncSession,
        *,
        document_id: UUID,
        event_type: str,
        actor_id: UUID,
        version_no: int | None = None,
        payload: dict[str, object] | None = None,
    ) -> None:
        await self._repo.create_event(
            session,
            document_id=document_id,
            event_type=event_type,
            actor_id=actor_id,
            version_no=version_no,
            payload=payload,
        )
