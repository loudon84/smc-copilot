from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from core.config import Settings
from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError

logger = get_logger(__name__)


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
                code="hermes_install_failed",
            ) from exc

    async def version(self) -> str:
        code, out, err = await self.run(["--version"], timeout=30)
        if code != 0:
            raise RuntimeServiceError(f"hermes --version failed: {err or out}", code="hermes_install_failed")
        text = (out or err).strip()
        # e.g. "hermes 0.19.0" or just "0.19.0"
        parts = text.split()
        for part in reversed(parts):
            if part[0].isdigit():
                return part
        return text

    async def doctor(self) -> dict[str, Any]:
        code, out, err = await self.run(
            ["doctor", "--json"],
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

    async def config_migrate(self) -> None:
        code, out, err = await self.run(["config", "migrate"], timeout=120)
        if code != 0:
            raise RuntimeServiceError(
                f"hermes config migrate failed: {err or out}",
                code="config_migrate_failed",
            )

    def gateway_command(self, *, profile_name: str, port: int) -> list[str]:
        return [
            self._hermes_bin(),
            "gateway",
            "run",
            "--profile",
            profile_name,
            "--port",
            str(port),
        ]
