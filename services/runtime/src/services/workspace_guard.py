from __future__ import annotations

import fnmatch
import json
from pathlib import Path
from typing import Any

from core.errors import PolicyError


def _normalize_policy(policy_json: str | None) -> dict[str, Any]:
    if not policy_json:
        return {}
    try:
        data = json.loads(policy_json)
    except json.JSONDecodeError:
        data = {}
    return data if isinstance(data, dict) else {}


# @lat: [[approval-workspace#Workspace Guard]]
class WorkspaceGuard:
    def validate_path(self, workspace_root: str, relative_uri: str, policy_json: str | None = None) -> None:
        self.validate_path_with_policy(workspace_root, relative_uri, policy_json)

    def validate_path_with_policy(self, workspace_root: str, relative_uri: str, policy_json: str | None = None) -> None:
        root = Path(workspace_root).resolve()
        cand = Path(relative_uri)
        resolved = cand if cand.is_absolute() else (root / cand).resolve()
        resolved = resolved.resolve()
        root = root.resolve()
        try:
            resolved.relative_to(root)
        except ValueError as e:
            raise PolicyError("Path escapes workspace root") from e

        policy = _normalize_policy(policy_json)
        data = policy.get("paths") if isinstance(policy.get("paths"), dict) else {}
        allow = data.get("allow") if isinstance(data.get("allow"), list) else []
        deny = data.get("deny") if isinstance(data.get("deny"), list) else []
        rel = str(resolved.relative_to(root)).replace("\\", "/")
        for pattern in deny:
            if fnmatch.fnmatch(rel, str(pattern)) or fnmatch.fnmatch(rel + "/", str(pattern)):
                raise PolicyError(f"Path denied by policy: {pattern}")
        if allow:
            if not any(fnmatch.fnmatch(rel, str(p)) or rel.startswith(str(p).rstrip("*")) for p in allow):
                raise PolicyError("Path not in allow list")

    def classify_command(self, command: str, policy_json: str | None) -> str:
        policy = _normalize_policy(policy_json)
        data = policy.get("commands") if isinstance(policy.get("commands"), dict) else {}
        deny = data.get("deny") if isinstance(data.get("deny"), list) else []
        req_a = data.get("require_approval") if isinstance(data.get("require_approval"), list) else []
        allow = data.get("allow") if isinstance(data.get("allow"), list) else []
        cs = command.strip()
        if any(cs.startswith(str(d)) or d in cs for d in deny):  # type: ignore[union-attr]
            return "deny"
        if any(cs.startswith(str(d)) or d in cs for d in req_a):
            return "require_approval"
        if allow and not any(cs.startswith(str(a)) for a in allow):
            return "deny"
        return "allow"
