from __future__ import annotations

import json

from core.config import Settings
from core.task_routing import RoutingRule, merge_routing
from db.models.work_tasks import TaskRoutingRule
from db.repositories.work_task_repo import WorkTaskRepository


class TaskRoutingRegistry:
    """Routing rules layered: defaults → DB → env JSON → in-memory patch."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._patch: dict[str, RoutingRule] = {}
        self._db_rules: dict[str, RoutingRule] = {}

    async def load_from_db(self, session) -> None:
        repo = WorkTaskRepository(session)
        rows = await repo.list_routing_rules(enabled_only=False)
        self._db_rules = {
            row.task_type: RoutingRule(profile_type=row.profile_type, require_approval=row.require_approval)
            for row in rows
            if row.enabled
        }

    def all_rules(self) -> dict[str, RoutingRule]:
        merged = merge_routing(self._env_overrides())
        merged.update(self._db_rules)
        merged.update(self._patch)
        return merged

    def _env_overrides(self) -> dict[str, RoutingRule]:
        overrides: dict[str, RoutingRule] = {}
        if self._settings.task_routing_json.strip():
            raw = json.loads(self._settings.task_routing_json)
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

    async def persist_patch(self, session, rules: dict[str, RoutingRule]) -> None:
        self.patch_rules(rules)
        repo = WorkTaskRepository(session)
        for task_type, rule in rules.items():
            await repo.upsert_routing_rule(
                TaskRoutingRule(
                    task_type=task_type,
                    profile_type=rule.profile_type,
                    require_approval=rule.require_approval,
                    enabled=True,
                )
            )
