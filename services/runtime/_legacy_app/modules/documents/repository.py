from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import Select, and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.documents.models import Document, DocumentEvent, DocumentPermission, DocumentVersion


class DocumentRepository:
    async def list_documents(
        self,
        session: AsyncSession,
        *,
        workspace_id: UUID,
        keyword: str | None,
        status: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[Document], int]:
        where = [Document.workspace_id == workspace_id]
        if keyword:
            where.append(Document.title.ilike(f"%{keyword}%"))
        if status:
            where.append(Document.status == status)

        base = select(Document).where(and_(*where))
        count_stmt = select(func.count()).select_from(base.subquery())
        total = int((await session.execute(count_stmt)).scalar_one())

        stmt: Select[tuple[Document]] = (
            select(Document)
            .where(and_(*where))
            .order_by(Document.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list((await session.execute(stmt)).scalars().all())
        return items, total

    async def get_document(self, session: AsyncSession, *, document_id: UUID) -> Document | None:
        stmt = select(Document).where(Document.id == document_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def create_document(
        self,
        session: AsyncSession,
        *,
        tenant_id: UUID,
        workspace_id: UUID,
        owner_id: UUID,
        created_by: UUID,
        title: str,
        document_type: str,
        engine: str,
        provider: str,
    ) -> Document:
        now = datetime.utcnow()
        doc = Document(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            title=title,
            document_type=document_type,
            engine=engine,
            status="active",
            provider=provider,
            current_version_no=1,
            current_version_id=None,
            owner_id=owner_id,
            created_by=created_by,
            updated_by=None,
            created_at=now,
            updated_at=now,
        )
        session.add(doc)
        await session.flush()
        return doc

    async def update_document_current_version(
        self,
        session: AsyncSession,
        *,
        document_id: UUID,
        current_version_no: int,
        current_version_id: UUID,
        updated_by: UUID,
    ) -> None:
        stmt = (
            update(Document)
            .where(Document.id == document_id)
            .values(current_version_no=current_version_no, current_version_id=current_version_id, updated_by=updated_by, updated_at=datetime.utcnow())
        )
        await session.execute(stmt)

    async def patch_document(
        self,
        session: AsyncSession,
        *,
        document_id: UUID,
        title: str | None,
        status: str | None,
        updated_by: UUID,
    ) -> None:
        values: dict[str, object] = {"updated_by": updated_by, "updated_at": datetime.utcnow()}
        if title is not None:
            values["title"] = title
        if status is not None:
            values["status"] = status
        stmt = update(Document).where(Document.id == document_id).values(**values)
        await session.execute(stmt)

    async def soft_delete_document(self, session: AsyncSession, *, document_id: UUID, updated_by: UUID) -> None:
        stmt = (
            update(Document)
            .where(Document.id == document_id)
            .values(status="deleted", deleted_at=datetime.utcnow(), updated_by=updated_by, updated_at=datetime.utcnow())
        )
        await session.execute(stmt)

    async def create_version(
        self,
        session: AsyncSession,
        *,
        document_id: UUID,
        version_no: int,
        snapshot_bucket: str,
        snapshot_key: str,
        snapshot_size_bytes: int,
        snapshot_checksum_sha256: str,
        engine: str,
        engine_version: str,
        schema_version: int,
        save_mode: str,
        created_by: UUID,
        created_from: str | None = None,
        related_interaction_id: str | None = None,
        related_patch_id: str | None = None,
    ) -> DocumentVersion:
        v = DocumentVersion(
            id=uuid4(),
            document_id=document_id,
            version_no=version_no,
            snapshot_bucket=snapshot_bucket,
            snapshot_key=snapshot_key,
            snapshot_size_bytes=snapshot_size_bytes,
            snapshot_checksum_sha256=snapshot_checksum_sha256,
            engine=engine,
            engine_version=engine_version,
            schema_version=schema_version,
            save_mode=save_mode,
            created_by=created_by,
            created_at=datetime.utcnow(),
            created_from=created_from,
            related_interaction_id=related_interaction_id,
            related_patch_id=related_patch_id,
        )
        session.add(v)
        await session.flush()
        return v

    async def list_versions(self, session: AsyncSession, *, document_id: UUID, page: int, page_size: int) -> tuple[list[DocumentVersion], int]:
        base = select(DocumentVersion).where(DocumentVersion.document_id == document_id)
        count_stmt = select(func.count()).select_from(base.subquery())
        total = int((await session.execute(count_stmt)).scalar_one())
        stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.version_no.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list((await session.execute(stmt)).scalars().all())
        return items, total

    async def get_version_by_no(self, session: AsyncSession, *, document_id: UUID, version_no: int) -> DocumentVersion | None:
        stmt = select(DocumentVersion).where(DocumentVersion.document_id == document_id, DocumentVersion.version_no == version_no)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def list_permissions(self, session: AsyncSession, *, document_id: UUID) -> list[DocumentPermission]:
        stmt = select(DocumentPermission).where(DocumentPermission.document_id == document_id)
        return list((await session.execute(stmt)).scalars().all())

    async def replace_permissions(
        self, session: AsyncSession, *, document_id: UUID, items: list[tuple[str, UUID, str]], created_by: UUID
    ) -> None:
        await session.execute(sa.delete(DocumentPermission).where(DocumentPermission.document_id == document_id))
        now = datetime.utcnow()
        for subject_type, subject_id, role in items:
            session.add(
                DocumentPermission(
                    document_id=document_id,
                    subject_type=subject_type,
                    subject_id=subject_id,
                    role=role,
                    created_by=created_by,
                    created_at=now,
                )
            )

    async def create_event(
        self,
        session: AsyncSession,
        *,
        document_id: UUID,
        event_type: str,
        actor_id: UUID,
        version_no: int | None = None,
        payload: dict[str, object] | None = None,
    ) -> DocumentEvent:
        ev = DocumentEvent(
            document_id=document_id,
            event_type=event_type,
            actor_id=actor_id,
            version_no=version_no,
            payload=payload,
            created_at=datetime.utcnow(),
        )
        session.add(ev)
        await session.flush()
        return ev

    async def list_events(self, session: AsyncSession, *, document_id: UUID, page: int, page_size: int) -> tuple[list[DocumentEvent], int]:
        base = select(DocumentEvent).where(DocumentEvent.document_id == document_id)
        count_stmt = select(func.count()).select_from(base.subquery())
        total = int((await session.execute(count_stmt)).scalar_one())
        stmt = (
            select(DocumentEvent)
            .where(DocumentEvent.document_id == document_id)
            .order_by(DocumentEvent.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list((await session.execute(stmt)).scalars().all())
        return items, total
