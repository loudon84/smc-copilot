"""External pillar: resolve Desired State from mock SMC backend."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_REPO_SALT = Path(__file__).resolve().parents[2]
if str(_REPO_SALT) not in sys.path:
    sys.path.insert(0, str(_REPO_SALT))

from mock_backend.desired_state import resolve_desired_state

__virtualname__ = "smc_external"


def __virtual__():
    return True


def ext_pillar(minion_id: str, pillar: dict[str, Any], *args: Any, **kwargs: Any) -> dict[str, Any]:
    """Salt external pillar entrypoint.

    kwargs may include endpoint_id / user_id from master config. Desktop must not write pillar.
    """
    endpoint_id = str(kwargs.get("endpoint_id") or minion_id)
    user_id = kwargs.get("user_id")
    url = os.environ.get("SMC_MOCK_BACKEND_URL", "").strip()
    if url:
        try:
            req = urllib.request.Request(
                f"{url.rstrip('/')}/desired-state?endpoint_id={endpoint_id}&user_id={user_id or ''}",
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return {"smc": data}
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            pass
    resolved = resolve_desired_state(endpoint_id=endpoint_id, user_id=user_id)
    # Merge any existing pillar keys without leaking secrets in clear form.
    return {"smc": resolved, "smc_pillar_source": "mock_fixture"}
