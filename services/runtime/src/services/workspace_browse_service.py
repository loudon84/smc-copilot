"""Workspace browse service for Chat Worktree (PRD v1.6 FR-06/FR-07/§70).

Runtime is the authorization layer: path traversal, symlink escape, and
non-context-folder access are rejected.
"""

from __future__ import annotations

import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from core.runtime_errors import RuntimeServiceError
from schemas.workspace import (
    WorkspaceEntry,
    WorkspaceFileResponse,
    WorkspaceListResponse,
    WorkspaceTerminalPathResponse,
)
from services.session_chat_settings_service import SessionChatSettingsService

MAX_READ_BYTES = 512 * 1024


class WorkspaceBrowseService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._settings_svc = SessionChatSettingsService(session)

    async def list_directory(
        self,
        instance_id: str,
        session_id: str,
        *,
        path: str | None = None,
    ) -> WorkspaceListResponse:
        root = await self._require_root(instance_id, session_id)
        target = self._resolve_under_root(root, path or ".")
        if not target.is_dir():
            raise RuntimeServiceError("Not a directory", code="not_a_directory")

        entries: list[WorkspaceEntry] = []
        try:
            children = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except OSError as exc:
            raise RuntimeServiceError(str(exc), code="workspace_list_failed") from exc

        for child in children:
            try:
                # Reject symlink escape: resolve and re-check under root.
                resolved = child.resolve()
                resolved.relative_to(root)
            except (OSError, ValueError):
                continue
            kind = "directory" if child.is_dir() else "file"
            size = None
            modified = None
            try:
                st = child.stat()
                size = int(st.st_size) if kind == "file" else None
                modified = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
            except OSError:
                pass
            entries.append(
                WorkspaceEntry(
                    name=child.name,
                    path=str(resolved),
                    kind=kind,  # type: ignore[arg-type]
                    sizeBytes=size,
                    modifiedAt=modified,
                )
            )
        return WorkspaceListResponse(root=str(root), path=str(target), entries=entries)

    async def read_file(
        self,
        instance_id: str,
        session_id: str,
        *,
        path: str,
    ) -> WorkspaceFileResponse:
        root = await self._require_root(instance_id, session_id)
        target = self._resolve_under_root(root, path)
        if not target.is_file():
            raise RuntimeServiceError("Not a file", code="not_a_file")
        try:
            data = target.read_bytes()
        except OSError as exc:
            raise RuntimeServiceError(str(exc), code="workspace_read_failed") from exc
        truncated = len(data) > MAX_READ_BYTES
        if truncated:
            data = data[:MAX_READ_BYTES]
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            content = data.decode("utf-8", errors="replace")
        mime, _ = mimetypes.guess_type(str(target))
        return WorkspaceFileResponse(
            path=str(target),
            name=target.name,
            content=content,
            mimeType=mime,
            sizeBytes=target.stat().st_size if target.exists() else len(data),
            truncated=truncated,
        )

    async def terminal_path(
        self, instance_id: str, session_id: str
    ) -> WorkspaceTerminalPathResponse:
        root = await self._require_root(instance_id, session_id)
        return WorkspaceTerminalPathResponse(path=str(root), validated=True)

    async def _require_root(self, instance_id: str, session_id: str) -> Path:
        folder = await self._settings_svc.resolve_context_folder(instance_id, session_id)
        if not folder:
            raise RuntimeServiceError(
                "Session has no contextFolder; bind a workspace first",
                code="context_folder_required",
            )
        root = Path(folder).resolve()
        if not root.exists() or not root.is_dir():
            raise RuntimeServiceError(
                f"contextFolder does not exist: {folder}",
                code="context_folder_missing",
            )
        return root

    def _resolve_under_root(self, root: Path, relative_or_abs: str) -> Path:
        raw = Path(relative_or_abs)
        # Block null bytes / suspicious segments early.
        if "\x00" in relative_or_abs:
            raise RuntimeServiceError("Invalid path", code="invalid_path")
        candidate = raw.resolve() if raw.is_absolute() else (root / raw).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise RuntimeServiceError("Path escapes workspace root", code="path_escape") from exc
        # Extra: if the path is a symlink, ensure the final target is still under root.
        if candidate.is_symlink() or os.path.islink(candidate):
            final = Path(os.path.realpath(candidate))
            try:
                final.relative_to(root)
            except ValueError as exc:
                raise RuntimeServiceError("Symlink escapes workspace root", code="symlink_escape") from exc
            return final
        return candidate
