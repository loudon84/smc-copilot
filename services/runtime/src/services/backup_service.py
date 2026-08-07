from __future__ import annotations

import json
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_enums import InstanceStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import Device, HermesInstance
from runtime.platform_paths import RuntimeLayout
from services.secret_service import SecretService

# Paths/names excluded from default backup (FR-26)
_BACKUP_EXCLUDE_NAMES = frozenset({".env", "config.local.yaml"})
_BACKUP_EXCLUDE_SUFFIXES = (".dpapi",)
_SECRET_NAME_PATTERNS = (
    "API_SERVER_KEY",
    "DEVICE_TOKEN",
    "DASHSCOPE_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
)


def _should_exclude_backup_path(name: str) -> bool:
    if name in _BACKUP_EXCLUDE_NAMES:
        return True
    if any(name.endswith(suffix) for suffix in _BACKUP_EXCLUDE_SUFFIXES):
        return True
    upper = name.upper()
    if upper.endswith("_API_KEY") or upper.endswith("_TOKEN"):
        return True
    for pattern in _SECRET_NAME_PATTERNS:
        if pattern in upper:
            return True
    return False


class BackupService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        *,
        supervisor=None,
    ) -> None:
        self._settings = settings
        self._session = session
        self._supervisor = supervisor
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
                    "createdAt": datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).isoformat(),
                }
            )
        return items

    async def _secret_metadata(self) -> list[dict[str, Any]]:
        svc = SecretService(self._settings, self._session)
        # Collect metadata across common scopes without exposing values
        scopes = {"runtime", "default"}
        result = await self._session.execute(
            select(HermesInstance.profile_name).distinct()
        )
        for name in result.scalars().all():
            if name:
                scopes.add(str(name))
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for scope in scopes:
            for meta in await svc.list_meta(scope):
                if meta.name in seen:
                    continue
                seen.add(meta.name)
                out.append({"name": meta.name, "configured": True})
        # Device token presence as metadata only
        devices = await self._session.execute(select(Device).limit(1))
        if devices.scalar_one_or_none() is not None:
            out.append({"name": "DEVICE_TOKEN", "configured": True})
        return out

    def create(
        self,
        *,
        include_sessions: bool = True,
        include_skills: bool = True,
        include_memories: bool = True,
        include_secrets: bool = False,
        dpapi_user_bound: bool = False,
    ) -> dict[str, Any]:
        """Sync wrapper — prefer create_async in API handlers."""
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            raise RuntimeServiceError(
                "Use create_async from async context",
                code="validation_error",
            )
        return asyncio.run(
            self.create_async(
                include_sessions=include_sessions,
                include_skills=include_skills,
                include_memories=include_memories,
                include_secrets=include_secrets,
                dpapi_user_bound=dpapi_user_bound,
            )
        )

    async def create_async(
        self,
        *,
        include_sessions: bool = True,
        include_skills: bool = True,
        include_memories: bool = True,
        include_secrets: bool = False,
        dpapi_user_bound: bool = False,
    ) -> dict[str, Any]:
        if include_secrets and not dpapi_user_bound:
            raise RuntimeServiceError(
                "include_secrets requires dpapi_user_bound=true for current Windows user",
                code="policy_denied",
            )
        backup_id = str(uuid.uuid4())
        staging = self._layout.staging / f"backup-{backup_id}"
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)
        hermes = self._settings.hermes_home_path
        for name in ("config.yaml", "profiles"):
            if _should_exclude_backup_path(name):
                continue
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
        if include_secrets:
            secrets_dir = staging / "secrets"
            secrets_dir.mkdir(parents=True, exist_ok=True)
            store_root = self._layout.root
            for dpapi_file in store_root.glob("*.dpapi"):
                shutil.copy2(dpapi_file, secrets_dir / dpapi_file.name)
            (secrets_dir / "RESTORE_NOTICE.txt").write_text(
                "DPAPI secrets are bound to the Windows user that created this backup.\n"
                "Cross-user restore is not supported.\n",
                encoding="utf-8",
            )
        meta = {
            "backupId": backup_id,
            "createdAt": datetime.now(UTC).isoformat(),
            "includeSecrets": include_secrets,
            "dpapiUserBound": dpapi_user_bound if include_secrets else False,
            "secrets": await self._secret_metadata(),
            "excluded": [".env", "*.dpapi", "provider secrets", "API_SERVER_KEY", "device tokens"],
        }
        (staging / "manifest.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        archive = self._layout.backups / f"backup-{backup_id}"
        shutil.make_archive(str(archive), "zip", root_dir=staging)
        shutil.rmtree(staging, ignore_errors=True)
        zip_path = Path(str(archive) + ".zip")
        return {"backupId": backup_id, "path": str(zip_path)}

    async def _stop_running_instances(self) -> list[str]:
        stopped: list[str] = []
        result = await self._session.execute(select(HermesInstance))
        instances = list(result.scalars().all())
        for inst in instances:
            if inst.status in (InstanceStatus.RUNNING.value, InstanceStatus.STARTING.value):
                if self._supervisor is not None:
                    from services.instance_service import InstanceService

                    await InstanceService(self._settings, self._session, supervisor=self._supervisor).stop(inst.id)
                    stopped.append(inst.id)
                else:
                    inst.status = InstanceStatus.STOPPED.value
                    inst.healthy = False
                    inst.pid = None
                    stopped.append(inst.id)
        if stopped:
            await self._session.flush()
        return stopped

    async def restore(self, backup_id: str) -> dict[str, Any]:
        zip_path = self._layout.backups / f"backup-{backup_id}.zip"
        if not zip_path.exists():
            raise RuntimeServiceError(f"Backup not found: {backup_id}", code="not_found")
        resolved = zip_path.resolve()
        if self._layout.backups.resolve() not in resolved.parents and resolved.parent != self._layout.backups.resolve():
            raise RuntimeServiceError("Invalid backup path", code="policy_denied")
        stopped = await self._stop_running_instances()
        staging = self._layout.staging / f"restore-{backup_id}"
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        shutil.unpack_archive(str(zip_path), str(staging))
        hermes = self._settings.hermes_home_path
        hermes.mkdir(parents=True, exist_ok=True)
        for child in staging.iterdir():
            if child.name == "manifest.json":
                continue
            if _should_exclude_backup_path(child.name):
                continue
            dest = hermes / child.name
            if child.is_dir():
                if dest.exists():
                    shutil.rmtree(dest, ignore_errors=True)
                shutil.copytree(child, dest)
            else:
                shutil.copy2(child, dest)
        shutil.rmtree(staging, ignore_errors=True)
        return {"backupId": backup_id, "restored": True, "stoppedInstances": stopped}

    def delete(self, backup_id: str) -> None:
        zip_path = self._layout.backups / f"backup-{backup_id}.zip"
        if not zip_path.exists():
            raise RuntimeServiceError(f"Backup not found: {backup_id}", code="not_found")
        zip_path.unlink()
