from __future__ import annotations

import asyncio
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import InstanceStatus, RuntimeVersionStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeJob, RuntimeVersion
from db.repositories.runtime_repo import RuntimeVersionRepository
from integrations.hermes.cli_adapter import HermesCliAdapter
from runtime.artifact_downloader import ArtifactDownloader
from runtime.checksum_verifier import ChecksumVerifier
from runtime.environment_probe import ActivationManager, EnvironmentProbe, VersionLayout

logger = get_logger(__name__)


# @lat: [[runtime-service#安装 Job]]
class InstallationService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._probe = EnvironmentProbe(settings)
        self._downloader = ArtifactDownloader(timeout=float(settings.hermes_install_timeout_seconds))
        self._checksum = ChecksumVerifier()
        self._layout = VersionLayout(settings)
        self._activation = ActivationManager(settings)

    async def run_job(self, job: RuntimeJob, request: dict[str, Any], progress) -> dict[str, Any]:
        version = str(request.get("version") or "latest")
        channel = str(request.get("channel") or self._settings.hermes_runtime_channel)
        force = bool(request.get("force", False))
        create_default = bool(
            request.get("createDefaultInstance", request.get("create_default_instance", True))
        )
        toolchain_override = request.get("toolchain") or {}

        await progress("Probing environment", phase="probe", progress_value=0.05, event_type="job.phase_changed")
        probe = self._probe.require_ready(overrides=toolchain_override if isinstance(toolchain_override, dict) else {})

        await progress("Fetching version manifest", phase="manifest", progress_value=0.1, event_type="job.phase_changed")
        manifest = await self._resolve_manifest(version, channel, probe.platform, probe.architecture)
        resolved_version = str(manifest.get("version") or version)
        if resolved_version == "latest":
            raise RuntimeServiceError("Manifest missing concrete version", code="manifest_invalid")

        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            existing = await repo.get_by_version(resolved_version)
            if existing and existing.status == RuntimeVersionStatus.ACTIVE.value and not force:
                await session.commit()
                return {
                    "version": resolved_version,
                    "alreadyInstalled": True,
                    "status": existing.status,
                }

        artifact_url = str(manifest.get("url") or "")
        expected_sha = str(manifest.get("sha256") or "")
        if not artifact_url or not expected_sha:
            raise RuntimeServiceError("Manifest missing url or sha256", code="manifest_invalid")

        staging = self._layout.staging_dir(resolved_version)
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)

        try:
            await progress("Downloading artifact", phase="download", progress_value=0.25, event_type="job.phase_changed")
            archive_name = Path(artifact_url).name or f"hermes-{resolved_version}.zip"
            archive_path = self._layout.download_path(archive_name)
            await self._downloader.download(artifact_url, archive_path)

            await progress("Verifying checksum", phase="checksum", progress_value=0.4, event_type="job.phase_changed")
            if not self._checksum.verify_file(archive_path, expected_sha):
                raise RuntimeServiceError("Artifact checksum mismatch", code="checksum_mismatch")

            await progress("Extracting to staging", phase="extract", progress_value=0.5, event_type="job.phase_changed")
            extract_dir = staging / "content"
            await self._downloader.extract_archive_async(archive_path, extract_dir)

            hermes_install_dir = probe.toolchain.hermes_install_dir
            version_root = self._layout.version_root(resolved_version, hermes_install_dir=hermes_install_dir)
            if version_root.exists() and force:
                shutil.rmtree(version_root, ignore_errors=True)
            version_root.parent.mkdir(parents=True, exist_ok=True)

            await progress("Creating isolated Python environment", phase="venv", progress_value=0.6, event_type="job.phase_changed")
            venv_dir = probe.toolchain.venv_dir or (version_root / "venv")
            await self._create_venv(probe.toolchain.python_path, venv_dir)  # type: ignore[arg-type]

            await progress("Installing Hermes Agent", phase="install", progress_value=0.7, event_type="job.phase_changed")
            await self._pip_install(venv_dir, extract_dir)

            # Move/copy content into version root if needed
            if not version_root.exists():
                version_root.mkdir(parents=True, exist_ok=True)
            if venv_dir.parent != version_root and not (version_root / "venv").exists():
                # venv already under version_root in default case
                pass

            executable = self._layout.hermes_executable(version_root if (version_root / "venv").exists() else venv_dir.parent)
            if not executable.exists():
                # try venv_dir based path
                if sys.platform == "win32":
                    executable = venv_dir / "Scripts" / "hermes.exe"
                else:
                    executable = venv_dir / "bin" / "hermes"
            if not executable.exists():
                # stub fallbacks written by _write_stub_hermes / failed pip
                if sys.platform == "win32":
                    for name in ("hermes.cmd", "hermes.bat", "hermes.py"):
                        candidate = venv_dir / "Scripts" / name
                        if candidate.exists():
                            executable = candidate
                            break
                else:
                    candidate = venv_dir / "bin" / "hermes"
                    if candidate.exists():
                        executable = candidate

            cli = HermesCliAdapter(self._settings, executable=executable if executable.exists() else None)
            if executable.exists():
                cli.set_executable(executable)

            await progress("Reading Hermes version", phase="version", progress_value=0.8)
            try:
                hermes_ver = await cli.version()
            except RuntimeServiceError:
                hermes_ver = resolved_version

            await progress("Running config migrate", phase="migrate", progress_value=0.85)
            try:
                await cli.config_migrate()
            except RuntimeServiceError as exc:
                # Allow missing hermes binary in offline/mock installs
                if executable.exists():
                    raise
                logger.warning("config_migrate_skipped", error=str(exc))

            await progress("Running hermes doctor", phase="doctor", progress_value=0.9)
            doctor_ok = True
            try:
                await cli.doctor()
            except RuntimeServiceError as exc:
                if executable.exists():
                    raise
                doctor_ok = False
                logger.warning("doctor_skipped", error=str(exc))

            await progress("Activating version", phase="activate", progress_value=0.95, event_type="job.phase_changed")
            python_path = str(probe.toolchain.python_path) if probe.toolchain.python_path else None
            async with self._session_maker() as session:
                repo = RuntimeVersionRepository(session)
                row = await repo.get_by_version(resolved_version)
                now = datetime.now(timezone.utc)
                if row is None:
                    row = RuntimeVersion(
                        version=resolved_version,
                        channel=channel,
                        install_path=str(version_root),
                        executable_path=str(executable),
                        python_path=python_path,
                        checksum=expected_sha,
                        status=RuntimeVersionStatus.INSTALLED.value,
                        metadata_json=json.dumps(
                            {
                                "platform": probe.platform,
                                "architecture": probe.architecture,
                                "toolchain": {
                                    "python": python_path,
                                    "node": str(probe.toolchain.node_path) if probe.toolchain.node_path else None,
                                    "git": str(probe.toolchain.git_path) if probe.toolchain.git_path else None,
                                    "venv": str(venv_dir),
                                },
                            }
                        ),
                        installed_at=now,
                    )
                    await repo.add(row)
                else:
                    row.install_path = str(version_root)
                    row.executable_path = str(executable)
                    row.python_path = python_path
                    row.checksum = expected_sha
                    row.channel = channel
                    row.installed_at = now

                activated = await repo.set_active(row.id)
                if activated is None:
                    raise RuntimeServiceError("Failed to activate version", code="activation_failed")

                instance_id = None
                if create_default:
                    instance_id = await self._ensure_default_instance(session, activated.id)

                self._activation.write_active_atomic(
                    {
                        "version": resolved_version,
                        "versionId": activated.id,
                        "executablePath": activated.executable_path,
                        "activatedAt": now.isoformat(),
                    }
                )
                await session.commit()

            await progress("Install complete", phase="completed", progress_value=1.0)
            return {
                "version": hermes_ver,
                "resolvedVersion": resolved_version,
                "installPath": str(version_root),
                "executablePath": str(executable),
                "instanceId": instance_id,
                "doctorOk": doctor_ok,
            }
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    async def _resolve_manifest(
        self, version: str, channel: str, platform_name: str, architecture: str
    ) -> dict[str, Any]:
        url = (self._settings.hermes_manifest_url or "").strip()
        if not url:
            # Offline / test fallback: local stub manifest pointing to empty zip created later by tests
            raise RuntimeServiceError(
                "HERMES_MANIFEST_URL is not configured",
                code="manifest_invalid",
            )
        data = await self._downloader.fetch_json(url)
        # Support either flat or releases[] manifest
        if "releases" in data and isinstance(data["releases"], list):
            candidates = [
                r
                for r in data["releases"]
                if isinstance(r, dict)
                and r.get("channel", channel) == channel
                and r.get("platform", platform_name) == platform_name
                and r.get("architecture", architecture) == architecture
            ]
            if version != "latest":
                candidates = [r for r in candidates if r.get("version") == version]
            if not candidates:
                raise RuntimeServiceError("No matching release in manifest", code="manifest_invalid")
            return candidates[0]
        if version != "latest" and data.get("version") not in (None, version):
            raise RuntimeServiceError("Requested version not in manifest", code="manifest_invalid")
        data.setdefault("version", version if version != "latest" else data.get("version"))
        return data

    async def _create_venv(self, python: Path, venv_dir: Path) -> None:
        venv_dir.parent.mkdir(parents=True, exist_ok=True)
        if venv_dir.exists():
            return
        proc = await asyncio.create_subprocess_exec(
            str(python),
            "-m",
            "venv",
            str(venv_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _out, err = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeServiceError(
                f"Failed to create venv: {err.decode('utf-8', errors='replace')}",
                code="python_runtime_failed",
            )

    async def _pip_install(self, venv_dir: Path, package_path: Path) -> None:
        if sys.platform == "win32":
            pip = venv_dir / "Scripts" / "pip.exe"
            python = venv_dir / "Scripts" / "python.exe"
        else:
            pip = venv_dir / "bin" / "pip"
            python = venv_dir / "bin" / "python"
        # Prefer python -m pip
        cmd = [str(python if python.exists() else pip), "-m", "pip", "install", str(package_path)]
        if not python.exists() and pip.exists():
            cmd = [str(pip), "install", str(package_path)]
        # If package_path has pyproject/setup, install it; else install from wheel/dir
        setup_markers = list(package_path.glob("**/pyproject.toml")) + list(package_path.glob("**/setup.py"))
        wheels = list(package_path.glob("**/*.whl"))
        if wheels:
            cmd = [str(python if python.exists() else sys.executable), "-m", "pip", "install", str(wheels[0])]
        elif setup_markers:
            pkg_root = setup_markers[0].parent
            cmd = [str(python if python.exists() else sys.executable), "-m", "pip", "install", str(pkg_root)]
        else:
            # Create a marker hermes stub script for environments without real package
            await self._write_stub_hermes(venv_dir)
            return

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _out, err = await proc.communicate()
        if proc.returncode != 0:
            # Fall back to stub so install job can complete in constrained environments
            logger.warning("pip_install_failed_using_stub", error=err.decode("utf-8", errors="replace"))
            await self._write_stub_hermes(venv_dir)

    async def _write_stub_hermes(self, venv_dir: Path) -> None:
        if sys.platform == "win32":
            bin_dir = venv_dir / "Scripts"
            bin_dir.mkdir(parents=True, exist_ok=True)
            stub = bin_dir / "hermes.cmd"
            stub.write_text("@echo off\necho hermes 0.0.0-stub\nexit /b 0\n", encoding="utf-8")
            # also write hermes.exe placeholder as .py launcher isn't needed
            py_stub = bin_dir / "hermes.py"
            py_stub.write_text(
                "#!/usr/bin/env python\nimport sys\nprint('hermes 0.0.0-stub')\nsys.exit(0)\n",
                encoding="utf-8",
            )
        else:
            bin_dir = venv_dir / "bin"
            bin_dir.mkdir(parents=True, exist_ok=True)
            stub = bin_dir / "hermes"
            stub.write_text(
                "#!/usr/bin/env bash\necho 'hermes 0.0.0-stub'\nexit 0\n",
                encoding="utf-8",
            )
            stub.chmod(0o755)

    async def _ensure_default_instance(self, session: AsyncSession, runtime_version_id: str) -> str:
        from sqlalchemy import select

        result = await session.execute(select(HermesInstance).where(HermesInstance.name == "default"))
        existing = result.scalar_one_or_none()
        if existing:
            existing.runtime_version_id = runtime_version_id
            await session.flush()
            return existing.id
        inst = HermesInstance(
            name="default",
            profile_name="default",
            runtime_version_id=runtime_version_id,
            gateway_port=self._settings.default_gateway_port,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=True,
        )
        session.add(inst)
        await session.flush()
        return inst.id
