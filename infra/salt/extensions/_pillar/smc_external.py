"""External pillar: SMC Backend Desired State only. No mock_backend import in production."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

__virtualname__ = "smc_external"


def __virtual__():
    return True


def _opts() -> dict[str, Any]:
    return globals().get("__opts__") or {}


def _http_desired_state(url: str, endpoint_id: str, user_id: str | None) -> dict[str, Any] | None:
    try:
        req = urllib.request.Request(
            f"{url.rstrip('/')}/desired-state?endpoint_id={endpoint_id}&user_id={user_id or ''}",
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=3) as resp:  # noqa: S310
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def ext_pillar(minion_id: str, pillar: dict[str, Any], *args: Any, **kwargs: Any) -> dict[str, Any]:
    """Salt external pillar entrypoint.

    Minion ID is device identity. Current user comes from Backend binding, never grains.
    If Backend is unavailable, do not clear existing Hermes config (return empty smc patch).
    """
    del pillar, args
    endpoint_id = str(kwargs.get("endpoint_id") or minion_id)
    user_id = kwargs.get("user_id")
    opts = _opts()
    resolver = opts.get("smc_desired_state_resolver")
    if callable(resolver):
        data = resolver(endpoint_id, user_id)
        return {"smc": data, "smc_pillar_source": "injected"}

    url = str(opts.get("smc_backend_url") or os.environ.get("SMC_BACKEND_URL") or "").strip()
    if not url:
        return {
            "smc": {},
            "smc_pillar_source": "backend_unavailable",
            "smc_pillar_error": "backend_url_missing",
        }
    data = _http_desired_state(url, endpoint_id, user_id)
    if data is None:
        return {
            "smc": {},
            "smc_pillar_source": "backend_unavailable",
            "smc_pillar_error": "backend_unreachable",
        }
    return {"smc": data, "smc_pillar_source": "backend"}
