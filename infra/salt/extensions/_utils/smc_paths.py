"""Salt __utils__ name: smc_paths.* — Hermes layout / home adoption.

Standalone Salt loader plugin. No relative imports, no _utils package.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def looks_like_hermes_home(directory: Path) -> bool:
    if not directory.is_dir():
        return False
    markers = ("hermes-agent", "gateway.pid", "config.yaml", "active_profile", ".env", "active.json")
    return any((directory / name).exists() for name in markers)


def detect_existing_home(
    configured: str | None = None,
    localappdata: str | None = None,
    userprofile: str | None = None,
    runtime_metadata: str | None = None,
) -> Path | None:
    """Adopt a single existing Hermes home. Never create a second copy."""
    candidates: list[Path] = []
    if configured and str(configured).strip():
        candidates.append(Path(configured).expanduser())
    if runtime_metadata:
        meta = Path(runtime_metadata)
        if meta.is_file():
            try:
                payload = json.loads(meta.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = {}
            home = payload.get("hermes_home") or payload.get("HERMES_HOME")
            if home:
                candidates.append(Path(str(home)).expanduser())
    local = localappdata if localappdata is not None else os.environ.get("LOCALAPPDATA")
    if local:
        candidates.append(Path(local) / "hermes")
    profile = userprofile if userprofile is not None else os.environ.get("USERPROFILE")
    if profile:
        candidates.append(Path(profile) / ".hermes")
    seen: set[str] = set()
    for candidate in candidates:
        if _is_system_profile(candidate):
            continue
        key = str(candidate.resolve()) if candidate.exists() else str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if looks_like_hermes_home(candidate):
            return candidate
    return None


def default_hermes_home() -> Path:
    env = os.environ.get("HERMES_HOME", "").strip()
    if env:
        candidate = Path(env).expanduser()
        if _is_system_profile(candidate):
            raise RuntimeError("hermes_home_unresolved")
        return candidate
    adopted = detect_existing_home()
    if adopted:
        return adopted
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA")
        if local and not _is_system_profile(Path(local)) and not _is_system_account():
            return Path(local) / "hermes"
        raise RuntimeError("hermes_home_unresolved")
    return Path.home() / ".hermes"


def _is_system_account() -> bool:
    account = str(os.environ.get("USERNAME") or os.environ.get("USER") or "").strip().lower()
    return account in {"system", "localsystem", "local system"}


def _is_system_profile(path: Path) -> bool:
    normalized = str(path).replace("/", "\\").lower()
    return "\\windows\\system32\\config\\systemprofile" in normalized


class HermesLayout:
    """Plain layout object. Avoid @dataclass — Salt Lazy Loader assumes sys.modules."""

    def __init__(
        self,
        home: Path,
        repo: Path,
        venv: Path,
        python: Path,
        hermes_exe: Path,
        env_file: Path,
        config_file: Path,
    ) -> None:
        self.home = home
        self.repo = repo
        self.venv = venv
        self.python = python
        self.hermes_exe = hermes_exe
        self.env_file = env_file
        self.config_file = config_file

    @classmethod
    def from_home(cls, home: Path | None = None) -> HermesLayout:
        root = (home or default_hermes_home()).expanduser()
        repo = root / "hermes-agent"
        venv = repo / "venv"
        if sys.platform == "win32":
            python = venv / "Scripts" / "python.exe"
            hermes_exe = venv / "Scripts" / "hermes.exe"
        else:
            python = venv / "bin" / "python"
            hermes_exe = venv / "bin" / "hermes"
        return cls(
            home=root,
            repo=repo,
            venv=venv,
            python=python,
            hermes_exe=hermes_exe,
            env_file=root / ".env",
            config_file=root / "config.yaml",
        )

    def is_installed(self) -> bool:
        cli_ok = self.hermes_exe.exists() or (self.repo / "hermes_cli" / "main.py").exists()
        return self.repo.is_dir() and self.python.exists() and cli_ok


def layout(hermes_home: str | Path | None = None) -> HermesLayout:
    home = Path(hermes_home).expanduser() if hermes_home and str(hermes_home).strip() else default_hermes_home()
    if _is_system_profile(home):
        raise RuntimeError("hermes_home_unresolved")
    return HermesLayout.from_home(home)
