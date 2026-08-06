"""Skill resource adapter (PRD FR-304)."""

from __future__ import annotations

from pathlib import Path

from runtime.resources._common import (
    copy_staged_to_version,
    default_remove,
    default_stage,
    default_validate,
    read_current_pointer,
    restore_snapshot,
    version_dir,
)
from runtime.resources.base import ApplyResult, ResourceAdapter, ResourceContext, ResourceDesired, ResourceRollbackSnapshot


class SkillResourceAdapter:
    resource_type = "skill"

    async def validate(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]:
        errors = await default_validate(desired)
        return errors

    async def stage(self, ctx: ResourceContext, desired: ResourceDesired) -> Path:
        return await default_stage(ctx, desired)

    async def _run_skill_cli(
        self, ctx: ResourceContext, desired: ResourceDesired, subcmd: str
    ) -> tuple[bool, str]:
        skill_id = desired.resource_id
        cmd_label = f"hermes skills {subcmd} {skill_id}"
        if ctx.hermes_cli is None:
            staged = version_dir(ctx, desired.resource_type, desired.resource_id, desired.version or "unknown")
            skill_md = staged / "SKILL.md"
            if skill_md.is_file():
                return True, f"{cmd_label} (filesystem SKILL.md ok, hermes not on PATH)"
            return True, f"{cmd_label} (hermes not on PATH, staged only)"
        profile = desired.payload.get("profileName") or desired.payload.get("profile_name") or ctx.profile_name
        code, out, err = await ctx.hermes_cli.run_profile(
            str(profile) if profile else None,
            ["skills", subcmd, skill_id],
        )
        ok = code == 0
        return ok, cmd_label if ok else f"{cmd_label}: {(err or out)[:200]}"

    async def apply(self, ctx: ResourceContext, desired: ResourceDesired, staged: Path) -> ApplyResult:
        skill_md = staged / "SKILL.md"
        if not skill_md.is_file():
            for child in staged.rglob("SKILL.md"):
                skill_md = child
                break

        commands: list[str] = []
        ok_inspect, msg_inspect = await self._run_skill_cli(ctx, desired, "inspect")
        commands.append(msg_inspect)
        ok_check, msg_check = await self._run_skill_cli(ctx, desired, "check")
        commands.append(msg_check)
        ok_audit, msg_audit = await self._run_skill_cli(ctx, desired, "audit")
        commands.append(msg_audit)

        if ctx.hermes_cli is not None and not ok_audit:
            return ApplyResult(
                status="blocked",
                message=msg_audit,
                conflict_type="audit_failed",
                commands_run=commands,
            )

        if not skill_md.is_file() and ctx.hermes_cli is None:
            return ApplyResult(
                status="failed",
                message="SKILL.md missing in staged bundle",
                commands_run=commands,
            )

        result = copy_staged_to_version(ctx, desired, staged, restart_required=False)
        result.commands_run = commands
        return result

    async def verify(self, ctx: ResourceContext, desired: ResourceDesired) -> dict[str, Any]:
        from runtime.resources._common import default_verify

        probe = await default_verify(ctx, desired)
        pointer = read_current_pointer(ctx, desired.resource_type, desired.resource_id)
        ver_path = pointer.get("path")
        if ver_path:
            root = Path(str(ver_path))
            probe["hasSkillMd"] = (root / "SKILL.md").is_file() or any(root.rglob("SKILL.md"))
        ok, msg = await self._run_skill_cli(ctx, desired, "inspect")
        probe["skillInspect"] = {"ok": ok, "detail": msg}
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


_: ResourceAdapter = SkillResourceAdapter()
