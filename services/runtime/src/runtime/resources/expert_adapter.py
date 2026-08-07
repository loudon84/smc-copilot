"""Expert bundle resource adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from runtime.resource_bundle import parse_profile_bundle
from runtime.resources._common import (
    copy_staged_to_version,
    default_remove,
    default_stage,
    default_validate,
    read_current_pointer,
    version_dir,
)
from runtime.resources.base import (
    ApplyResult,
    ResourceAdapter,
    ResourceContext,
    ResourceDesired,
    ResourceRollbackSnapshot,
)
from runtime.resources.profile_adapter import ProfileResourceAdapter


class ExpertBundleResourceAdapter:
    resource_type = "expert"

    async def validate(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]:
        return await default_validate(desired)

    async def stage(self, ctx: ResourceContext, desired: ResourceDesired) -> Path:
        return await default_stage(ctx, desired)

    async def apply(self, ctx: ResourceContext, desired: ResourceDesired, staged: Path) -> ApplyResult:
        bundle = parse_profile_bundle(staged)
        result = copy_staged_to_version(ctx, desired, staged, restart_required=True)
        ver_dir = version_dir(ctx, desired.resource_type, desired.resource_id, desired.version or "unknown")
        if bundle.profile_yaml:
            (ver_dir / "expert.yaml").write_text(bundle.profile_yaml, encoding="utf-8")
        commands: list[str] = []
        if ctx.hermes_cli is not None:
            try:
                await ctx.hermes_cli.config_check(profile_name=desired.resource_id)
                commands.append(f"hermes -p {desired.resource_id} config check")
            except Exception as exc:
                commands.append(f"hermes config check (error: {exc})")
        else:
            commands.append("hermes config check (not on PATH)")
        result.commands_run = commands
        result.restart_required = True
        return result

    async def verify(self, ctx: ResourceContext, desired: ResourceDesired) -> dict[str, Any]:
        from runtime.resources._common import default_verify

        probe = await default_verify(ctx, desired)
        pointer = read_current_pointer(ctx, desired.resource_type, desired.resource_id)
        ver_path = pointer.get("path")
        if ver_path:
            root = Path(str(ver_path))
            probe["hasExpertYaml"] = (root / "expert.yaml").is_file() or (root / "profile.yaml").is_file()
        return probe

    async def rollback(
        self,
        ctx: ResourceContext,
        desired: ResourceDesired,
        snapshot: ResourceRollbackSnapshot,
    ) -> None:
        await ProfileResourceAdapter().rollback(ctx, desired, snapshot)

    async def remove(self, ctx: ResourceContext, desired: ResourceDesired) -> ApplyResult:
        return await default_remove(ctx, desired)


_: ResourceAdapter = ExpertBundleResourceAdapter()
