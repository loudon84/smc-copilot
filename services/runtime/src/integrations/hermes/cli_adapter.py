from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

from core.config import Settings
from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError
from integrations.hermes.win_subprocess import windows_no_window_kwargs

logger = get_logger(__name__)

_DEFAULT_PROFILE_NAMES = frozenset({"default", ""})

# `hermes gateway status` / `hermes status` Gateway Service section.
_GATEWAY_RUNNING_RE = re.compile(
    r"(?:Gateway\s+is\s+running|Gateway\s+Service[\s\S]{0,200}?Status:\s*[^\n]*\brunning\b)",
    re.IGNORECASE,
)
_GATEWAY_NOT_RUNNING_RE = re.compile(
    r"(?:Gateway\s+is\s+not\s+running|Gateway\s+Service[\s\S]{0,200}?Status:\s*[^\n]*(?:not\s+running|stopped|inactive)\b)",
    re.IGNORECASE,
)


def parse_hermes_gateway_running(output: str) -> bool | None:
    """Parse Hermes status text for Gateway running state.

    Returns True/False when detectable, else None.
    """
    text = output or ""
    if _GATEWAY_NOT_RUNNING_RE.search(text):
        return False
    if _GATEWAY_RUNNING_RE.search(text):
        return True
    return None


class HermesCliAdapter:
    """Hermes CLI adapter — always uses argv arrays, never shell=True."""

    def __init__(self, settings: Settings, *, executable: Path | None = None) -> None:
        self._settings = settings
        self._executable = executable

    def set_executable(self, path: Path) -> None:
        self._executable = path

    def _hermes_bin(self) -> str:
        if self._executable is not None:
            return str(self._executable)
        return "hermes"

    @staticmethod
    def is_default_profile(profile_name: str | None) -> bool:
        name = (profile_name or "").strip().lower()
        return name in _DEFAULT_PROFILE_NAMES or name == "default"

    def build_profile_command(self, profile_name: str | None, *args: str) -> list[str]:
        """Build argv with optional top-level `-p <name>` for named profiles."""
        cmd = [self._hermes_bin()]
        if not self.is_default_profile(profile_name):
            cmd.extend(["-p", str(profile_name).strip()])
        cmd.extend(args)
        return cmd

    async def run(
        self,
        args: list[str],
        *,
        timeout: float | None = None,
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
    ) -> tuple[int, str, str]:
        cmd = [self._hermes_bin(), *args]
        logger.info("hermes_cli_run", cmd=cmd)
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(cwd) if cwd else str(self._settings.hermes_home_path),
                env=env,
                **windows_no_window_kwargs(),
            )
            try:
                stdout_b, stderr_b = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=timeout or self._settings.hermes_install_timeout_seconds,
                )
            except TimeoutError:
                proc.kill()
                await proc.wait()
                raise RuntimeServiceError("Hermes CLI timed out", code="hermes_install_failed") from None
            stdout = (stdout_b or b"").decode("utf-8", errors="replace")
            stderr = (stderr_b or b"").decode("utf-8", errors="replace")
            return proc.returncode or 0, stdout, stderr
        except FileNotFoundError as exc:
            raise RuntimeServiceError(
                f"Hermes executable not found: {cmd[0]}",
                code="hermes_executable_missing",
            ) from exc

    async def run_profile(
        self,
        profile_name: str | None,
        args: list[str],
        *,
        timeout: float | None = None,
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
    ) -> tuple[int, str, str]:
        """Run Hermes with profile-aware argv (default omits `-p`)."""
        # Re-use run() path but with full command including bin for consistent logging.
        cmd = self.build_profile_command(profile_name, *args)
        # Strip bin already included — run() prepends bin; pass args after bin.
        return await self.run(cmd[1:], timeout=timeout, cwd=cwd, env=env)

    async def version(self) -> str:
        code, out, err = await self.run(["--version"], timeout=30)
        if code != 0:
            raise RuntimeServiceError(
                f"hermes --version failed: {err or out}",
                code="hermes_version_invalid",
                details={"exitCode": code, "stderrTail": (err or out)[-2000:]},
            )
        text = (out or err).strip()
        if not text:
            raise RuntimeServiceError("hermes --version returned empty output", code="hermes_version_invalid")
        if "stub" in text.lower():
            raise RuntimeServiceError(
                f"hermes version looks like a stub: {text}",
                code="hermes_version_invalid",
            )
        parts = text.split()
        for part in reversed(parts):
            if part[0].isdigit():
                return part
        return text

    async def doctor(self, *, profile_name: str | None = None) -> dict[str, Any]:
        # PRD v1.3.1 FR-03: no --json flag; Runtime wraps exit/stdout/stderr.
        code, out, err = await self.run_profile(
            profile_name,
            ["doctor"],
            timeout=float(self._settings.hermes_doctor_timeout_seconds),
        )
        payload: dict[str, Any] = {"exitCode": code, "stdout": out, "stderr": err}
        if out.strip().startswith("{"):
            try:
                payload["report"] = json.loads(out)
            except json.JSONDecodeError:
                pass
        if code != 0:
            raise RuntimeServiceError(
                f"hermes doctor failed: {err or out}",
                code="doctor_failed",
                details=payload,
            )
        return payload

    async def config_migrate(self, *, profile_name: str | None = None) -> None:
        code, out, err = await self.run_profile(profile_name, ["config", "migrate"], timeout=120)
        if code != 0:
            raise RuntimeServiceError(
                f"hermes config migrate failed: {err or out}",
                code="config_migrate_failed",
                details={"exitCode": code, "stderrTail": (err or out)[-2000:]},
            )

    async def config_check(self, *, profile_name: str | None = None) -> dict[str, Any]:
        code, out, err = await self.run_profile(profile_name, ["config", "check"], timeout=60)
        payload: dict[str, Any] = {
            "ok": code == 0,
            "exitCode": code,
            "stdout": out,
            "stderr": err,
            "nativeCheck": True,
        }
        if code != 0:
            raise RuntimeServiceError(
                f"hermes config check failed: {err or out}",
                code="configuration_invalid",
                details={"exitCode": code, "stderrTail": (err or out)[-2000:]},
            )
        return payload

    def gateway_command(self, *, profile_name: str, port: int | None = None) -> list[str]:
        """Build gateway argv per v1.3.1 — no --profile/--port; port via env."""
        _ = port  # port is injected via API_SERVER_PORT env, not CLI
        # default: hermes gateway run --external-supervisor
        # named:   hermes -p <name> gateway run --external-supervisor
        return self.build_profile_command(profile_name, "gateway", "run", "--external-supervisor")

    async def probe_gateway_running(self, *, profile_name: str | None = None) -> bool | None:
        """Check Gateway via ``hermes gateway status`` (hidden console on Windows).

        Falls back to ``hermes status`` when gateway status output is inconclusive.
        """
        code, out, err = await self.run_profile(
            profile_name,
            ["gateway", "status"],
            timeout=45,
        )
        combined = f"{out}\n{err}"
        parsed = parse_hermes_gateway_running(combined)
        if parsed is not None:
            return parsed

        code2, out2, err2 = await self.run(["status"], timeout=60)
        _ = code, code2
        return parse_hermes_gateway_running(f"{out2}\n{err2}")
