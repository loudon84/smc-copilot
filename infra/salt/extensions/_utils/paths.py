"""Hermes home / venv layout. Isolated from Salt Minion Python."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
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
        return Path(env).expanduser()
    adopted = detect_existing_home()
    if adopted:
        return adopted
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA")
        if local:
            return Path(local) / "hermes"
        return Path.home() / ".hermes"
    return Path.home() / ".hermes"


def layout(hermes_home: str | Path | None = None) -> HermesLayout:
    home = Path(hermes_home).expanduser() if hermes_home else default_hermes_home()
    return HermesLayout.from_home(home)


@dataclass(frozen=True)
class HermesLayout:
    home: Path
    repo: Path
    venv: Path
    python: Path
    hermes_exe: Path
    env_file: Path
    config_file: Path

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
