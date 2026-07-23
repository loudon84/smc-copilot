from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import ConfigSnapshot, HermesInstance
from runtime.checksum_verifier import sha256_file
from runtime.platform_paths import RuntimeLayout


class HermesConfigAdapter:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def profile_config_path(self, profile_name: str) -> Path:
        return self._settings.hermes_home_path / "profiles" / profile_name / "config.yaml"

    def read(self, profile_name: str) -> dict[str, Any]:
        path = self.profile_config_path(profile_name)
        if not path.exists():
            return {}
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            raise RuntimeServiceError("config.yaml is not a mapping", code="validation_error")
        return data

    def write(self, profile_name: str, data: dict[str, Any]) -> None:
        path = self.profile_config_path(profile_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")

    def validate(self, data: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if not isinstance(data, dict):
            errors.append("config must be an object")
        return errors


class ConfigurationService:
    RESTART_GROUPS = frozenset({"gateway", "provider", "model", "runtime"})

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._adapter = HermesConfigAdapter(settings)
        self._layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        self._layout.ensure()

    async def _instance(self, instance_id: str) -> HermesInstance:
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        return inst

    async def get(self, instance_id: str) -> dict[str, Any]:
        inst = await self._instance(instance_id)
        return self._adapter.read(inst.profile_name)

    async def create_snapshot(self, instance_id: str, reason: str) -> ConfigSnapshot:
        inst = await self._instance(instance_id)
        src = self._adapter.profile_config_path(inst.profile_name)
        snap_dir = self._layout.backups / "config_snapshots" / instance_id
        snap_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        dest = snap_dir / f"{stamp}.yaml"
        if src.exists():
            shutil.copy2(src, dest)
            checksum = sha256_file(dest)
        else:
            dest.write_text("{}\n", encoding="utf-8")
            checksum = sha256_file(dest)
        row = ConfigSnapshot(
            instance_id=instance_id,
            reason=reason,
            runtime_version=None,
            snapshot_path=str(dest),
            checksum=checksum,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def patch(self, instance_id: str, values: dict[str, Any], *, group: str | None = None) -> dict[str, Any]:
        inst = await self._instance(instance_id)
        await self.create_snapshot(instance_id, reason=f"patch:{group or 'all'}")
        current = self._adapter.read(inst.profile_name)
        if group:
            section = current.get(group)
            if not isinstance(section, dict):
                section = {}
            section.update(values)
            current[group] = section
        else:
            current.update(values)
        errors = self._adapter.validate(current)
        if errors:
            raise RuntimeServiceError("; ".join(errors), code="validation_error")
        self._adapter.write(inst.profile_name, current)
        return {
            "configuration": current,
            "restartRequired": (group in self.RESTART_GROUPS) if group else False,
        }

    async def validate(self, instance_id: str) -> dict[str, Any]:
        inst = await self._instance(instance_id)
        data = self._adapter.read(inst.profile_name)
        errors = self._adapter.validate(data)
        return {"ok": not errors, "errors": errors}

    async def restore_latest_snapshot(self, instance_id: str) -> None:
        from sqlalchemy import select

        inst = await self._instance(instance_id)
        result = await self._session.execute(
            select(ConfigSnapshot)
            .where(ConfigSnapshot.instance_id == instance_id)
            .order_by(ConfigSnapshot.created_at.desc())
            .limit(1)
        )
        snap = result.scalar_one_or_none()
        if snap is None:
            return
        src = Path(snap.snapshot_path)
        if src.exists():
            dest = self._adapter.profile_config_path(inst.profile_name)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
