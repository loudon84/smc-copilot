from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.context import RequestContext
from app.modules.documents.checksum import sha256_hex
from app.modules.documents.exceptions import DocumentNotFound, PermissionDenied, SnapshotTooLarge, VersionConflict
from app.modules.documents.models import DocumentPermission
from app.modules.documents.permission import PermissionService
from app.modules.documents.repository import DocumentRepository
from app.modules.documents.schemas import SnapshotEnvelope, SnapshotSaveRequest
from app.modules.documents.storage import SnapshotStorage


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _snapshot_key(*, tenant_id: UUID, workspace_id: UUID, document_id: UUID, version_no: int) -> str:
    return f"documents/{tenant_id}/{workspace_id}/{document_id}/versions/v{version_no:08d}.json"


def _create_empty_univer_snapshot() -> dict[str, object]:
    return {
        "id": "workbook",
        "name": "Untitled",
        "sheetOrder": ["sheet-001"],
        "sheets": {"sheet-001": {"id": "sheet-001", "name": "Sheet1", "cellData": {}}},
    }


class DocumentService:
    def __init__(self, repo: DocumentRepository, storage: SnapshotStorage, permission: PermissionService) -> None:
        self._repo = repo
        self._storage = storage
        self._permission = permission

    async def create_document(self, session: AsyncSession, *, ctx: RequestContext, title: str) -> tuple[UUID, int]:
        settings = get_settings()
        doc = await self._repo.create_document(
            session,
            tenant_id=ctx.tenant_id,
            workspace_id=ctx.workspace_id,
            owner_id=ctx.user_id,
            created_by=ctx.user_id,
            title=title,
            document_type="spreadsheet",
            engine="univer",
            provider="local",
        )

        version_no = 1
        envelope = SnapshotEnvelope(
            document_id=str(doc.id),
            document_type="spreadsheet",
            engine="univer",
            engine_version="0.x",
            schema_version=1,
            version_no=version_no,
            saved_at=_utc_now(),
            saved_by=str(ctx.user_id),
            snapshot=_create_empty_univer_snapshot(),
        )

        payload = json.dumps(envelope.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(payload) > settings.document_snapshot_max_bytes:
            raise SnapshotTooLarge()

        checksum = sha256_hex(payload)
        key = _snapshot_key(tenant_id=ctx.tenant_id, workspace_id=ctx.workspace_id, document_id=doc.id, version_no=version_no)
        await self._storage.put_snapshot(bucket=settings.document_snapshot_bucket, key=key, payload=payload)

        version = await self._repo.create_version(
            session,
            document_id=doc.id,
            version_no=version_no,
            snapshot_bucket=settings.document_snapshot_bucket,
            snapshot_key=key,
            snapshot_size_bytes=len(payload),
            snapshot_checksum_sha256=checksum,
            engine="univer",
            engine_version="0.x",
            schema_version=1,
            save_mode="system",
            created_by=ctx.user_id,
        )
        await self._repo.update_document_current_version(
            session,
            document_id=doc.id,
            current_version_no=version_no,
            current_version_id=version.id,
            updated_by=ctx.user_id,
        )

        session.add(
            DocumentPermission(
                id=uuid4(),
                document_id=doc.id,
                subject_type="user",
                subject_id=ctx.user_id,
                role="owner",
                created_by=ctx.user_id,
            )
        )
        await self._repo.create_event(
            session,
            document_id=doc.id,
            event_type="document.created",
            actor_id=ctx.user_id,
            version_no=version_no,
            payload={"title": title},
        )
        return doc.id, version_no

    async def get_document_or_404(self, session: AsyncSession, *, document_id: UUID):
        doc = await self._repo.get_document(session, document_id=document_id)
        if doc is None:
            raise DocumentNotFound()
        return doc

    async def get_current_user_role(self, session: AsyncSession, *, ctx: RequestContext, document_id: UUID) -> str | None:
        return await self._permission.get_user_role(
            session,
            document_id=document_id,
            user_id=ctx.user_id,
            roles=ctx.roles,
            departments=ctx.departments,
        )

    async def get_snapshot(self, session: AsyncSession, *, ctx: RequestContext, document_id: UUID) -> SnapshotEnvelope:
        doc = await self.get_document_or_404(session, document_id=document_id)

        role = await self.get_current_user_role(session, ctx=ctx, document_id=document_id)
        if not self._permission.can_view(role):
            raise PermissionDenied()

        version = await self._repo.get_version_by_no(session, document_id=document_id, version_no=doc.current_version_no)
        if version is None:
            raise DocumentNotFound("Current version not found")

        raw = await self._storage.get_snapshot(bucket=version.snapshot_bucket, key=version.snapshot_key)
        payload = json.loads(raw.decode("utf-8"))
        env = SnapshotEnvelope.model_validate(payload)
        await self._repo.create_event(
            session,
            document_id=document_id,
            event_type="snapshot.read",
            actor_id=ctx.user_id,
            version_no=doc.current_version_no,
            payload={"bucket": version.snapshot_bucket, "key": version.snapshot_key},
        )
        return env

    async def get_snapshot_by_version(
        self, session: AsyncSession, *, ctx: RequestContext, document_id: UUID, version_no: int
    ) -> SnapshotEnvelope:
        await self.get_document_or_404(session, document_id=document_id)
        role = await self.get_current_user_role(session, ctx=ctx, document_id=document_id)
        if not self._permission.can_view(role):
            raise PermissionDenied()

        version = await self._repo.get_version_by_no(session, document_id=document_id, version_no=version_no)
        if version is None:
            raise DocumentNotFound("Version not found")

        raw = await self._storage.get_snapshot(bucket=version.snapshot_bucket, key=version.snapshot_key)
        payload = json.loads(raw.decode("utf-8"))
        env = SnapshotEnvelope.model_validate(payload)
        await self._repo.create_event(
            session,
            document_id=document_id,
            event_type="snapshot.read",
            actor_id=ctx.user_id,
            version_no=version_no,
            payload={"bucket": version.snapshot_bucket, "key": version.snapshot_key},
        )
        return env

    async def save_snapshot(
        self,
        session: AsyncSession,
        *,
        ctx: RequestContext,
        document_id: UUID,
        req: SnapshotSaveRequest,
    ) -> tuple[int, int, str, datetime]:
        settings = get_settings()
        doc = await self.get_document_or_404(session, document_id=document_id)

        role = await self.get_current_user_role(session, ctx=ctx, document_id=document_id)
        if not self._permission.can_edit(role):
            raise PermissionDenied("Current user has no edit permission")

        if req.base_version_no != doc.current_version_no:
            raise VersionConflict(current_version_no=doc.current_version_no, base_version_no=req.base_version_no)

        next_version_no = doc.current_version_no + 1
        envelope = SnapshotEnvelope(
            document_id=str(doc.id),
            document_type="spreadsheet",
            engine="univer",
            engine_version=req.engine_version,
            schema_version=req.schema_version,
            version_no=next_version_no,
            saved_at=_utc_now(),
            saved_by=str(ctx.user_id),
            snapshot=req.snapshot,
        )
        payload = json.dumps(envelope.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(payload) > settings.document_snapshot_max_bytes:
            raise SnapshotTooLarge()

        checksum = sha256_hex(payload)
        key = _snapshot_key(tenant_id=ctx.tenant_id, workspace_id=ctx.workspace_id, document_id=doc.id, version_no=next_version_no)
        await self._storage.put_snapshot(bucket=settings.document_snapshot_bucket, key=key, payload=payload)

        version = await self._repo.create_version(
            session,
            document_id=doc.id,
            version_no=next_version_no,
            snapshot_bucket=settings.document_snapshot_bucket,
            snapshot_key=key,
            snapshot_size_bytes=len(payload),
            snapshot_checksum_sha256=checksum,
            engine="univer",
            engine_version=req.engine_version,
            schema_version=req.schema_version,
            save_mode=req.save_mode,
            created_by=ctx.user_id,
            created_from=req.created_from,
            related_interaction_id=req.related_interaction_id,
            related_patch_id=req.related_patch_id,
        )
        await self._repo.update_document_current_version(
            session,
            document_id=doc.id,
            current_version_no=next_version_no,
            current_version_id=version.id,
            updated_by=ctx.user_id,
        )
        await self._repo.create_event(
            session,
            document_id=doc.id,
            event_type="document.saved",
            actor_id=ctx.user_id,
            version_no=next_version_no,
            payload={
                "save_mode": req.save_mode,
                "created_from": req.created_from,
                "related_interaction_id": req.related_interaction_id,
                "related_patch_id": req.related_patch_id,
            },
        )
        await self._repo.create_event(
            session,
            document_id=doc.id,
            event_type="version.created",
            actor_id=ctx.user_id,
            version_no=next_version_no,
            payload={"checksum": checksum, "size_bytes": len(payload)},
        )
        return next_version_no, len(payload), checksum, envelope.saved_at
