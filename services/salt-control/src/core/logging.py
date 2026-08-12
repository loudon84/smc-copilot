from __future__ import annotations

import re
from typing import Any

_SECRET_KEYS = re.compile(
    r"(password|secret|token|credential|authorization|api[_-]?key|private[_-]?key|env)",
    re.IGNORECASE,
)


def redact_value(key: str, value: Any) -> Any:
    if _SECRET_KEYS.search(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        return redact_mapping(value)
    if isinstance(value, list):
        return [redact_value(key, item) for item in value]
    if isinstance(value, str) and len(value) > 8 and _looks_like_secret(value):
        return "[REDACTED]"
    return value


def _looks_like_secret(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in ("bearer ", "device ", "sk-", "smc-secret-"))


def redact_mapping(data: dict[str, Any]) -> dict[str, Any]:
    return {k: redact_value(k, v) for k, v in data.items()}


def safe_log_fields(**fields: Any) -> dict[str, Any]:
    return redact_mapping(fields)
