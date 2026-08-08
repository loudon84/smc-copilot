"""Register external (non-managed) Hermes installations as RuntimeVersion rows."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_enums import RuntimeVersionStatus
from db.models.runtime import RuntimeVersion
from db.repositories.runtime_repo import RuntimeVersionRepository
from runtime.environment_probe import ActivationManager


EXTERNAL_DEV_SOURCE = "external-dev"
EXTERNAL_DEV_CHANNEL = "development"


class RuntimeVersionService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._repo = RuntimeVersionRepository(session)
        self._activation = ActivationManager(settings)

    async def register_external(
        self,
        *,
        version: str,
        executable_path: Path,
        install_path: Path | None = None,
        metadata: dict | None = None,
    ) -> RuntimeVersion:
        """Upsert an external-dev RuntimeVersion and activate it (PRD v1.4.1 §26–§30)."""
        exe = executable_path.expanduser().resolve()
        install = (install_path or exe.parent).expanduser().resolve()
        now = datetime.now(UTC)
        meta = {
            "source": EXTERNAL_DEV_SOURCE,
            "managed": False,
            **(metadata or {}),
        }
        meta_json = json.dumps(meta, ensure_ascii=False)

        existing = await self._repo.get_by_version(version)
        if existing is not None:
            same_exe = Path(existing.executable_path).resolve() == exe
            if same_exe:
                existing.channel = EXTERNAL_DEV_CHANNEL
                existing.install_path = str(install)
                existing.executable_path = str(exe)
                existing.metadata_json = meta_json
                existing.installed_at = existing.installed_at or now
                activated = await self._repo.set_active(existing.id)
                assert activated is not None
                self._write_active(activated)
                return activated
            # Same version string, different path — update in place.
            existing.channel = EXTERNAL_DEV_CHANNEL
            existing.install_path = str(install)
            existing.executable_path = str(exe)
            existing.metadata_json = meta_json
            existing.installed_at = now
            activated = await self._repo.set_active(existing.id)
            assert activated is not None
            self._write_active(activated)
            return activated

        # Deactivate previous external-dev rows when version changes.
        result = await self._session.execute(
            select(RuntimeVersion).where(RuntimeVersion.channel == EXTERNAL_DEV_CHANNEL)
        )
        for row in result.scalars().all():
            if row.status == RuntimeVersionStatus.ACTIVE.value:
                row.status = RuntimeVersionStatus.INSTALLED.value

        row = RuntimeVersion(
            version=version,
            channel=EXTERNAL_DEV_CHANNEL,
            install_path=str(install),
            executable_path=str(exe),
            status=RuntimeVersionStatus.INSTALLED.value,
            metadata_json=meta_json,
            installed_at=now,
            artifact_type="external-dev",
        )
        await self._repo.add(row)
        activated = await self._repo.set_active(row.id)
        assert activated is not None
        self._write_active(activated)
        return activated

    def _write_active(self, row: RuntimeVersion) -> None:
        self._activation.write_active_atomic(
            {
                "version": row.version,
                "versionId": row.id,
                "executablePath": row.executable_path,
                "activatedAt": (row.activated_at or datetime.now(UTC)).isoformat(),
                "source": EXTERNAL_DEV_SOURCE,
            }
        )
