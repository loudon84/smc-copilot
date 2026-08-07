from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.deps import get_db_session, get_request_context
from app.modules.documents.exceptions import DocumentNotFound, DocumentServiceError, PermissionDenied, SnapshotTooLarge, VersionConflict
from app.modules.documents.permission import PermissionService
from app.modules.documents.repository import DocumentRepository
from app.modules.documents.schemas import (
    DocumentCreateRequest,
    DocumentListResponse,
    DocumentPermissionsReplaceRequest,
    DocumentPermissionsResponse,
    DocumentResponse,
    DocumentUpdateRequest,
    SnapshotEnvelope,
    SnapshotSaveRequest,
    SnapshotSaveResponse,
)
from app.modules.documents.service import DocumentService
from app.modules.documents.storage import SnapshotStorage


router = APIRouter(prefix="/documents", tags=["documents"])

_repo = DocumentRepository()
_permission = PermissionService(_repo)
_storage = SnapshotStorage()
_svc = DocumentService(_repo, _storage, _permission)


def _to_doc_response(doc, *, current_user_permission: str) -> DocumentResponse:
    return DocumentResponse(
        id=str(doc.id),
        title=doc.title,
        document_type=doc.document_type,
        engine=doc.engine,
        status=doc.status,
        provider=doc.provider,
        current_version_no=doc.current_version_no,
        owner_id=str(doc.owner_id),
        current_user_permission=current_user_permission,  # type: ignore[arg-type]
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _raise_http(e: DocumentServiceError) -> None:
    if isinstance(e, DocumentNotFound):
        raise HTTPException(status_code=404, detail={"code": e.code, "message": str(e)})
    if isinstance(e, PermissionDenied):
        raise HTTPException(status_code=403, detail={"code": e.code, "message": str(e)})
    if isinstance(e, VersionConflict):
        raise HTTPException(
            status_code=409,
            detail={
                "code": e.code,
                "message": str(e),
                "current_version_no": e.current_version_no,
                "base_version_no": e.base_version_no,
            },
        )
    if isinstance(e, SnapshotTooLarge):
        raise HTTPException(status_code=413, detail={"code": e.code, "message": str(e)})
    raise HTTPException(status_code=500, detail={"code": e.code, "message": str(e)})


@router.post("", response_model=DocumentResponse)
async def create_document(
    payload: DocumentCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            document_id, _version_no = await _svc.create_document(session, ctx=ctx, title=payload.title)
            doc = await _repo.get_document(session, document_id=document_id)
            assert doc is not None
            return _to_doc_response(doc, current_user_permission="owner")
    except DocumentServiceError as e:
        _raise_http(e)


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
    keyword: str | None = Query(default=None),
    status: str | None = Query(default="active"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
):
    async with session.begin():
        docs, total = await _repo.list_documents(
            session,
            workspace_id=ctx.workspace_id,
            keyword=keyword,
            status=status,
            page=page,
            page_size=page_size,
        )

        items: list[DocumentResponse] = []
        for doc in docs:
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=doc.id)
            if not _permission.can_view(role):
                continue
            items.append(_to_doc_response(doc, current_user_permission=role or "view"))

        return DocumentListResponse(items=items, page=page, page_size=page_size, total=total)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            doc = await _svc.get_document_or_404(session, document_id=document_id)
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=document_id)
            if not _permission.can_view(role):
                raise PermissionDenied()
            return _to_doc_response(doc, current_user_permission=role or "view")
    except DocumentServiceError as e:
        _raise_http(e)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def patch_document(
    document_id: UUID,
    payload: DocumentUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            doc = await _svc.get_document_or_404(session, document_id=document_id)
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=document_id)
            if not _permission.can_edit(role):
                raise PermissionDenied()
            await _repo.patch_document(session, document_id=document_id, title=payload.title, status=payload.status, updated_by=ctx.user_id)
            doc2 = await _repo.get_document(session, document_id=document_id)
            assert doc2 is not None
            return _to_doc_response(doc2, current_user_permission=role or "edit")
    except DocumentServiceError as e:
        _raise_http(e)


@router.delete("/{document_id}")
async def delete_document(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            await _svc.get_document_or_404(session, document_id=document_id)
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=document_id)
            if not _permission.can_owner(role):
                raise PermissionDenied()
            await _repo.soft_delete_document(session, document_id=document_id, updated_by=ctx.user_id)
            return {"ok": True}
    except DocumentServiceError as e:
        _raise_http(e)


