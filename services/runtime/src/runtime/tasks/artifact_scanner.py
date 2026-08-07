"""Scan task workspace for output artifacts (PRD v1.3 Phase 5)."""

from __future__ import annotations

import hashlib
import mimetypes
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.logging import get_logger
from db.models.work_tasks import TaskArtifact
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.tasks.event_store import TaskEventStore

logger = get_logger(__name__)

_SKIP_NAMES = {".git", "__pycache__", "node_modules", ".DS_Store"}


class ArtifactScanner:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._tasks = WorkTaskRepository(session)
        self._events = TaskEventStore(settings, session)

    async def scan_directory(
        self,
        *,
        task_id: str,
        run_id: str,
        directory: Path,
        assignment_id: str | None = None,
    ) -> list[TaskArtifact]:
        """Best-effort scan; returns newly created artifact rows."""
        if not directory.is_dir():
            return []

        existing = await self._tasks.list_artifacts(task_id)
        known_paths = {a.local_path for a in existing if a.local_path}
        created: list[TaskArtifact] = []

        try:
            for path in sorted(directory.rglob("*")):
                if not path.is_file():
                    continue
                if any(part in _SKIP_NAMES for part in path.parts):
                    continue
                local_path = str(path.resolve())
                if local_path in known_paths:
                    continue
                stat = path.stat()
                content_type, _ = mimetypes.guess_type(path.name)
                checksum = hashlib.sha256(path.read_bytes()).hexdigest()
                row = TaskArtifact(
                    task_id=task_id,
                    run_id=run_id,
                    artifact_type="file",
                    local_path=local_path,
                    checksum=checksum,
                    size_bytes=stat.st_size,
                    content_type=content_type,
                    upload_status="local_only",
                )
                await self._tasks.add_artifact(row)
                known_paths.add(local_path)
                created.append(row)
                await self._events.append(
                    task_id=task_id,
                    run_id=run_id,
                    event_type="task.artifact.created",
                    payload={
                        "artifactId": row.id,
                        "localPath": local_path,
                        "artifactType": "file",
                        "sizeBytes": stat.st_size,
                        "contentType": content_type,
                    },
                    assignment_id=assignment_id,
                )
        except Exception:
            logger.exception("artifact_scan_failed", task_id=task_id, directory=str(directory))

        return created

    def resolve_output_dir(self, task_workspace_id: str | None, task_id: str) -> Path:
        base = self._settings.resolved_runtime_data_dir() / "workspaces"
        if task_workspace_id:
            return base / task_workspace_id / "outputs"
        return base / task_id / "outputs"
