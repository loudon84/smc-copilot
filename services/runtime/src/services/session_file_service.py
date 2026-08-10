"""Session File Service — list / search / context association (PRD v1.6 FR-12/13/14)."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.runtime_errors import RuntimeServiceError
from db.models.chat_attachment import ChatAttachment
from db.models.runtime import HermesInstance
from schemas.session_files import (
    SessionFileContextResponse,
    SessionFileItem,
    SessionFileSearchHit,
    SessionFileSearchResponse,
    SessionFilesResponse,
)


def _role_for_row(row: ChatAttachment) -> str:
    role = (row.role or "prompt_attachment").strip()
    if row.is_context and role == "prompt_attachment":
        return "context_file"
    return role or "prompt_attachment"


def _to_item(row: ChatAttachment) -> SessionFileItem:
    return SessionFileItem(
        fileId=row.id,
        sessionId=row.session_id,
        workspaceId=row.workspace_id,
        name=row.original_name or row.safe_name,
        role=_role_for_row(row),  # type: ignore[arg-type]
        mimeType=row.mime_type,
        sizeBytes=row.size_bytes,
        storagePath=row.storage_path,
        workspaceRelativePath=row.workspace_relative_path,
        textPreview=row.text_preview,
        isContext=bool(row.is_context),
        createdAt=row.created_at,
    )


class SessionFileService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _require_instance(self, instance_id: str) -> HermesInstance:
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        return inst

    async def list_files(self, instance_id: str, session_id: str) -> SessionFilesResponse:
        await self._require_instance(instance_id)
        result = await self._session.execute(
            select(ChatAttachment).where(
                ChatAttachment.session_id == session_id,
                or_(
                    ChatAttachment.instance_id == instance_id,
                    ChatAttachment.instance_id.is_(None),
                ),
            )
        )
        rows = list(result.scalars().all())
        return SessionFilesResponse(files=[_to_item(r) for r in rows])

    async def search_files(
        self, instance_id: str, session_id: str, query: str
    ) -> SessionFileSearchResponse:
        await self._require_instance(instance_id)
        q = query.strip().lower()
        result = await self._session.execute(
            select(ChatAttachment).where(ChatAttachment.session_id == session_id)
        )
        hits: list[SessionFileSearchHit] = []
        for row in result.scalars().all():
            name = row.original_name or row.safe_name
            preview = row.text_preview or ""
            hay = f"{name}\n{preview}".lower()
            if q and q not in hay:
                continue
            score = 1.0 if not q else (1.0 if q in name.lower() else 0.5)
            snippet = preview[:240] if preview else None
            hits.append(
                SessionFileSearchHit(
                    fileId=row.id,
                    name=name,
                    role=_role_for_row(row),  # type: ignore[arg-type]
                    snippet=snippet,
                    score=score,
                )
            )
        hits.sort(key=lambda h: h.score, reverse=True)
        return SessionFileSearchResponse(hits=hits)

    async def add_to_context(
        self, instance_id: str, session_id: str, file_id: str
    ) -> SessionFileContextResponse:
        await self._require_instance(instance_id)
        row = await self._session.get(ChatAttachment, file_id)
        if row is None or row.session_id != session_id:
            raise RuntimeServiceError(f"File not found: {file_id}", code="not_found")
        row.is_context = 1
        if row.role == "prompt_attachment":
            row.role = "context_file"
        await self._session.flush()
        return SessionFileContextResponse(ok=True, fileId=file_id, isContext=True)

    async def remove_from_context(
        self, instance_id: str, session_id: str, file_id: str
    ) -> SessionFileContextResponse:
        await self._require_instance(instance_id)
        row = await self._session.get(ChatAttachment, file_id)
        if row is None or row.session_id != session_id:
            raise RuntimeServiceError(f"File not found: {file_id}", code="not_found")
        row.is_context = 0
        if row.role == "context_file":
            row.role = "prompt_attachment"
        await self._session.flush()
        return SessionFileContextResponse(ok=True, fileId=file_id, isContext=False)

    async def register_agent_output(
        self,
        *,
        instance_id: str,
        session_id: str,
        workspace_id: str,
        profile_id: str,
        name: str,
        path: str,
        mime_type: str = "application/octet-stream",
    ) -> SessionFileItem:
        """FR-14 — register a structured tool/artifact path as agent_output."""
        import hashlib
        import uuid
        from datetime import UTC, datetime

        file_id = str(uuid.uuid4())
        row = ChatAttachment(
            id=file_id,
            profile_id=profile_id,
            instance_id=instance_id,
            workspace_id=workspace_id,
            session_id=session_id,
            original_name=name,
            safe_name=name,
            mime_type=mime_type,
            size_bytes=0,
            sha256=hashlib.sha256(path.encode()).hexdigest(),
            storage_path=path,
            workspace_relative_path=path,
            text_preview=None,
            role="agent_output",
            is_context=0,
            created_at=datetime.now(UTC).isoformat(),
        )
        self._session.add(row)
        await self._session.flush()
        return _to_item(row)
