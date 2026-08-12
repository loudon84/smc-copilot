"""Hermes home / venv layout. Isolated from Salt Minion Python."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


def default_hermes_home() -> Path:
    env = os.environ.get("HERMES_HOME", "").strip()
    if env:
        return Path(env).expanduser()
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA")
        if local:
            candidate = Path(local) / "hermes"
            if looks_like_hermes_home(candidate):
                return candidate
        home_dot = Path.home() / ".hermes"
        if looks_like_hermes_home(home_dot):
            return home_dot
        return candidate if local else home_dot
    return Path.home() / ".hermes"


def looks_like_hermes_home(directory: Path) -> bool:
    if not directory.is_dir():
        return False
    markers = ("hermes-agent", "gateway.pid", "config.yaml", "active_profile", ".env")
    return any((directory / name).exists() for name in markers)


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
