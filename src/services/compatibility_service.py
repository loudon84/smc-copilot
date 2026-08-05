from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

from core.config import Settings
from runtime.environment_probe import EnvironmentProbe
from services.installation_service import _semver_key


# @lat: [[runtime-service#更新与回滚]]
class CompatibilityService:
    """Heuristic Hermes version compatibility checks for update planning."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._probe = EnvironmentProbe(settings)

    def check(self, from_version: str | None, to_version: str) -> dict[str, Any]:
        warnings: list[str] = []
        api_ok = True
        config_ok = True
        python_ok = True

        if from_version and to_version and to_version != "latest":
            from_key = _semver_key(from_version)
            to_key = _semver_key(to_version)
            if from_key[0] != to_key[0]:
                api_ok = False
                warnings.append(f"Major API version change {from_version} → {to_version}")
            elif from_key[1] != to_key[1]:
                warnings.append(f"Minor version change {from_version} → {to_version}; review config")

            if to_key < from_key:
                warnings.append(f"Downgrade requested from {from_version} to {to_version}")

        if to_version != "latest":
            config_ok = self._config_compatible(from_version, to_version, warnings)
            python_ok = self._python_compatible(warnings)

        compatible = api_ok and config_ok and python_ok
        return {
            "compatible": compatible,
            "fromVersion": from_version,
            "toVersion": to_version,
            "api": api_ok,
            "config": config_ok,
            "python": python_ok,
            "warnings": warnings,
        }

    def _config_compatible(
        self, from_version: str | None, to_version: str, warnings: list[str]
    ) -> bool:
        if not from_version:
            return True
        from_key = _semver_key(from_version)
        to_key = _semver_key(to_version)
        if to_key[0] > from_key[0]:
            warnings.append("Major bump may require config migration")
            return False
        return True

    def _python_compatible(self, warnings: list[str]) -> bool:
        try:
            probe = self._probe.probe()
            python_path = probe.toolchain.python_path
            if python_path is None or not Path(python_path).exists():
                warnings.append("Python toolchain not resolved for compatibility probe")
                return False
            version_text = self._read_python_version(python_path)
            match = re.search(r"(\d+)\.(\d+)", version_text)
            if not match:
                warnings.append("Could not parse Python version")
                return False
            major, minor = int(match.group(1)), int(match.group(2))
            if major < 3 or (major == 3 and minor < 10):
                warnings.append(f"Python {major}.{minor} below recommended 3.10+")
                return False
            return True
        except Exception as exc:
            warnings.append(f"Python probe failed: {exc}")
            return False

    def _read_python_version(self, python_path: Path) -> str:
        import subprocess

        proc = subprocess.run(
            [str(python_path), "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return (proc.stdout or proc.stderr or "").strip() or sys.version
