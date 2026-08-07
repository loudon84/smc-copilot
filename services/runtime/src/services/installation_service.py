from __future__ import annotations

import asyncio
import json
import shutil
import sys
from datetime import UTC, datetime
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
from runtime.artifact_signature import ArtifactSignatureVerifier
from runtime.cancellation_token import CancellationToken, JobCancelled
from runtime.checksum_verifier import ChecksumVerifier
from runtime.environment_probe import ActivationManager, EnvironmentProbe, VersionLayout

logger = get_logger(__name__)

_REQUIRED_MANIFEST_FIELDS = ("version", "channel", "platform", "architecture", "url", "sha256", "artifactType")


def _semver_key(version: str) -> tuple[int, int, int]:
    """Parse major.minor.patch for sorting; non-numeric parts ignored."""
    core = version.strip().lstrip("vV").split("+", 1)[0].split("-", 1)[0]
    parts = core.split(".")
    nums: list[int] = []
    for part in parts[:3]:
        digits = "".join(ch for ch in part if ch.isdigit())
        nums.append(int(digits) if digits else 0)
    while len(nums) < 3:
        nums.append(0)
    return nums[0], nums[1], nums[2]


def _find_installable(package_path: Path) -> tuple[str, Path]:
    """Return (artifact_type, path) for wheel or Python project root."""
    wheels = sorted(package_path.glob("**/*.whl"))
    if wheels:
        return "wheel", wheels[0]
    setup_markers = list(package_path.glob("**/pyproject.toml")) + list(package_path.glob("**/setup.py"))
    if setup_markers:
        return "source", setup_markers[0].parent
    raise RuntimeServiceError(
        "Hermes artifact contains no wheel or Python project",
        code="artifact_not_installable",
    )


def _resolve_hermes_executable(venv_dir: Path, version_root: Path) -> Path:
    candidates: list[Path] = []
    if sys.platform == "win32":
        candidates.extend(
            [
                venv_dir / "Scripts" / "hermes.exe",
                version_root / "venv" / "Scripts" / "hermes.exe",
            ]
        )
    else:
        candidates.extend(
            [
                venv_dir / "bin" / "hermes",
                version_root / "venv" / "bin" / "hermes",
            ]
        )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise RuntimeServiceError(
        "Hermes executable missing after install",
        code="hermes_executable_missing",
        details={"searched": [str(c) for c in candidates]},
    )


def _versions_compatible(reported: str, expected: str) -> bool:
    """Loose compatibility: exact match or same major.minor, or reported contains expected."""
    if not reported or not expected:
        return False
    if reported == expected:
        return True
    if expected in reported or reported in expected:
        return True
    a = _semver_key(reported)
    b = _semver_key(expected)
    return a[0] == b[0] and a[1] == b[1]


