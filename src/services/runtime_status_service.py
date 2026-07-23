from __future__ import annotations

import platform
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from core.capabilities import get_capability_registry
from core.config import Settings
from db.repositories.runtime_repo import RuntimeVersionRepository
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import (
    RuntimeCapabilitiesResponse,
    RuntimeCompatibilityResponse,
    RuntimeStatusResponse,
)
from version import __version__


class RuntimeStatusService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._versions = RuntimeVersionRepository(session)

    def layout(self) -> RuntimeLayout:
        layout = RuntimeLayout.from_root(self._settings.resolved_runtime_data_dir())
        layout.ensure()
        return layout

    async def status(self) -> RuntimeStatusResponse:
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
        return RuntimeStatusResponse(
            serviceVersion=__version__,
            apiVersion=caps.api_version,
            status="ready",
            hermesInstalled=hermes_installed,
            activeHermesVersion=active.version if active else None,
            platform=system,
            architecture=arch,
            features=caps.list_features(),
            dataDir=str(layout.root),
            hermesHome=str(self._settings.hermes_home_path),
        )

    def capabilities(self) -> RuntimeCapabilitiesResponse:
        caps = get_capability_registry()
        return RuntimeCapabilitiesResponse(apiVersion=caps.api_version, features=caps.list_features())

    def compatibility(self) -> RuntimeCompatibilityResponse:
        caps = get_capability_registry()
        return RuntimeCompatibilityResponse(
            apiVersion=caps.api_version,
            minDesktopApi="1.0",
            notes=["Use /runtime/capabilities for feature negotiation"],
        )
