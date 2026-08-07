from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from schemas.attachments import ChatAttachmentResponse, RemoveAttachmentResponse, UploadAttachmentsResponse
from services.attachment_service import AttachmentService

router = APIRouter(tags=["attachments"])


def _attachment_service(session: AsyncSession = Depends(get_db_session)) -> AttachmentService:
    return AttachmentService(
        ProfileRepository(session),
        ChatAttachmentRepository(session),
        WorkspaceRepository(session),
    )


@router.post(
    "/workspaces/{workspace_id}/attachments",
    response_model=UploadAttachmentsResponse,
)
async def upload_attachments(
    workspace_id: str,
    profile_id: str = Form(...),
    session_id: str = Form(...),
    files: list[UploadFile] = File(...),
    svc: AttachmentService = Depends(_attachment_service),
) -> UploadAttachmentsResponse:
    rows = await svc.upload(
        workspace_id=workspace_id,
        profile_id=profile_id,
        session_id=session_id,
        files=files,
    )
    return UploadAttachmentsResponse(attachments=rows)


@router.delete(
    "/workspaces/{workspace_id}/attachments/{attachment_id}",
    response_model=RemoveAttachmentResponse,
)
async def remove_attachment(
    workspace_id: str,
    attachment_id: str,
    svc: AttachmentService = Depends(_attachment_service),
) -> RemoveAttachmentResponse:
    await svc.remove(attachment_id)
    return RemoveAttachmentResponse(ok=True)
