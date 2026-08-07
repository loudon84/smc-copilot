"""Profile resource adapter (PRD FR-303)."""

from __future__ import annotations

import shutil
from pathlib import Path

from runtime.resource_bundle import parse_profile_bundle
from runtime.resources._common import (
    capture_snapshot,
    copy_staged_to_version,
    default_remove,
    default_stage,
    default_validate,
    read_current_pointer,
    restore_snapshot,
    version_dir,
    write_resource_meta,
)
from runtime.resources.base import ApplyResult, ResourceAdapter, ResourceContext, ResourceDesired, ResourceRollbackSnapshot


class ProfileResourceAdapter:
    resource_type = "profile"

    async def validate(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]:
        errors = await default_validate(desired)
        bundle_root = desired.payload.get("bundleRoot") or desired.payload.get("bundle_root")
        if bundle_root and Path(str(bundle_root)).is_dir():
            bundle = parse_profile_bundle(Path(str(bundle_root)))
            errors.extend(bundle.warnings)
        return errors

    async def stage(self, ctx: ResourceContext, desired: ResourceDesired) -> Path:
        return await default_stage(ctx, desired)

    async def apply(self, ctx: ResourceContext, desired: ResourceDesired, staged: Path) -> ApplyResult:
        bundle = parse_profile_bundle(staged)
        if bundle.warnings:
            forbidden = [w for w in bundle.warnings if "forbidden key" in w]
            if forbidden:
                return ApplyResult(
                    status="failed",
                    message="; ".join(forbidden[:3]),
                    restart_required=False,
                )

        result = copy_staged_to_version(ctx, desired, staged, restart_required=True)
        ver_dir = version_dir(ctx, desired.resource_type, desired.resource_id, desired.version or "unknown")

        profile_name = desired.resource_id
        if bundle.profile_yaml:
            (ver_dir / "profile.yaml").write_text(bundle.profile_yaml, encoding="utf-8")
        if bundle.soul_md:
            (ver_dir / "SOUL.md").write_text(bundle.soul_md, encoding="utf-8")

        commands: list[str] = []
        if ctx.hermes_cli is not None:
            try:
                await ctx.hermes_cli.config_check(profile_name=profile_name)
                commands.append(f"hermes -p {profile_name} config check")
                code, out, err = await ctx.hermes_cli.run_profile(profile_name, ["profile", "info"])
                commands.append(f"hermes -p {profile_name} profile info")
                if code != 0:
                    return ApplyResult(
                        status="failed",
                        message=(err or out)[:500],
                        restart_required=True,
                        commands_run=commands,
                    )
            except Exception as exc:
                commands.append(f"hermes config check (skipped: {exc})")
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
            probe["hasProfileYaml"] = (root / "profile.yaml").is_file()
            probe["hasSoul"] = (root / "SOUL.md").is_file()
        if ctx.hermes_cli is not None:
            try:
                check = await ctx.hermes_cli.config_check(profile_name=desired.resource_id)
                probe["hermesConfigCheck"] = check.get("ok", True)
            except Exception as exc:
                probe["hermesConfigCheck"] = False
                probe["hermesError"] = str(exc)[:200]
        return probe

    async def rollback(
        self,
        ctx: ResourceContext,
        desired: ResourceDesired,
        snapshot: ResourceRollbackSnapshot,
    ) -> None:
        if snapshot.version and snapshot.local_path:
            ver_dir = version_dir(ctx, snapshot.resource_type, snapshot.resource_id, snapshot.version)
            if Path(snapshot.local_path).exists() and not ver_dir.exists():
                shutil.copytree(snapshot.local_path, ver_dir, dirs_exist_ok=True)
        restore_snapshot(ctx, snapshot)

    async def remove(self, ctx: ResourceContext, desired: ResourceDesired) -> ApplyResult:
        return await default_remove(ctx, desired)


# Protocol conformance
_: ResourceAdapter = ProfileResourceAdapter()
