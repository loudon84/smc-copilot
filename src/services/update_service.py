from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import RuntimeVersionStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import RuntimeJob
from db.repositories.runtime_repo import RuntimeVersionRepository
from runtime.environment_probe import ActivationManager
from services.installation_service import InstallationService

logger = get_logger(__name__)


class CompatibilityService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def check(self, from_version: str | None, to_version: str) -> dict[str, Any]:
        return {
            "compatible": True,
            "fromVersion": from_version,
            "toVersion": to_version,
            "warnings": [],
        }


class UpdateService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._install = InstallationService(settings, session_maker)
        self._compat = CompatibilityService(settings)
        self._activation = ActivationManager(settings)

    async def run_job(self, job: RuntimeJob, request: dict[str, Any], progress) -> dict[str, Any]:
        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            previous = await repo.get_active()
            previous_version = previous.version if previous else None
            previous_id = previous.id if previous else None
            await session.commit()

        await progress("Checking compatibility", phase="compat", progress_value=0.1, event_type="job.phase_changed")
        target = str(request.get("version") or "latest")
        compat = self._compat.check(previous_version, target)
        if not compat["compatible"]:
            raise RuntimeServiceError("Incompatible Hermes version", code="activation_failed", details=compat)

        await progress("Installing new version", phase="install", progress_value=0.3, event_type="job.phase_changed")
        try:
            result = await self._install.run_job(job, {**request, "createDefaultInstance": False}, progress)
        except Exception:
            if previous_id:
                await progress("Restoring previous version after failure", phase="restore", progress_value=0.5)
                async with self._session_maker() as session:
                    repo = RuntimeVersionRepository(session)
                    await repo.set_active(previous_id)
                    await session.commit()
            raise

        await self._cleanup_old_versions()
        result["previousVersion"] = previous_version
        result["compatibility"] = compat
        return result

    async def _cleanup_old_versions(self) -> None:
        max_old = self._settings.runtime_max_old_versions
        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            versions = await repo.list_all()
            inactive = [v for v in versions if v.status == RuntimeVersionStatus.INACTIVE.value]
            inactive.sort(key=lambda v: v.installed_at or v.created_at, reverse=True)
            for stale in inactive[max_old:]:
                # Do not delete if path missing; best-effort
                try:
                    path = Path(stale.install_path)
                    if path.exists():
                        shutil.rmtree(path, ignore_errors=True)
                    await repo.delete(stale)
                except Exception as exc:
                    logger.warning("version_cleanup_failed", version=stale.version, error=str(exc))
            await session.commit()


class RollbackService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._activation = ActivationManager(settings)

    async def run_job(self, job: RuntimeJob, request: dict[str, Any], progress) -> dict[str, Any]:
        target = request.get("version")
        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            current = await repo.get_active()
            if target:
                row = await repo.get_by_version(str(target))
            else:
                versions = await repo.list_all()
                inactive = [v for v in versions if v.status == RuntimeVersionStatus.INACTIVE.value]
                inactive.sort(key=lambda v: v.activated_at or v.installed_at or v.created_at, reverse=True)
                row = inactive[0] if inactive else None

            if row is None:
                raise RuntimeServiceError("No version available to rollback", code="not_found")
            if current and row.id == current.id:
                raise RuntimeServiceError("Target version is already active", code="invalid_state")

            await progress(
                f"Activating version {row.version}",
                phase="activate",
                progress_value=0.5,
                event_type="job.phase_changed",
            )
            activated = await repo.set_active(row.id)
            if activated is None:
                raise RuntimeServiceError("Rollback activation failed", code="activation_failed")

            self._activation.write_active_atomic(
                {
                    "version": activated.version,
                    "versionId": activated.id,
                    "executablePath": activated.executable_path,
                }
            )
            await session.commit()
            return {
                "version": activated.version,
                "previousVersion": current.version if current else None,
            }


class DoctorService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker

    async def run_job(self, job: RuntimeJob, request: dict[str, Any], progress) -> dict[str, Any]:
        from runtime.environment_probe import EnvironmentProbe
        from runtime.platform_paths import RuntimeLayout
        from pathlib import Path

        await progress("Collecting diagnostics", phase="probe", progress_value=0.2, event_type="job.phase_changed")
        probe = EnvironmentProbe(self._settings).probe()
        layout = RuntimeLayout.from_root(self._settings.resolved_runtime_data_dir())
        layout.ensure()

        checks: list[dict[str, Any]] = [
            {"name": "platform", "ok": True, "value": probe.platform},
            {"name": "architecture", "ok": True, "value": probe.architecture},
            {"name": "disk", "ok": probe.disk_free_bytes > 100 * 1024 * 1024, "value": probe.disk_free_bytes},
            {
                "name": "python",
                "ok": probe.toolchain.python_path is not None,
                "value": str(probe.toolchain.python_path) if probe.toolchain.python_path else None,
            },
            {
                "name": "node",
                "ok": True,
                "value": str(probe.toolchain.node_path) if probe.toolchain.node_path else None,
            },
            {
                "name": "git",
                "ok": True,
                "value": str(probe.toolchain.git_path) if probe.toolchain.git_path else None,
            },
            {"name": "runtime_data_dir", "ok": layout.root.exists(), "value": str(layout.root)},
            {
                "name": "hermes_home",
                "ok": True,
                "value": str(self._settings.hermes_home_path),
                "exists": self._settings.hermes_home_path.exists(),
            },
        ]

        async with self._session_maker() as session:
            from db.repositories.runtime_repo import RuntimeVersionRepository

            active = await RuntimeVersionRepository(session).get_active()
            checks.append(
                {
                    "name": "active_hermes",
                    "ok": active is not None,
                    "value": active.version if active else None,
                    "executableExists": Path(active.executable_path).exists() if active else False,
                }
            )
            await session.commit()

        await progress("Doctor complete", phase="completed", progress_value=1.0)
        return {"checks": checks, "ok": all(c.get("ok", True) for c in checks)}
