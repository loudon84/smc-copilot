from __future__ import annotations

from core.config import Settings
from core.task_routing import RoutingRule, merge_routing


class TaskRoutingRegistry:
    """In-memory PATCH overrides layered on SETTINGS task_routing_json + defaults."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._patch: dict[str, RoutingRule] = {}

    def all_rules(self) -> dict[str, RoutingRule]:
        merged = merge_routing(self._env_overrides())
        merged.update(self._patch)
        return merged

    def _env_overrides(self) -> dict[str, RoutingRule]:
        import json as _json

        overrides: dict[str, RoutingRule] = {}
        if self._settings.task_routing_json.strip():
            raw = _json.loads(self._settings.task_routing_json)
            if isinstance(raw, dict):
                for k, v in raw.items():
                    if isinstance(v, dict):
                        overrides[str(k)] = RoutingRule(
                            profile_type=str(v.get("profile", v.get("profile_type", "default"))),
                            require_approval=bool(v.get("require_approval", False)),
                        )
        return overrides

    def patch_rules(self, rules: dict[str, RoutingRule]) -> None:
        self._patch.update(rules)
