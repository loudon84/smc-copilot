"""Plugin resource adapter (PRD FR-305)."""

from __future__ import annotations

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


class PluginResourceAdapter:
    resource_type = "plugin"

    async def validate(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]:
        return await default_validate(desired)

    async def stage(self, ctx: ResourceContext, desired: ResourceDesired) -> Path:
        return await default_stage(ctx, desired)

    async def apply(self, ctx: ResourceContext, desired: ResourceDesired, staged: Path) -> ApplyResult:
        plugin_id = desired.resource_id
        commands: list[str] = []
        manifest = staged / "manifest.json"
        if not manifest.is_file():
            manifest = next(staged.rglob("manifest.json"), None)
        if manifest is None and ctx.hermes_cli is None:
            return ApplyResult(status="failed", message="plugin manifest.json missing")

        if ctx.hermes_cli is not None:
            profile = desired.payload.get("profileName") or ctx.profile_name
            code, out, err = await ctx.hermes_cli.run_profile(
                str(profile) if profile else None,
                ["plugins", "install", plugin_id],
            )
            commands.append(f"hermes plugins install {plugin_id}")
            if code != 0:
                return ApplyResult(
                    status="failed",
                    message=(err or out)[:500],
                    commands_run=commands,
                    restart_required=True,
                )
            code2, out2, err2 = await ctx.hermes_cli.run_profile(
                str(profile) if profile else None,
                ["plugins", "enable", plugin_id],
            )
            commands.append(f"hermes plugins enable {plugin_id}")
            if code2 != 0:
                return ApplyResult(
                    status="failed",
                    message=(err2 or out2)[:500],
                    commands_run=commands,
                    restart_required=True,
                )
        else:
            commands.append(f"hermes plugins install {plugin_id} (not on PATH)")
            commands.append(f"hermes plugins enable {plugin_id} (not on PATH)")

        result = copy_staged_to_version(ctx, desired, staged, restart_required=True)
        result.commands_run = commands
        return result

    async def verify(self, ctx: ResourceContext, desired: ResourceDesired) -> dict[str, Any]:
        from runtime.resources._common import default_verify

        probe = await default_verify(ctx, desired)
        pointer = read_current_pointer(ctx, desired.resource_type, desired.resource_id)
        ver_path = pointer.get("path")
        if ver_path:
            root = Path(str(ver_path))
            probe["hasManifest"] = (root / "manifest.json").is_file() or any(root.rglob("manifest.json"))
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


_: ResourceAdapter = PluginResourceAdapter()
