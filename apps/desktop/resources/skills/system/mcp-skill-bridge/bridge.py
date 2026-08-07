"""MCP Skill Bridge — forwards skill calls to Hermes Desktop MCP Runtime Proxy."""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from typing import Any


def _profile_home(profile: str) -> Path:
    base = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
    if profile and profile != "default":
        return base / "profiles" / profile
    return base


def _load_bindings(profile: str) -> dict[str, Any]:
    path = _profile_home(profile) / "mcp_skill_bindings.json"
    if not path.exists():
        return {"profile": profile, "proxy_url": "http://127.0.0.1:18781", "skills": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _find_skill(bindings: dict[str, Any], skill_id: str) -> dict[str, Any] | None:
    for item in bindings.get("skills", []):
        if item.get("skill_id") == skill_id and item.get("enabled"):
            return item
    return None


def invoke_mcp_skill(profile: str, skill_id: str, arguments: dict[str, Any]) -> dict[str, Any]:
    bindings = _load_bindings(profile)
    skill = _find_skill(bindings, skill_id)
    if not skill:
        raise RuntimeError(f"MCP skill not enabled: {skill_id}")

    proxy_url = str(bindings.get("proxy_url", "http://127.0.0.1:18781")).rstrip("/")
    payload = {
        "profile": profile,
        "skill_id": skill_id,
        "server_id": skill.get("server_id"),
        "tool_name": skill.get("tool_name"),
        "arguments": arguments,
    }
    req = urllib.request.Request(
        f"{proxy_url}/mcp/skills/call",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))
