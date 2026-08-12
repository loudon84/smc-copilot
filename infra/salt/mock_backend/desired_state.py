"""Resolve Desired State from fixtures (Endpoint + User Binding + Role + ConfigVersion)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def _load(name: str) -> dict[str, Any]:
    path = FIXTURE_DIR / name
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_desired_state(
    endpoint_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    endpoints = _load("endpoints.json")
    users = _load("users.json")
    bindings = _load("bindings.json")
    configs = _load("config_versions.json")

    endpoint = endpoints.get(endpoint_id) or {"endpoint_id": endpoint_id, "department": "unknown"}
    binding = bindings.get(endpoint_id) or {}
    effective_user = user_id or binding.get("user_id")
    user = users.get(effective_user or "") or {}
    config_version = str(user.get("config_version") or binding.get("config_version") or "1")
    config = configs.get(config_version) or {"revision": config_version, "platforms": {}}

    previous_user = binding.get("previous_user_id")
    if effective_user and previous_user and previous_user != effective_user:
        secret_refs = dict(config.get("secret_refs") or {})
        secret_refs.pop("previous_user", None)
    else:
        secret_refs = dict(config.get("secret_refs") or {})

    windows_account = user.get("windows_account") or binding.get("windows_account") or ""
    windows_sid = user.get("windows_sid") or binding.get("windows_sid") or ""
    profile_dir = user.get("profile_dir") or binding.get("profile_dir") or ""
    hermes_home = (
        (config.get("hermes") or {}).get("home")
        or user.get("hermes_home")
        or (f"{profile_dir}\\AppData\\Local\\hermes" if profile_dir else "")
    )

    return {
        "endpoint_id": endpoint_id,
        "user_id": effective_user,
        "department": endpoint.get("department") or user.get("department"),
        "role": user.get("role") or binding.get("role") or "default",
        "expert": user.get("expert"),
        "config_version": config_version,
        "user": {
            "user_id": effective_user,
            "windows_account": windows_account,
            "windows_sid": windows_sid,
            "profile_dir": profile_dir,
        },
        "hermes": {
            **(config.get("hermes") or {"version": "0.20.0"}),
            "home": hermes_home,
        },
        "gateway": config.get("gateway") or {"port": 8642},
        "platforms": config.get("platforms") or {},
        "mcp": config.get("mcp") or {"mcpServers": []},
        "secret_refs": secret_refs,
        "user_switched": bool(previous_user and effective_user and previous_user != effective_user),
    }


def bind_user(endpoint_id: str, user_id: str, previous_user_id: str | None = None) -> dict[str, Any]:
    """Test helper: rewrite bindings fixture in memory only (returns new binding)."""
    return {
        "endpoint_id": endpoint_id,
        "user_id": user_id,
        "previous_user_id": previous_user_id,
    }
