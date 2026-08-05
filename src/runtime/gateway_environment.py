"""Scoped environment builder for Hermes Gateway child processes (v1.3.1 FR-07)."""

from __future__ import annotations

import os
import re
from typing import Any

from core.config import Settings
from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError
from runtime.hermes_profile_paths import profile_home

logger = get_logger(__name__)

SECRET_NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,127}$")

RESERVED_ENV_NAMES = frozenset(
    {
        "PATH",
        "PYTHONPATH",
        "PATHEXT",
        "COMSPEC",
        "SYSTEMROOT",
        "WINDIR",
        "HERMES_HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "API_SERVER_ENABLED",
        "API_SERVER_HOST",
        "API_SERVER_PORT",
        "API_SERVER_KEY",
    }
)

PROVIDER_SECRET_NAMES = (
    "DASHSCOPE_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "API_SERVER_KEY",
)

_REDACT_KEYS = frozenset({"API_SERVER_KEY", *PROVIDER_SECRET_NAMES})


def validate_secret_name(name: str) -> None:
    if not SECRET_NAME_RE.match(name):
        raise RuntimeServiceError(
            f"Invalid secret name: {name!r}",
            code="validation_error",
        )
    if name.upper() in RESERVED_ENV_NAMES and name.upper() != "API_SERVER_KEY":
        raise RuntimeServiceError(
            f"Secret name is reserved and cannot override host env: {name}",
            code="validation_error",
        )


def redact_env_for_log(env: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in env.items():
        if key in _REDACT_KEYS or key.endswith("_API_KEY") or key.endswith("_KEY") or key.endswith("_TOKEN"):
            out[key] = "***"
        else:
            out[key] = value
    return out


def build_gateway_environment(
    settings: Settings,
    *,
    profile_name: str,
    gateway_port: int,
    secrets: dict[str, str] | None = None,
    base_env: dict[str, str] | None = None,
    require_api_server_key: bool = True,
) -> dict[str, str]:
    """Build child env: os.environ + HERMES_HOME + API_SERVER_* + scoped secrets."""
    child: dict[str, str] = dict(base_env if base_env is not None else os.environ)
    home = profile_home(settings, profile_name)
    # HERMES_HOME is always the user hermes root (not named profile subdir)
    child["HERMES_HOME"] = str(settings.hermes_home_path)
    child["API_SERVER_ENABLED"] = "true"
    child["API_SERVER_HOST"] = "127.0.0.1"
    child["API_SERVER_PORT"] = str(gateway_port)

    scoped = secrets or {}
    for name, value in scoped.items():
        if not value:
            continue
        try:
            validate_secret_name(name)
        except RuntimeServiceError:
            logger.warning("gateway_env_skip_invalid_secret_name", name=name)
            continue
        upper = name.upper()
        if upper in RESERVED_ENV_NAMES and upper != "API_SERVER_KEY":
            logger.warning("gateway_env_skip_reserved", name=name)
            continue
        child[upper] = value

    if require_api_server_key and not (child.get("API_SERVER_KEY") or "").strip():
        raise RuntimeServiceError(
            "API_SERVER_KEY missing from scoped secrets; refuse to start gateway with empty key",
            code="secret_store_unavailable",
        )

    logger.info(
        "gateway_env_built",
        profile_name=profile_name,
        profile_home=str(home),
        port=gateway_port,
        keys=sorted(redact_env_for_log(child).keys()),
    )
    return child


def resolve_scoped_secrets(
    secret_getters: dict[str, Any] | None,
    *,
    profile_name: str,
) -> dict[str, str]:
    """Resolve string secrets from a name->callable/value map for one profile scope."""
    if not secret_getters:
        return {}
    out: dict[str, str] = {}
    for name, getter in secret_getters.items():
        try:
            validate_secret_name(name)
        except RuntimeServiceError:
            continue
        value = getter() if callable(getter) else getter
        if value:
            out[name] = str(value)
    _ = profile_name  # isolation is caller responsibility (only pass this profile's map)
    return out
