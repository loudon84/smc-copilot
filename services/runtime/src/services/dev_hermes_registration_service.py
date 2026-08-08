"""Discover and register a local Hermes executable for development (PRD v1.4.1)."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from services.instance_service import InstanceService
from services.runtime_version_service import RuntimeVersionService

_VERSION_RE = re.compile(r"(\d+\.\d+(?:\.\d+)?)")


class DevHermesRegistrationError(RuntimeError):
    """Fatal bootstrap registration failure — must fail fast."""


@dataclass(frozen=True)
class DevHermesRegistrationResult:
    status: str
    executable: str | None = None
    version: str | None = None
    runtime_version_id: str | None = None
    instance_id: str | None = None
    message: str | None = None


def resolve_local_hermes(*, env: dict[str, str] | None = None) -> tuple[Path | None, bool]:
    """Return (path, from_explicit_override).

    Discovery order (PRD §21):
    1. HERMES_DEV_EXECUTABLE override
    2. shutil.which("hermes")
    """
    environ = env if env is not None else os.environ
    override = (environ.get("HERMES_DEV_EXECUTABLE") or "").strip()
    if override:
        path = Path(override).expanduser()
        if path.is_file():
            return path.resolve(), True
        discovered = shutil.which(override)
        if discovered:
            return Path(discovered).resolve(), True
        raise DevHermesRegistrationError(
            f"HERMES_DEV_EXECUTABLE is set but not found or not executable: {override}"
        )

    discovered = shutil.which("hermes")
    if discovered:
        return Path(discovered).resolve(), False
    return None, False


def parse_hermes_version(output: str) -> str:
    match = _VERSION_RE.search(output)
    if not match:
        raise DevHermesRegistrationError(f"Unable to parse Hermes version from: {output!r}")
    return match.group(1)


def validate_hermes_executable(exe: Path) -> str:
    if not exe.is_file():
        raise DevHermesRegistrationError(f"Hermes executable is not a file: {exe}")
    try:
        result = subprocess.run(
            [str(exe), "--version"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except OSError as exc:
        raise DevHermesRegistrationError(f"Hermes executable cannot run: {exe} ({exc})") from exc
    except subprocess.TimeoutExpired as exc:
        raise DevHermesRegistrationError(f"hermes --version timed out: {exe}") from exc

    if result.returncode != 0:
        raise DevHermesRegistrationError(
            f"hermes --version failed with exit {result.returncode}: "
            f"{(result.stderr or result.stdout or '').strip()[:200]}"
        )
    text = (result.stdout or result.stderr or "").strip()
    if not text:
        raise DevHermesRegistrationError("hermes --version produced empty output")
    return parse_hermes_version(text)


class DevHermesRegistrationService:
    def __init__(
        self,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        *,
        env: dict[str, str] | None = None,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._env = env

    async def register(self) -> DevHermesRegistrationResult:
        environ = self._env if self._env is not None else os.environ
        required = (environ.get("HERMES_DEV_REQUIRED") or "").strip() in ("1", "true", "TRUE", "yes")

        try:
            path, _explicit = resolve_local_hermes(env=environ)
        except DevHermesRegistrationError:
            raise

        if path is None:
            message = (
                "Local Hermes was not found. "
                "Runtime service will start without Agent execution."
            )
            if required:
                raise DevHermesRegistrationError(
                    "HERMES_DEV_REQUIRED=1 but no local Hermes executable was discovered"
                )
            return DevHermesRegistrationResult(status="skipped", message=message)

        version = validate_hermes_executable(path)

        async with self._session_maker() as session:
            version_svc = RuntimeVersionService(self._settings, session)
            row = await version_svc.register_external(
                version=version,
                executable_path=path,
                install_path=path.parent,
            )
            instance_id = await InstanceService(self._settings, session).ensure_default(row.id)
            await session.commit()

        return DevHermesRegistrationResult(
            status="ready",
            executable=str(path),
            version=version,
            runtime_version_id=row.id,
            instance_id=instance_id,
            message="registered / active",
        )
