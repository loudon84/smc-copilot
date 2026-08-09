"""Local Hermes profile policy — default-only for current Runtime (PRD v1.5.3)."""

from __future__ import annotations

from core.runtime_errors import RuntimeServiceError
from runtime.hermes_profile_paths import is_default_profile

SUPPORTED_LOCAL_PROFILE = "default"


def normalize_profile_name(profile_name: str | None) -> str:
    name = (profile_name or "").strip()
    return name or SUPPORTED_LOCAL_PROFILE


def require_supported_local_profile(profile_name: str | None) -> str:
    """Raise when local Runtime is asked to operate a named Hermes profile."""
    name = normalize_profile_name(profile_name)
    if not is_default_profile(name):
        raise RuntimeServiceError(
            f"Local Hermes profile {name!r} is not supported; only 'default' is allowed",
            code="LOCAL_HERMES_PROFILE_UNSUPPORTED",
            details={"profile": name, "supportedProfile": SUPPORTED_LOCAL_PROFILE},
        )
    return SUPPORTED_LOCAL_PROFILE
