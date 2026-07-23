from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


def default_runtime_data_dir() -> Path:
    """Platform default for Hermes Runtime program/data root (not Hermes user data)."""
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA")
        if local:
            return Path(local) / "HermesRuntime"
        return Path.home() / "AppData" / "Local" / "HermesRuntime"
    return Path.home() / ".hermes-runtime"


@dataclass(frozen=True)
class RuntimeLayout:
    root: Path
    service: Path
    versions: Path
    downloads: Path
    staging: Path
    logs: Path
    backups: Path
    db_path: Path
    active_json: Path

    @classmethod
    def from_root(cls, root: Path) -> RuntimeLayout:
        root = root.expanduser().resolve()
        return cls(
            root=root,
            service=root / "service",
            versions=root / "versions",
            downloads=root / "downloads",
            staging=root / "staging",
            logs=root / "logs",
            backups=root / "backups",
            db_path=root / "runtime.db",
            active_json=root / "active.json",
        )

    def ensure(self) -> None:
        for path in (
            self.root,
            self.service,
            self.versions,
            self.downloads,
            self.staging,
            self.logs,
            self.backups,
            self.logs / "service",
            self.logs / "jobs",
            self.logs / "instances",
        ):
            path.mkdir(parents=True, exist_ok=True)

    def version_dir(self, version: str) -> Path:
        return self.versions / version

    def job_log_path(self, job_id: str) -> Path:
        return self.logs / "jobs" / f"{job_id}.log"

    def instance_log_dir(self, instance_id: str) -> Path:
        path = self.logs / "instances" / instance_id
        path.mkdir(parents=True, exist_ok=True)
        return path
