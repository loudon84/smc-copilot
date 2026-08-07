"""Policy resource adapter."""

from __future__ import annotations

import json
from pathlib import Path

from runtime.resources._common import (
    copy_staged_to_version,
    default_remove,
    default_stage,
    default_validate,
    read_current_pointer,
    restore_snapshot,
)
from runtime.resources.base import ApplyResult, ResourceAdapter, ResourceContext, ResourceDesired, ResourceRollbackSnapshot


class PolicyResourceAdapter:
    resource_type = "policy"

    async def validate(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]:
        return await default_validate(desired)

    async def stage(self, ctx: ResourceContext, desired: ResourceDesired) -> Path:
        return await default_stage(ctx, desired)

    async def apply(self, ctx: ResourceContext, desired: ResourceDesired, staged: Path) -> ApplyResult:
        policy_file = staged / "policy.json"
        if not policy_file.is_file():
            policy_payload = desired.payload.get("policy") or desired.payload
            if isinstance(policy_payload, dict):
                policy_file.write_text(json.dumps(policy_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return copy_staged_to_version(ctx, desired, staged, restart_required=False)

    async def verify(self, ctx: ResourceContext, desired: ResourceDesired) -> dict[str, Any]:
        from runtime.resources._common import default_verify

        probe = await default_verify(ctx, desired)
        pointer = read_current_pointer(ctx, desired.resource_type, desired.resource_id)
        ver_path = pointer.get("path")
        if ver_path:
            root = Path(str(ver_path))
            probe["hasPolicy"] = (root / "policy.json").is_file()
        return probe

    async def rollback(
        self,
        ctx: ResourceContext,
        desired: ResourceDesired,
        snapshot: ResourceRollbackSnapshot,
    ) -> None:
        restore_snapshot(ctx, snapshot)

    async def remove(self, ctx: ResourceContext, desired: ResourceDesired) -> ApplyResult:
        return await default_remove(ctx, desired)


_: ResourceAdapter = PolicyResourceAdapter()
