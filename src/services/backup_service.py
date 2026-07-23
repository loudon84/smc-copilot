from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from runtime.platform_paths import RuntimeLayout


class BackupService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        self._layout.ensure()

    def list_backups(self) -> list[dict[str, Any]]:
        items = []
        for path in sorted(self._layout.backups.glob("backup-*.zip"), reverse=True):
            items.append(
                {
                    "backupId": path.stem.replace("backup-", "", 1),
                    "path": str(path),
                    "size": path.stat().st_size,
                    "createdAt": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
                }
            )
        return items

    def create(self, *, include_sessions: bool = True, include_skills: bool = True, include_memories: bool = True) -> dict[str, Any]:
        backup_id = str(uuid.uuid4())
        staging = self._layout.staging / f"backup-{backup_id}"
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)
        hermes = self._settings.hermes_home_path
        for name in ("config.yaml", ".env", "profiles"):
            src = hermes / name
            if src.exists():
                dest = staging / name
                if src.is_dir():
                    shutil.copytree(src, dest, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dest)
        if include_sessions and (hermes / "sessions").exists():
            shutil.copytree(hermes / "sessions", staging / "sessions", dirs_exist_ok=True)
        if include_skills and (hermes / "skills").exists():
            shutil.copytree(hermes / "skills", staging / "skills", dirs_exist_ok=True)
        if include_memories and (hermes / "memories").exists():
            shutil.copytree(hermes / "memories", staging / "memories", dirs_exist_ok=True)
        meta = {"backupId": backup_id, "createdAt": datetime.now(timezone.utc).isoformat()}
        (staging / "manifest.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        archive = self._layout.backups / f"backup-{backup_id}"
        shutil.make_archive(str(archive), "zip", root_dir=staging)
        shutil.rmtree(staging, ignore_errors=True)
        zip_path = Path(str(archive) + ".zip")
        return {"backupId": backup_id, "path": str(zip_path)}

    def restore(self, backup_id: str) -> dict[str, Any]:
        zip_path = self._layout.backups / f"backup-{backup_id}.zip"
        if not zip_path.exists():
            raise RuntimeServiceError(f"Backup not found: {backup_id}", code="not_found")
        # Path traversal guard
        resolved = zip_path.resolve()
        if self._layout.backups.resolve() not in resolved.parents and resolved.parent != self._layout.backups.resolve():
            raise RuntimeServiceError("Invalid backup path", code="policy_denied")
        staging = self._layout.staging / f"restore-{backup_id}"
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        shutil.unpack_archive(str(zip_path), str(staging))
        hermes = self._settings.hermes_home_path
        hermes.mkdir(parents=True, exist_ok=True)
        for child in staging.iterdir():
            if child.name == "manifest.json":
                continue
            dest = hermes / child.name
            if child.is_dir():
                if dest.exists():
                    shutil.rmtree(dest, ignore_errors=True)
                shutil.copytree(child, dest)
            else:
                shutil.copy2(child, dest)
        shutil.rmtree(staging, ignore_errors=True)
        return {"backupId": backup_id, "restored": True}

    def delete(self, backup_id: str) -> None:
        zip_path = self._layout.backups / f"backup-{backup_id}.zip"
        if not zip_path.exists():
            raise RuntimeServiceError(f"Backup not found: {backup_id}", code="not_found")
        zip_path.unlink()