# @lat: [[runtime-service#安装 Job]]
class InstallationService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._probe = EnvironmentProbe(settings)
        self._downloader = ArtifactDownloader(timeout=float(settings.hermes_install_timeout_seconds), settings=settings)
        self._checksum = ChecksumVerifier()
        self._layout = VersionLayout(settings)
        self._activation = ActivationManager(settings)
        self._signature = ArtifactSignatureVerifier(self._load_public_keys())

    def _load_public_keys(self) -> dict[str, str]:
        raw = (self._settings.runtime_manifest_public_keys_json or "").strip()
        if not raw:
            return {}
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items()}
        except json.JSONDecodeError:
            pass
        return {}

    async def run_job(
        self,
        job: RuntimeJob,
        request: dict[str, Any],
        progress,
        cancellation_token: CancellationToken | None = None,
    ) -> dict[str, Any]:
        token = cancellation_token or CancellationToken()
        version = str(request.get("version") or "latest")
        channel = str(request.get("channel") or self._settings.hermes_runtime_channel)
        force = bool(request.get("force", False))
        create_default = bool(
            request.get("createDefaultInstance", request.get("create_default_instance", True))
        )
        activate_on_complete = create_default
        toolchain_override = request.get("toolchain") or {}
        self._current_pip_proc: asyncio.subprocess.Process | None = None

        token.raise_if_cancelled()
        await progress("Probing environment", phase="probe", progress_value=0.05, event_type="job.phase_changed")
        probe = self._probe.require_ready(overrides=toolchain_override if isinstance(toolchain_override, dict) else {})

        await progress("Fetching version manifest", phase="manifest", progress_value=0.1, event_type="job.phase_changed")
        manifest = await self._resolve_manifest(version, channel, probe.platform, probe.architecture)
        resolved_version = str(manifest.get("version") or version)
        if resolved_version == "latest":
            raise RuntimeServiceError("Manifest missing concrete version", code="manifest_invalid")
        artifact_type = str(manifest.get("artifactType") or manifest.get("artifact_type") or "unknown")

        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            existing = await repo.get_by_version(resolved_version)
            if existing and existing.status == RuntimeVersionStatus.ACTIVE.value and not force:
                await self._verify_existing_executable(existing, resolved_version)
                await session.commit()
                return {
                    "version": resolved_version,
                    "alreadyInstalled": True,
                    "status": existing.status,
                    "installPath": existing.install_path,
                    "executablePath": existing.executable_path,
                    "realExecutableVerified": True,
                    "stub": False,
                    "artifactType": artifact_type,
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
            token.raise_if_cancelled()
            await progress("Downloading artifact", phase="download", progress_value=0.25, event_type="job.phase_changed")
            archive_name = Path(artifact_url).name or f"hermes-{resolved_version}.zip"
            archive_path = self._layout.download_path(archive_name)
            await self._downloader.download(artifact_url, archive_path, cancellation_token=token)

            token.raise_if_cancelled()
            await progress("Verifying checksum", phase="checksum", progress_value=0.4, event_type="job.phase_changed")
            if not self._checksum.verify_file(archive_path, expected_sha):
                raise RuntimeServiceError("Artifact checksum mismatch", code="checksum_mismatch")

            token.raise_if_cancelled()
            await progress("Extracting to staging", phase="extract", progress_value=0.5, event_type="job.phase_changed")
            extract_dir = staging / "content"
            await self._downloader.extract_archive_async(archive_path, extract_dir)

            # Fail fast before creating venv if artifact is not installable (FR-01)
            detected_type, _pkg = _find_installable(extract_dir)
            if artifact_type == "unknown":
                artifact_type = detected_type

            hermes_install_dir = probe.toolchain.hermes_install_dir
            version_root = self._layout.version_root(resolved_version, hermes_install_dir=hermes_install_dir)
            if version_root.exists() and force:
                shutil.rmtree(version_root, ignore_errors=True)
            version_root.parent.mkdir(parents=True, exist_ok=True)

            token.raise_if_cancelled()
            await progress("Creating isolated Python environment", phase="venv", progress_value=0.6, event_type="job.phase_changed")
            venv_dir = probe.toolchain.venv_dir or (version_root / "venv")
            await self._create_venv(probe.toolchain.python_path, venv_dir, token)  # type: ignore[arg-type]

            token.raise_if_cancelled()
            await progress("Installing Hermes Agent", phase="install", progress_value=0.7, event_type="job.phase_changed")
            await self._pip_install(venv_dir, extract_dir, token)

            if not version_root.exists():
                version_root.mkdir(parents=True, exist_ok=True)

            executable = _resolve_hermes_executable(venv_dir, version_root)
            cli = HermesCliAdapter(self._settings, executable=executable)

            token.raise_if_cancelled()
            await progress("Verifying Hermes executable", phase="version", progress_value=0.8)
            hermes_ver = await cli.version()
            if not _versions_compatible(hermes_ver, resolved_version):
                raise RuntimeServiceError(
                    f"Installed version {hermes_ver!r} incompatible with manifest {resolved_version!r}",
                    code="hermes_version_invalid",
                    details={"reported": hermes_ver, "expected": resolved_version},
                )

            token.raise_if_cancelled()
            await progress("Running config migrate", phase="migrate", progress_value=0.85)
            await cli.config_migrate()

            token.raise_if_cancelled()
            await progress("Running hermes doctor", phase="doctor", progress_value=0.9)
            await cli.doctor()
            doctor_ok = True

            token.raise_if_cancelled()
            await progress("Activating version", phase="activate", progress_value=0.95, event_type="job.phase_changed")
            python_path = str(probe.toolchain.python_path) if probe.toolchain.python_path else None
            async with self._session_maker() as session:
                repo = RuntimeVersionRepository(session)
                row = await repo.get_by_version(resolved_version)
                now = datetime.now(UTC)
                if row is None:
                    row = RuntimeVersion(
                        version=resolved_version,
                        channel=channel,
                        install_path=str(version_root),
                        executable_path=str(executable),
                        python_path=python_path,
                        checksum=expected_sha,
                        artifact_type=artifact_type,
                        manifest_version=str(manifest.get("manifestVersion") or manifest.get("manifest_version") or ""),
                        signature_key_id=str(manifest.get("keyId") or manifest.get("key_id") or "") or None,
                        verified_at=now,
                        status=RuntimeVersionStatus.INSTALLED.value,
                        metadata_json=json.dumps(
                            {
                                "platform": probe.platform,
                                "architecture": probe.architecture,
                                "artifactType": artifact_type,
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
                    row.artifact_type = artifact_type
                    row.manifest_version = str(manifest.get("manifestVersion") or manifest.get("manifest_version") or "")
                    row.signature_key_id = str(manifest.get("keyId") or manifest.get("key_id") or "") or None
                    row.verified_at = now
                    row.installed_at = now

                instance_id = None
                if activate_on_complete:
                    activated = await repo.set_active(row.id)
                    if activated is None:
                        raise RuntimeServiceError("Failed to activate version", code="activation_failed")
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
                else:
                    row.status = RuntimeVersionStatus.INSTALLED.value

                await session.commit()

            await progress("Install complete", phase="completed", progress_value=1.0)
            return {
                "version": hermes_ver,
                "resolvedVersion": resolved_version,
                "installPath": str(version_root),
                "executablePath": str(executable),
                "instanceId": instance_id,
                "doctorOk": doctor_ok,
                "realExecutableVerified": True,
                "artifactType": artifact_type,
                "stub": False,
            }
        except JobCancelled:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            self._current_pip_proc = None

    async def _resolve_manifest(
        self, version: str, channel: str, platform_name: str, architecture: str
    ) -> dict[str, Any]:
        url = (self._settings.hermes_manifest_url or "").strip()
        if not url:
            raise RuntimeServiceError(
                "HERMES_MANIFEST_URL is not configured",
                code="manifest_invalid",
            )
        data = await self._downloader.fetch_json(url)
        if "payload" in data:
            data = self._signature.verify(data)
        if "releases" in data and isinstance(data["releases"], list):
            candidates = [
                r
                for r in data["releases"]
                if isinstance(r, dict)
                and str(r.get("channel", channel)) == channel
                and str(r.get("platform", platform_name)) == platform_name
                and str(r.get("architecture", architecture)) == architecture
            ]
            if version != "latest":
                candidates = [r for r in candidates if str(r.get("version")) == version]
            if not candidates:
                raise RuntimeServiceError("No matching release in manifest", code="manifest_invalid")
            # FR-02: pick highest semver, never array order
            candidates.sort(key=lambda r: _semver_key(str(r.get("version") or "0")), reverse=True)
            selected = candidates[0]
            if "payload" in selected:
                selected = self._signature.verify(selected)
            self._validate_manifest_release(selected, platform_name, architecture)
            return selected

        # Flat manifest
        if version != "latest" and data.get("version") not in (None, version):
            raise RuntimeServiceError("Requested version not in manifest", code="manifest_invalid")
        data.setdefault("version", version if version != "latest" else data.get("version"))
        data.setdefault("channel", channel)
        data.setdefault("platform", platform_name)
        data.setdefault("architecture", architecture)
        data.setdefault("artifactType", data.get("artifact_type") or "wheel-bundle")
        self._validate_manifest_release(data, platform_name, architecture)
        return data

    def _validate_manifest_release(
        self, release: dict[str, Any], platform_name: str, architecture: str
    ) -> None:
        missing = [f for f in _REQUIRED_MANIFEST_FIELDS if not release.get(f) and not release.get(f.replace("Type", "_type"))]
        # Accept artifact_type snake_case as alias
        if not release.get("artifactType") and release.get("artifact_type"):
            release["artifactType"] = release["artifact_type"]
            missing = [f for f in missing if f != "artifactType"]
        if missing:
            raise RuntimeServiceError(
                f"Manifest release missing fields: {', '.join(missing)}",
                code="manifest_invalid",
                details={"missing": missing},
            )
        if str(release.get("platform")) != platform_name:
            raise RuntimeServiceError(
                f"Artifact platform mismatch: {release.get('platform')} != {platform_name}",
                code="artifact_platform_mismatch",
            )
        if str(release.get("architecture")) != architecture:
            raise RuntimeServiceError(
                f"Artifact architecture mismatch: {release.get('architecture')} != {architecture}",
                code="artifact_architecture_mismatch",
            )

    async def _create_venv(self, python: Path, venv_dir: Path, token: CancellationToken) -> None:
        token.raise_if_cancelled()
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
        token.raise_if_cancelled()
        if proc.returncode != 0:
            raise RuntimeServiceError(
                f"Failed to create venv: {err.decode('utf-8', errors='replace')}",
                code="venv_creation_failed",
                details={"exitCode": proc.returncode, "stderrTail": err.decode("utf-8", errors="replace")[-2000:]},
            )

    async def _pip_install(self, venv_dir: Path, package_path: Path, token: CancellationToken) -> None:
        token.raise_if_cancelled()
        if sys.platform == "win32":
            python = venv_dir / "Scripts" / "python.exe"
        else:
            python = venv_dir / "bin" / "python"
        if not python.exists():
            raise RuntimeServiceError(
                f"venv python missing: {python}",
                code="venv_creation_failed",
            )

        _kind, target = _find_installable(package_path)
        cmd = [str(python), "-m", "pip", "install", str(target)]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._current_pip_proc = proc

        async def _wait_pip() -> tuple[bytes, bytes]:
            return await proc.communicate()

        wait_task = asyncio.create_task(_wait_pip())
        cancel_task = asyncio.create_task(token.wait_cancelled())
        done, pending = await asyncio.wait(
            {wait_task, cancel_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if cancel_task in done and token.is_cancelled:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
            for task in pending:
                task.cancel()
            raise JobCancelled()
        _out, err = wait_task.result()
        token.raise_if_cancelled()
        if proc.returncode != 0:
            stderr_text = err.decode("utf-8", errors="replace")
            logger.error("pip_install_failed", exit_code=proc.returncode, stderr_tail=stderr_text[-2000:])
            raise RuntimeServiceError(
                "Failed to install Hermes Agent",
                code="hermes_install_failed",
                details={"exitCode": proc.returncode, "stderrTail": stderr_text[-2000:]},
            )

    async def _verify_existing_executable(self, existing: RuntimeVersion, resolved_version: str) -> None:
        """Re-verify ACTIVE install before claiming alreadyInstalled + realExecutableVerified."""
        exe = Path(existing.executable_path or "")
        if not exe.is_file():
            raise RuntimeServiceError(
                f"Recorded executable missing for already-installed version: {exe}",
                code="hermes_executable_missing",
                details={"version": resolved_version, "executablePath": str(exe)},
            )
        # Stub markers from older broken installers must never short-circuit as verified
        stub_markers = ("# stub hermes", "print('hermes stub')", "hermes-stub")
        try:
            text = exe.read_text(encoding="utf-8", errors="ignore")[:4000]
        except OSError:
            text = ""
        if any(m in text for m in stub_markers) or exe.name.lower() in {"hermes.stub", "hermes-stub.exe"}:
            raise RuntimeServiceError(
                "Recorded Hermes executable looks like a stub; reinstall required",
                code="artifact_not_installable",
                details={"executablePath": str(exe)},
            )
        cli = HermesCliAdapter(self._settings, executable=exe)
        hermes_ver = await cli.version()
        if not _versions_compatible(hermes_ver, resolved_version):
            raise RuntimeServiceError(
                f"Already-installed version {hermes_ver!r} incompatible with {resolved_version!r}",
                code="hermes_version_invalid",
                details={"reported": hermes_ver, "expected": resolved_version},
            )
        await cli.doctor()

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
