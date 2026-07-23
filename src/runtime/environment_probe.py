from __future__ import annotations

import json
import platform
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from runtime.platform_paths import RuntimeLayout
from runtime.windows_program_paths import is_windows, require_under_programs_root


@dataclass
class ToolchainPaths:
    python_path: Path | None = None
    node_path: Path | None = None
    git_path: Path | None = None
    venv_dir: Path | None = None
    hermes_install_dir: Path | None = None


@dataclass
class ProbeResult:
    platform: str
    architecture: str
    disk_free_bytes: int
    toolchain: ToolchainPaths
    ok: bool = True
    errors: list[str] = field(default_factory=list)


class EnvironmentProbe:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def detect_platform(self) -> tuple[str, str]:
        system = platform.system().lower()
        if system == "darwin":
            system = "macos"
        elif system == "windows":
            system = "windows"
        elif system == "linux":
            system = "linux"
        else:
            raise RuntimeServiceError(f"Unsupported platform: {system}", code="unsupported_platform")

        arch = platform.machine().lower()
        if arch in ("amd64", "x86_64"):
            arch = "x86_64"
        elif arch in ("arm64", "aarch64"):
            arch = "arm64"
        else:
            raise RuntimeServiceError(f"Unsupported architecture: {arch}", code="unsupported_architecture")
        return system, arch

    def _resolve_executable(self, configured: str, names: list[str]) -> Path | None:
        if configured:
            p = Path(configured)
            if p.is_file():
                return p
            if p.is_dir():
                for name in names:
                    candidate = p / name
                    if candidate.is_file():
                        return candidate
                    if sys.platform == "win32":
                        for ext in (".exe", ".cmd", ".bat"):
                            c2 = p / f"{name}{ext}"
                            if c2.is_file():
                                return c2
            return None
        for name in names:
            found = shutil.which(name)
            if found:
                return Path(found)
        return None

    def resolve_toolchain(self, overrides: dict | None = None) -> ToolchainPaths:
        overrides = overrides or {}
        python = overrides.get("pythonPath") or overrides.get("python_path") or self._settings.toolchain_python_path
        node = overrides.get("nodePath") or overrides.get("node_path") or self._settings.toolchain_node_path
        git = overrides.get("gitPath") or overrides.get("git_path") or self._settings.toolchain_git_path
        venv = overrides.get("venvDir") or overrides.get("venv_dir") or self._settings.toolchain_venv_dir
        hermes = (
            overrides.get("hermesInstallDir")
            or overrides.get("hermes_install_dir")
            or self._settings.hermes_install_dir
        )
        # Windows：未指定时使用企业默认程序目录（服务态仍走 LOCALAPPDATA Runtime）
        if not hermes:
            default_install = self._settings.resolved_hermes_install_dir()
            hermes = str(default_install) if default_install else ""
        if not venv and self._settings.resolved_toolchain_venv_dir():
            venv = str(self._settings.resolved_toolchain_venv_dir())

        py_names = ["python3", "python", "py"]
        if sys.platform == "win32":
            py_names = ["python.exe", "python3.exe", "python", "py"]

        return ToolchainPaths(
            python_path=self._resolve_executable(python or "", py_names),
            node_path=self._resolve_executable(node or "", ["node", "node.exe"]),
            git_path=self._resolve_executable(git or "", ["git", "git.exe"]),
            venv_dir=Path(venv).expanduser().resolve() if venv else None,
            hermes_install_dir=Path(hermes).expanduser().resolve() if hermes else None,
        )

    def probe(self, *, overrides: dict | None = None, min_free_bytes: int = 500 * 1024 * 1024) -> ProbeResult:
        system, arch = self.detect_platform()
        layout = RuntimeLayout.from_root(self._settings.resolved_runtime_data_dir())
        layout.ensure()
        usage = shutil.disk_usage(layout.root)
        toolchain = self.resolve_toolchain(overrides)
        errors: list[str] = []
        if usage.free < min_free_bytes:
            errors.append(f"Insufficient disk space: {usage.free} < {min_free_bytes}")
        if toolchain.python_path is None:
            errors.append("Python executable not found")
        return ProbeResult(
            platform=system,
            architecture=arch,
            disk_free_bytes=usage.free,
            toolchain=toolchain,
            ok=not errors,
            errors=errors,
        )

    def require_ready(self, *, overrides: dict | None = None) -> ProbeResult:
        result = self.probe(overrides=overrides)
        if result.disk_free_bytes < 500 * 1024 * 1024:
            raise RuntimeServiceError(
                "Insufficient disk space for Hermes install",
                code="insufficient_disk_space",
                details={"freeBytes": result.disk_free_bytes},
            )
        if result.toolchain.python_path is None:
            raise RuntimeServiceError(
                "Python runtime not found; set TOOLCHAIN_PYTHON_PATH or install Python 3.12+",
                code="python_runtime_failed",
            )
        if is_windows():
            if result.toolchain.hermes_install_dir is not None:
                require_under_programs_root(result.toolchain.hermes_install_dir, label="HERMES_INSTALL_DIR")
            if result.toolchain.venv_dir is not None:
                require_under_programs_root(result.toolchain.venv_dir, label="TOOLCHAIN_VENV_DIR")
        return result


class VersionLayout:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        self.layout.ensure()

    def version_root(self, version: str, *, hermes_install_dir: Path | None = None) -> Path:
        if hermes_install_dir is not None:
            return hermes_install_dir / version
        return self.layout.version_dir(version)

    def staging_dir(self, version: str) -> Path:
        path = self.layout.staging / version
        path.mkdir(parents=True, exist_ok=True)
        return path

    def download_path(self, filename: str) -> Path:
        return self.layout.downloads / filename

    def hermes_executable(self, version_root: Path) -> Path:
        if sys.platform == "win32":
            candidates = [
                version_root / "Scripts" / "hermes.exe",
                version_root / "venv" / "Scripts" / "hermes.exe",
                version_root / "bin" / "hermes.exe",
                version_root / "hermes.exe",
            ]
        else:
            candidates = [
                version_root / "bin" / "hermes",
                version_root / "venv" / "bin" / "hermes",
                version_root / "hermes",
            ]
        for c in candidates:
            if c.is_file():
                return c
        # Fallback: expected path after venv install
        if sys.platform == "win32":
            return version_root / "venv" / "Scripts" / "hermes.exe"
        return version_root / "venv" / "bin" / "hermes"


class ActivationManager:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        self.layout.ensure()

    def read_active(self) -> dict | None:
        path = self.layout.active_json
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else None
        except (OSError, json.JSONDecodeError):
            return None

    def write_active_atomic(self, payload: dict) -> None:
        path = self.layout.active_json
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(path)
