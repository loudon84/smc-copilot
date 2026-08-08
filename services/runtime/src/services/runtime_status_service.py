from __future__ import annotations

import platform
from pathlib import Path
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.capabilities import get_capability_registry
from core.config import Settings
from db.models.runtime import HermesInstance
from db.repositories.runtime_repo import RuntimeJobRepository, RuntimeVersionRepository
from runtime.environment_probe import EnvironmentProbe
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import (
    RuntimeCapabilitiesResponse,
    RuntimeCompatibilityResponse,
    RuntimeDomainReadiness,
    RuntimeReadinessResponse,
    RuntimeStatusResponse,
)
from services.secret_service import SecretStore
from version import __version__

_READINESS_STATUSES = frozenset({"starting", "ready", "degraded", "maintenance", "failed"})
_CHECK_OK = "ok"
_CHECK_FAILED = "failed"
_CHECK_DEGRADED = "degraded"
_CHECK_UNKNOWN = "unknown"
_CHECK_MISSING = "missing"

_SERVICE_KEYS = ("database", "migration", "secretStore", "jobWorker")
_EXECUTION_KEYS = ("hermes", "instance", "gateway")
_MAINTENANCE_KEYS = ("manifest", "disk")


class RuntimeStatusService:
    def __init__(self, settings: Settings, session: AsyncSession, *, app_state: Any | None = None) -> None:
        self._settings = settings
        self._session = session
        self._versions = RuntimeVersionRepository(session)
        self._jobs = RuntimeJobRepository(session)
        self._app_state = app_state

    def layout(self) -> RuntimeLayout:
        layout = RuntimeLayout.from_root(self._settings.resolved_runtime_data_dir())
        layout.ensure()
        return layout

    async def readiness_checks(self) -> dict[str, str]:
        checks: dict[str, str] = {}
        # database
        try:
            await self._session.execute(text("SELECT 1"))
            checks["database"] = _CHECK_OK
        except Exception:
            checks["database"] = _CHECK_FAILED

        # migration (alembic version table present)
        try:
            result = await self._session.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'")
            )
            checks["migration"] = _CHECK_OK if result.scalar_one_or_none() else _CHECK_DEGRADED
        except Exception:
            checks["migration"] = _CHECK_FAILED

        # job worker
        worker_running = False
        if self._app_state is not None:
            worker = getattr(self._app_state, "runtime_job_worker", None)
            worker_running = worker is not None and getattr(worker, "is_running", False)
        if worker_running:
            checks["jobWorker"] = _CHECK_OK
        elif self._app_state is not None and getattr(self._app_state, "_disable_workers", False):
            checks["jobWorker"] = _CHECK_DEGRADED
        else:
            incomplete = await self._jobs.list_incomplete()
            checks["jobWorker"] = _CHECK_DEGRADED if incomplete else _CHECK_OK

        # secretStore
        try:
            store = SecretStore(self._settings)
            store._load()  # noqa: SLF001
            checks["secretStore"] = _CHECK_OK
        except Exception:
            checks["secretStore"] = _CHECK_FAILED

        active = await self._versions.get_active()
        hermes_exe = Path(active.executable_path) if active else None
        checks["hermes"] = _CHECK_OK if active and hermes_exe and hermes_exe.exists() else _CHECK_FAILED

        # defaultInstance (also exposed as "instance" for readiness v2)
        result = await self._session.execute(select(HermesInstance).limit(1))
        default_inst = result.scalar_one_or_none()
        if default_inst is None:
            checks["defaultInstance"] = _CHECK_DEGRADED
            checks["instance"] = _CHECK_DEGRADED
        elif default_inst.status in ("running", "starting") and default_inst.healthy:
            checks["defaultInstance"] = _CHECK_OK
            checks["instance"] = _CHECK_OK
        elif default_inst.status in ("running", "starting"):
            checks["defaultInstance"] = _CHECK_DEGRADED
            checks["instance"] = _CHECK_DEGRADED
        else:
            checks["defaultInstance"] = _CHECK_FAILED
            checks["instance"] = _CHECK_FAILED

        # gateway (any running instance)
        result = await self._session.execute(
            select(HermesInstance).where(HermesInstance.status.in_(("running", "starting")))
        )
        running = list(result.scalars().all())
        if not running:
            checks["gateway"] = _CHECK_DEGRADED
        elif all(i.healthy for i in running):
            checks["gateway"] = _CHECK_OK
        else:
            checks["gateway"] = _CHECK_DEGRADED

        # disk
        try:
            probe = EnvironmentProbe(self._settings).probe()
            checks["disk"] = _CHECK_OK if probe.disk_free_bytes >= 500 * 1024 * 1024 else _CHECK_DEGRADED
        except Exception:
            checks["disk"] = _CHECK_UNKNOWN

        # manifest URL configured
        manifest_url = (self._settings.hermes_manifest_url or "").strip()
        checks["manifest"] = _CHECK_OK if manifest_url else _CHECK_MISSING

        return checks

    def _domain_ready(self, checks: dict[str, str], keys: tuple[str, ...]) -> bool:
        return all(checks.get(k, _CHECK_FAILED) == _CHECK_OK for k in keys)

    def _subset(self, checks: dict[str, str], keys: tuple[str, ...]) -> dict[str, str]:
        return {k: checks.get(k, _CHECK_UNKNOWN) for k in keys}

    async def readiness_v2(self) -> RuntimeReadinessResponse:
        """PRD v1.4 domain readiness — does not collapse maintenance into service failure."""
        checks = await self.readiness_checks()
        service_ready = self._domain_ready(checks, _SERVICE_KEYS)
        execution_ok = self._domain_ready(checks, _EXECUTION_KEYS)
        # Chat/Task ready when hermes+instance+gateway are healthy
        chat_ready = execution_ok
        task_ready = execution_ok
        maintenance_ready = checks.get("manifest") == _CHECK_OK

        expert_status = "unknown"
        expert_ready = False
        try:
            from services.expert_mcp_gateway_service import ExpertMcpGatewayService

            expert = await ExpertMcpGatewayService(self._settings, self._session).status()
            expert_status = str(expert.get("status") or "unknown")
            expert_ready = bool(expert.get("ready"))
        except Exception:
            expert_status = "unavailable"
            expert_ready = False

        return RuntimeReadinessResponse(
            service=RuntimeDomainReadiness(
                ready=service_ready,
                checks=self._subset(checks, _SERVICE_KEYS),
            ),
            execution=RuntimeDomainReadiness(
                ready=execution_ok,
                chatReady=chat_ready,
                taskReady=task_ready,
                checks=self._subset(checks, _EXECUTION_KEYS),
            ),
            maintenance=RuntimeDomainReadiness(
                ready=maintenance_ready,
                checks=self._subset(checks, _MAINTENANCE_KEYS),
            ),
            expertMcp=RuntimeDomainReadiness(
                ready=expert_ready,
                status=expert_status,
                checks={"expertMcp": _CHECK_OK if expert_ready else _CHECK_DEGRADED},
            ),
        )

    def _aggregate_status(self, checks: dict[str, str], *, maintenance: bool = False) -> str:
        """Legacy single-status aggregation for /runtime/status (compat).

        v1.4 Desktop should prefer /runtime/readiness so missing manifest does not
        mark the whole Runtime as degraded.
        """
        if maintenance:
            return "maintenance"
        # Only service-critical failures collapse to failed/degraded for legacy status.
        service_values = {checks.get(k) for k in _SERVICE_KEYS}
        if _CHECK_FAILED in service_values:
            if checks.get("database") == _CHECK_FAILED:
                return "failed"
            return "degraded"
        if _CHECK_DEGRADED in service_values:
            return "degraded"
        return "ready"

    async def status(self, *, maintenance: bool = False) -> RuntimeStatusResponse:
        active = await self._versions.get_active()
        caps = get_capability_registry()
        layout = self.layout()
        arch = platform.machine().lower() or "unknown"
        if arch in ("amd64", "x86_64"):
            arch = "x86_64"
        elif arch in ("arm64", "aarch64"):
            arch = "arm64"
        system = platform.system().lower()
        if system == "darwin":
            system = "macos"
        hermes_exe = Path(active.executable_path) if active else None
        hermes_installed = bool(active and hermes_exe and hermes_exe.exists())
        checks = await self.readiness_checks()
        aggregate = self._aggregate_status(checks, maintenance=maintenance)
        if aggregate not in _READINESS_STATUSES:
            aggregate = "ready"
        return RuntimeStatusResponse(
            serviceVersion=__version__,
            apiVersion=caps.api_version,
            status=aggregate,
            checks=checks,
            hermesInstalled=hermes_installed,
            activeHermesVersion=active.version if active else None,
            platform=system,
            architecture=arch,
            features=caps.list_features(),
            dataDir=str(layout.root),
            hermesHome=str(self._settings.hermes_home_path),
        )

    def capabilities(self) -> RuntimeCapabilitiesResponse:
        from schemas.runtime import RuntimeCapabilitiesResponse

        caps = get_capability_registry()
        return RuntimeCapabilitiesResponse(apiVersion=caps.api_version, features=caps.list_features())

    def compatibility(self) -> RuntimeCompatibilityResponse:
        from schemas.runtime import RuntimeCompatibilityResponse

        caps = get_capability_registry()
        return RuntimeCompatibilityResponse(
            apiVersion=caps.api_version,
            minDesktopApi="1.0",
            notes=["Use /runtime/capabilities for feature negotiation"],
        )
