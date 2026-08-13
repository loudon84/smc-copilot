"""Salt __utils__ name: smc_redact.mapping — redact secrets from returns/logs.

Standalone Salt loader plugin. No relative imports, no _utils package.
"""

from __future__ import annotations

from typing import Any

SECRET_KEYS = frozenset(
    {
        "api_key",
        "apikey",
        "api_server_key",
        "password",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "authorization",
        "bearer",
    }
)


def redact_value(key: str, value: Any) -> Any:
    lowered = key.lower().replace("-", "_")
    if lowered in SECRET_KEYS or lowered.endswith("_key") or lowered.endswith("_token"):
        if value:
            return "***"
    return value


def redact_mapping(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: redact_mapping(redact_value(str(k), v)) for k, v in data.items()}
    if isinstance(data, list):
        return [redact_mapping(item) for item in data]
    return data


mapping = redact_mapping