@router.get("/{document_id}/snapshot", response_model=SnapshotEnvelope)
async def get_snapshot(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            return await _svc.get_snapshot(session, ctx=ctx, document_id=document_id)
    except DocumentServiceError as e:
        _raise_http(e)


@router.put("/{document_id}/snapshot", response_model=SnapshotSaveResponse)
async def save_snapshot(
    document_id: UUID,
    payload: SnapshotSaveRequest,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            version_no, size_bytes, checksum, saved_at = await _svc.save_snapshot(session, ctx=ctx, document_id=document_id, req=payload)
            return SnapshotSaveResponse(
                document_id=str(document_id),
                version_no=version_no,
                snapshot_size_bytes=size_bytes,
                snapshot_checksum_sha256=checksum,
                saved_at=saved_at,
            )
    except DocumentServiceError as e:
        _raise_http(e)


@router.get("/{document_id}/versions")
async def list_versions(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
):
    try:
        async with session.begin():
            await _svc.get_document_or_404(session, document_id=document_id)
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=document_id)
            if not _permission.can_view(role):
                raise PermissionDenied()
            items, total = await _repo.list_versions(session, document_id=document_id, page=page, page_size=page_size)
            return {
                "items": [
                    {
                        "id": str(v.id),
                        "document_id": str(v.document_id),
                        "version_no": v.version_no,
                        "snapshot_bucket": v.snapshot_bucket,
                        "snapshot_key": v.snapshot_key,
                        "snapshot_size_bytes": v.snapshot_size_bytes,
                        "snapshot_checksum_sha256": v.snapshot_checksum_sha256,
                        "engine": v.engine,
                        "engine_version": v.engine_version,
                        "schema_version": v.schema_version,
                        "save_mode": v.save_mode,
                        "created_by": str(v.created_by),
                        "created_at": v.created_at,
                        "created_from": v.created_from,
                        "related_interaction_id": v.related_interaction_id,
                        "related_patch_id": v.related_patch_id,
                    }
                    for v in items
                ],
                "page": page,
                "page_size": page_size,
                "total": total,
            }
    except DocumentServiceError as e:
        _raise_http(e)


@router.get("/{document_id}/versions/{version_no}", response_model=SnapshotEnvelope)
async def get_version_snapshot(
    document_id: UUID,
    version_no: int,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            return await _svc.get_snapshot_by_version(session, ctx=ctx, document_id=document_id, version_no=version_no)
    except DocumentServiceError as e:
        _raise_http(e)


@router.get("/{document_id}/permissions", response_model=DocumentPermissionsResponse)
async def get_permissions(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            await _svc.get_document_or_404(session, document_id=document_id)
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=document_id)
            if not _permission.can_owner(role):
                raise PermissionDenied()
            perms = await _repo.list_permissions(session, document_id=document_id)
            return DocumentPermissionsResponse(
                items=[{"subject_type": p.subject_type, "subject_id": str(p.subject_id), "role": p.role} for p in perms]
            )
    except DocumentServiceError as e:
        _raise_http(e)


@router.put("/{document_id}/permissions", response_model=DocumentPermissionsResponse)
async def replace_permissions(
    document_id: UUID,
    payload: DocumentPermissionsReplaceRequest,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
):
    try:
        async with session.begin():
            await _svc.get_document_or_404(session, document_id=document_id)
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=document_id)
            if not _permission.can_owner(role):
                raise PermissionDenied()
            items = [(it.subject_type, UUID(it.subject_id), it.role) for it in payload.items]
            await _repo.replace_permissions(session, document_id=document_id, items=items, created_by=ctx.user_id)
            perms = await _repo.list_permissions(session, document_id=document_id)
            return DocumentPermissionsResponse(
                items=[{"subject_type": p.subject_type, "subject_id": str(p.subject_id), "role": p.role} for p in perms]
            )
    except DocumentServiceError as e:
        _raise_http(e)


@router.get("/{document_id}/events")
async def list_events(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    ctx: RequestContext = Depends(get_request_context),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    try:
        async with session.begin():
            await _svc.get_document_or_404(session, document_id=document_id)
            role = await _svc.get_current_user_role(session, ctx=ctx, document_id=document_id)
            if not _permission.can_view(role):
                raise PermissionDenied()
            items, total = await _repo.list_events(session, document_id=document_id, page=page, page_size=page_size)
            return {
                "items": [
                    {
                        "id": str(ev.id),
                        "document_id": str(ev.document_id),
                        "event_type": ev.event_type,
                        "actor_id": str(ev.actor_id),
                        "version_no": ev.version_no,
                        "payload": ev.payload,
                        "created_at": ev.created_at,
                    }
                    for ev in items
                ],
                "page": page,
                "page_size": page_size,
                "total": total,
            }
    except DocumentServiceError as e:
        _raise_http(e)
