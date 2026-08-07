"""Unified Hermes profile path resolution (v1.3.1 FR-04)."""

from __future__ import annotations

from pathlib import Path

from core.config import Settings

_DEFAULT_NAMES = frozenset({"", "default"})


def is_default_profile(profile_name: str | None) -> bool:
    return (profile_name or "").strip().lower() in _DEFAULT_NAMES


def profile_home(settings: Settings, profile_name: str | None) -> Path:
    """Default profile uses HERMES_HOME; named profiles use profiles/<name>/."""
    if is_default_profile(profile_name):
        return settings.hermes_home_path
    name = str(profile_name).strip()
    if not name or "/" in name or "\\" in name or ".." in name:
        from core.runtime_errors import RuntimeServiceError

        raise RuntimeServiceError(f"Invalid profile name: {profile_name!r}", code="profile_path_invalid")
    return settings.hermes_home_path / "profiles" / name


def profile_config_path(settings: Settings, profile_name: str | None) -> Path:
    return profile_home(settings, profile_name) / "config.yaml"


def profile_env_path(settings: Settings, profile_name: str | None) -> Path:
    return profile_home(settings, profile_name) / ".env"


def ensure_profile_home(settings: Settings, profile_name: str | None) -> Path:
    path = profile_home(settings, profile_name)
    path.mkdir(parents=True, exist_ok=True)
    return path
