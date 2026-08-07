from __future__ import annotations

import hashlib
import mimetypes
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

from core.errors import ChatApiError
from db.models.chat_attachment import ChatAttachment
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from schemas.attachments import ChatAttachmentResponse
from services.profile_ref_resolver import ProfileRefResolver
from services.workspace_guard import WorkspaceGuard

MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_FILES_PER_MESSAGE = 10
MAX_TOTAL_BYTES = 80 * 1024 * 1024
TEXT_PREVIEW_LIMIT = 120 * 1024

TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".json",
    ".csv",
    ".yaml",
    ".yml",
    ".log",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".sql",
    ".html",
    ".css",
}

_SAFE_NAME_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_name(name: str) -> str:
    base = Path(name).name
    cleaned = _SAFE_NAME_RE.sub("_", base).strip("._")
    return cleaned or "file"


class AttachmentService:
    def __init__(
        self,
        profile_repo: ProfileRepository,
        attachment_repo: ChatAttachmentRepository,
        workspace_repo: WorkspaceRepository,
    ) -> None:
        self._profiles = profile_repo
        self._attachments = attachment_repo
        self._workspaces = workspace_repo
        self._resolver = ProfileRefResolver(profile_repo)
        self._guard = WorkspaceGuard()

    async def resolve_workspace_root(self, workspace_id: str, profile_id: str) -> Path:
        row = await self._workspaces.get(workspace_id)
        if row is not None:
            return Path(row.root_path).resolve()
        profile = await self._resolver.require_profile(profile_id)
        if workspace_id == profile_id or workspace_id == profile.name:
            return Path(profile.profile_path).resolve()
        raise ChatApiError(
            "Workspace not found",
            code="WORKSPACE_NOT_FOUND",
            details={"workspace_id": workspace_id},
            http_status=404,
        )

    async def upload(
        self,
        *,
        workspace_id: str,
        profile_id: str,
        session_id: str,
        files: list[UploadFile],
    ) -> list[ChatAttachmentResponse]:
        await self._resolver.require_profile(profile_id)
        if len(files) > MAX_FILES_PER_MESSAGE:
            raise ChatApiError(
                "Too many attachments",
                code="TOO_MANY_ATTACHMENTS",
                http_status=400,
            )

        root = await self.resolve_workspace_root(workspace_id, profile_id)
        profile = await self._resolver.require_profile(profile_id)
        total = 0
        created: list[ChatAttachmentResponse] = []

        for upload in files:
            data = await upload.read()
            size = len(data)
            if size > MAX_FILE_BYTES:
                raise ChatApiError(
                    "Attachment too large",
                    code="ATTACHMENT_TOO_LARGE",
                    http_status=400,
                )
            total += size
            if total > MAX_TOTAL_BYTES:
                raise ChatApiError(
                    "Attachment total size exceeded",
                    code="ATTACHMENT_TOTAL_SIZE_EXCEEDED",
                    http_status=400,
                )

            original = upload.filename or "file"
            safe = _safe_name(original)
            att_id = f"att_{uuid.uuid4().hex[:12]}"
            rel_dir = Path(".aios/attachments") / profile.name / session_id
            rel_path = rel_dir / f"{att_id}_{safe}"
            self._guard.validate_path(str(root), str(rel_path))
            dest = (root / rel_path).resolve()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)

            sha = hashlib.sha256(data).hexdigest()
            mime = upload.content_type or mimetypes.guess_type(original)[0] or "application/octet-stream"
            text_preview: str | None = None
            suffix = Path(safe).suffix.lower()
            if suffix in TEXT_EXTENSIONS:
                try:
                    text_preview = data.decode("utf-8", errors="replace")[:TEXT_PREVIEW_LIMIT]
                except OSError:
                    text_preview = None

            row = ChatAttachment(
                id=att_id,
                profile_id=profile_id,
                workspace_id=workspace_id,
                session_id=session_id,
                original_name=original,
                safe_name=safe,
                mime_type=mime,
                size_bytes=size,
                sha256=sha,
                storage_path=str(dest),
                workspace_relative_path=str(rel_path).replace("\\", "/"),
                text_preview=text_preview,
                created_at=_utc_now(),
            )
            saved = await self._attachments.create(row)
            created.append(self._to_response(saved))

        return created

    async def remove(self, attachment_id: str) -> None:
        row = await self._attachments.get(attachment_id)
        if row is None:
            raise ChatApiError(
                "Attachment not found",
                code="ATTACHMENT_NOT_FOUND",
                http_status=404,
            )
        path = Path(row.storage_path)
        if path.is_file():
            path.unlink(missing_ok=True)
        await self._attachments.delete(row)

    async def load_scoped(
        self,
        *,
        profile_id: str,
        workspace_id: str,
        session_id: str,
        attachment_ids: list[str],
    ) -> list[ChatAttachment]:
        rows: list[ChatAttachment] = []
        for att_id in attachment_ids:
            row = await self._attachments.get(att_id)
            if row is None:
                raise ChatApiError(
                    "Attachment not found",
                    code="ATTACHMENT_NOT_FOUND",
                    http_status=404,
                )
            if (
                row.profile_id != profile_id
                or row.workspace_id != workspace_id
                or row.session_id != session_id
            ):
                raise ChatApiError(
                    "Attachment scope mismatch",
                    code="ATTACHMENT_SCOPE_MISMATCH",
                    http_status=400,
                )
            rows.append(row)
        return rows

    def build_attachment_context(self, rows: list[ChatAttachment]) -> str:
        if not rows:
            return ""
        lines = ["[Workspace Attachments]", ""]
        for idx, row in enumerate(rows, start=1):
            lines.append(f"{idx}. file: {row.original_name}")
            lines.append(f"   mime: {row.mime_type}")
            lines.append(f"   path: {row.workspace_relative_path}")
            lines.append(f"   sha256: {row.sha256}")
            if row.text_preview:
                lines.append("   content:")
                lines.append(row.text_preview)
            else:
                lines.append(
                    "   note: binary attachment. Use file tools inside workspace when needed."
                )
            lines.append("")
        return "\n".join(lines).strip()

    def _to_response(self, row: ChatAttachment) -> ChatAttachmentResponse:
        return ChatAttachmentResponse(
            id=row.id,
            profile_id=row.profile_id,
            workspace_id=row.workspace_id,
            session_id=row.session_id,
            name=row.original_name,
            mime_type=row.mime_type,
            size_bytes=row.size_bytes,
            sha256=row.sha256,
            workspace_relative_path=row.workspace_relative_path,
            text_preview=row.text_preview,
        )
