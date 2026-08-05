"""Diagnostic bundle exporter (FR-28) — never includes secrets, tokens, .env, or chat bodies."""

from __future__ import annotations

import json
import shutil
import zipfile
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from db.repositories.runtime_repo import RuntimeJobRepository, RuntimeVersionRepository
from runtime.environment_probe import EnvironmentProbe
from runtime.platform_paths import RuntimeLayout
from services.runtime_status_service import RuntimeStatusService
from version import __version__


# @lat: [[runtime-service#诊断包]]
class DiagnosticBundleService:
    def __init__(self, settings: Settings, session: AsyncSession, *, app_state: Any | None = None) -> None:
        self._settings = settings
        self._session = session
        self._app_state = app_state
        self._layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        self._layout.ensure()

    async def create_bundle(self) -> dict[str, Any]:
        ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        staging = self._layout.staging / f"diagnostics-{ts}"
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)

        status_svc = RuntimeStatusService(self._settings, self._session, app_state=self._app_state)
        status = await status_svc.status()
        (staging / "runtime-status.json").write_text(
            json.dumps(status.model_dump(by_alias=True), indent=2, default=str),
            encoding="utf-8",
        )

        versions = await RuntimeVersionRepository(self._session).list_all()
        (staging / "runtime-versions.json").write_text(
            json.dumps(
                [
                    {
                        "id": v.id,
                        "version": v.version,
                        "status": v.status,
                        "channel": v.channel,
                        "installPath": v.install_path,
                        "executablePath": v.executable_path,
                    }
                    for v in versions
                ],
                indent=2,
            ),
            encoding="utf-8",
        )

        jobs = await RuntimeJobRepository(self._session).list_jobs(limit=50)
        (staging / "runtime-jobs.json").write_text(
            json.dumps(
                [
                    {
                        "id": j.id,
                        "type": j.job_type,
                        "status": j.status,
                        "phase": j.phase,
                        "errorCode": j.error_code,
                        "createdAt": j.created_at.isoformat() if j.created_at else None,
                    }
                    for j in jobs
                ],
                indent=2,
            ),
            encoding="utf-8",
        )

        probe = EnvironmentProbe(self._settings).probe()
        (staging / "environment.json").write_text(
            json.dumps(
                {
                    "serviceVersion": __version__,
                    "platform": probe.platform,
                    "architecture": probe.architecture,
                    "diskFreeBytes": probe.disk_free_bytes,
                    "errors": probe.errors,
                    "python": str(probe.toolchain.python_path) if probe.toolchain.python_path else None,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        # Config structure only (keys), never .env values
        hermes = self._settings.hermes_home_path
        config_structure: dict[str, Any] = {"hermesHome": str(hermes), "files": []}
        if hermes.exists():
            for p in hermes.rglob("*"):
                if p.is_file() and p.name not in (".env",) and not p.name.endswith(".dpapi"):
                    rel = str(p.relative_to(hermes))
                    if any(part in rel.lower() for part in ("secret", "token", "credential")):
                        continue
                    config_structure["files"].append(rel)
        (staging / "config-structure.json").write_text(
            json.dumps(config_structure, indent=2),
            encoding="utf-8",
        )

        (staging / "manifest-meta.json").write_text(
            json.dumps(
                {
                    "hermesManifestUrlConfigured": bool((self._settings.hermes_manifest_url or "").strip()),
                    "runtimeManifestUrlConfigured": bool(
                        (getattr(self._settings, "runtime_manifest_url", "") or "").strip()
                    ),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        # Log tails — strip lines that look like secrets
        logs_dir = staging / "logs"
        logs_dir.mkdir(exist_ok=True)
        log_root = self._settings.log_dir_path
        if log_root.exists():
            for log_file in sorted(log_root.glob("*.log"))[-5:]:
                lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()[-200:]
                safe = [
                    ln
                    for ln in lines
                    if not any(
                        tok in ln.upper()
                        for tok in ("API_KEY", "API_SERVER_KEY", "BEARER ", "PASSWORD", ".ENV")
                    )
                ]
                (logs_dir / log_file.name).write_text("\n".join(safe), encoding="utf-8")

        out_name = f"runtime-diagnostics-{ts}.zip"
        out_path = self._layout.root / "diagnostics" / out_name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path in staging.rglob("*"):
                if path.is_file():
                    zf.write(path, arcname=str(path.relative_to(staging)))
        shutil.rmtree(staging, ignore_errors=True)
        return {"path": str(out_path), "fileName": out_name}
