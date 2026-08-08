from __future__ import annotations

from typing import Any


def build_diagnostics(
    *,
    status: str,
    endpoint: str,
    auth_configured: bool,
    tool_count: int,
    last_error: str | None = None,
    bridge_bound: str = "127.0.0.1",
) -> dict[str, Any]:
    return {
        "status": status,
        "endpoint": endpoint,
        "authorizationConfigured": auth_configured,
        "toolCount": tool_count,
        "bridgeBind": bridge_bound,
        "lastError": last_error,
        "checks": {
            "endpoint": "ok" if endpoint else "missing",
            "authorization": "ok" if auth_configured else "missing",
            "tools": "ok" if tool_count > 0 else "empty",
        },
    }
