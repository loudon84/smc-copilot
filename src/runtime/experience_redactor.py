"""Redact secrets, paths, and prompts from experience / event payloads."""

from __future__ import annotations

import re
from typing import Any

_SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|token|secret|password|authorization|bearer|refresh[_-]?credential)",
    re.IGNORECASE,
)
_PATH_RE = re.compile(r"(?:[A-Za-z]:\\|\\\\|/home/|/Users/)[^\s\"']+")
_EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
_PROMPT_KEYS = frozenset({"prompt", "fullPrompt", "chat", "messages", "content", "rawOutput", "rawInput"})


def redact_string(value: str) -> str:
    out = _PATH_RE.sub("[REDACTED_PATH]", value)
    out = _EMAIL_RE.sub("[REDACTED_EMAIL]", out)
    return out


def redact_value(value: Any, *, key: str | None = None) -> Any:
    if key and (_SECRET_KEY_RE.search(key) or key in _PROMPT_KEYS):
        return "[REDACTED]"
    if isinstance(value, str):
        if _PATH_RE.search(value):
            return redact_string(value)
        if _SECRET_KEY_RE.search(value) and len(value) > 8 and not _PATH_RE.search(value):
            return "[REDACTED]"
        return redact_string(value)
    if isinstance(value, dict):
        return {k: redact_value(v, key=str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(v) for v in value]
    return value


def redact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return redact_value(payload)  # type: ignore[return-value]
