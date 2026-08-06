"""Effective policy merge: Center ∩ Local ∩ Profile ∩ Task ∩ User (PRD FR-601)."""

from __future__ import annotations

import copy
from typing import Any

POLICY_DOMAINS = ("workspace", "tools", "data", "approval", "network", "artifact")


def _deep_merge_restrictive(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Merge overlay into base; overlay can only tighten (deny/add), never loosen."""
    result = copy.deepcopy(base)
    for key, value in overlay.items():
        if key not in result:
            result[key] = copy.deepcopy(value)
            continue
        if isinstance(value, dict) and isinstance(result[key], dict):
            result[key] = _deep_merge_restrictive(result[key], value)
        elif isinstance(value, list) and isinstance(result[key], list):
            # Union deny lists; intersection allow lists
            if key in ("deny", "blocked", "forbidden"):
                result[key] = list(dict.fromkeys(result[key] + value))
            elif key in ("allow", "allowed", "permitted"):
                existing = set(str(x) for x in result[key])
                result[key] = [x for x in value if str(x) in existing] or list(value)
            else:
                result[key] = list(dict.fromkeys(result[key] + value))
        else:
            # Scalar: keep more restrictive (False wins for booleans)
            if isinstance(value, bool) and isinstance(result[key], bool):
                result[key] = result[key] and value
            else:
                result[key] = value
    return result


def _empty_policy() -> dict[str, Any]:
    return {domain: {} for domain in POLICY_DOMAINS}


# @lat: [[approval-workspace#Effective Policy]]
class EffectivePolicy:
    """Merge policy layers; center policy cannot loosen local restrictions."""

    def __init__(
        self,
        *,
        center: dict[str, Any] | None = None,
        local: dict[str, Any] | None = None,
        profile: dict[str, Any] | None = None,
        task: dict[str, Any] | None = None,
        user: dict[str, Any] | None = None,
    ) -> None:
        self._layers = {
            "local": local or {},
            "center": center or {},
            "profile": profile or {},
            "task": task or {},
            "user": user or {},
        }

    def merge(self) -> dict[str, Any]:
        # Start from local enterprise policy as floor
        result = _empty_policy()
        local = self._layers["local"]
        for domain in POLICY_DOMAINS:
            if domain in local:
                result[domain] = copy.deepcopy(local[domain])

        # Center can add restrictions but not loosen local
        center = self._layers["center"]
        for domain in POLICY_DOMAINS:
            if domain in center:
                result[domain] = _deep_merge_restrictive(result[domain], center[domain])

        # Profile, task, user layers tighten further
        for layer_name in ("profile", "task", "user"):
            layer = self._layers[layer_name]
            for domain in POLICY_DOMAINS:
                if domain in layer:
                    result[domain] = _deep_merge_restrictive(result[domain], layer[domain])

        return result

    def is_denied(self, domain: str, key: str, value: str) -> bool:
        policy = self.merge()
        section = policy.get(domain, {})
        if not isinstance(section, dict):
            return False
        deny = section.get("deny", [])
        if isinstance(deny, list) and any(str(d) in value or value.startswith(str(d)) for d in deny):
            return True
        allow = section.get("allow", [])
        if isinstance(allow, list) and allow:
            return not any(value.startswith(str(a)) or str(a) in value for a in allow)
        return False
