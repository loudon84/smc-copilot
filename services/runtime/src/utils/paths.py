from __future__ import annotations

from pathlib import Path

from core.config import Settings
from runtime.hermes_profile_paths import (
    ensure_profile_home,
)
from runtime.hermes_profile_paths import (
    profile_config_path as hermes_profile_config_path,
)
from runtime.hermes_profile_paths import (
    profile_home as hermes_profile_home,
)


def profile_dir(settings: Settings, name: str) -> Path:
    """Profile working directory — default uses HERMES_HOME (v1.3.1 FR-04)."""
    return hermes_profile_home(settings, name)


def profile_config_path(settings: Settings, name: str) -> Path:
    return hermes_profile_config_path(settings, name)


def ensure_profile_directory(settings: Settings, name: str) -> Path:
    return ensure_profile_home(settings, name)
