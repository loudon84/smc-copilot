from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from core.config import Settings
from utils.paths import profile_config_path, profile_dir


def ensure_profile_directory(settings: Settings, name: str) -> Path:
    path = profile_dir(settings, name)
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_profile_config(settings: Settings, name: str) -> dict[str, Any]:
    path = profile_config_path(settings, name)
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}


def write_profile_config(settings: Settings, name: str, config: dict[str, Any]) -> Path:
    ensure_profile_directory(settings, name)
    path = profile_config_path(settings, name)
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, default_flow_style=False, allow_unicode=True)
    return path
