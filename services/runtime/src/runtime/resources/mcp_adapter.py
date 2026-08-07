"""MCP resource adapter (PRD FR-306)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import select

from db.models.endpoint_sync import ResourceConflict
from db.models.runtime import SecretReference
from runtime.resources._common import (
    copy_staged_to_version,
    default_remove,
    default_stage,
    default_validate,
    read_current_pointer,
    restore_snapshot,
    write_resource_meta,
)
from runtime.resources.base import (
    ApplyResult,
    ResourceAdapter,
    ResourceContext,
    ResourceDesired,
    ResourceRollbackSnapshot,
)
from services.secret_service import SecretStore


class McpResourceAdapter:
    resource_type = "mcp"

    def _required_secrets(self, desired: ResourceDesired) -> list[str]:
        names = desired.payload.get("requiredSecretNames") or desired.payload.get("required_secret_names") or []
        if isinstance(names, list):
            return [str(n) for n in names]
        return []

    async def _missing_secrets(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]:
        required = self._required_secrets(desired)
        if not required:
            return []
        store = SecretStore(ctx.settings)
        scope = (
            desired.payload.get("profileName") or desired.payload.get("profile_name") or ctx.profile_name or "default"
        )
        missing: list[str] = []
        for name in required:
            storage_key = f"{scope}:{name}"
            has_ref = False
            result = await ctx.session.execute(
                select(SecretReference).where(
                    SecretReference.scope_type == "scope",
                    SecretReference.scope_id == scope,
                    SecretReference.secret_name == name,
                )
            )
            row = result.scalar_one_or_none()
            if row is not None and store.get(row.storage_key):
                has_ref = True
            elif store.get(storage_key):
                has_ref = True
            if not has_ref:
                missing.append(name)
        return missing

    async def validate(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]:
        return await default_validate(desired)

    async def stage(self, ctx: ResourceContext, desired: ResourceDesired) -> Path:
        return await default_stage(ctx, desired)

    async def apply(self, ctx: ResourceContext, desired: ResourceDesired, staged: Path) -> ApplyResult:
        missing = await self._missing_secrets(ctx, desired)
        if missing:
            await ctx.repo.add_conflict(
                ResourceConflict(
                    resource_type=desired.resource_type,
                    resource_id=desired.resource_id,
                    conflict_type="missing_secret",
                    desired_json=json.dumps({"requiredSecretNames": missing}, ensure_ascii=False),
                    status="open",
                )
            )
            return ApplyResult(
                status="blocked",
                conflict_type="missing_secret",
                message=f"missing secrets: {', '.join(missing)}",
                restart_required=False,
            )

        base = ctx.resources_root / desired.resource_type / desired.resource_id
        base.mkdir(parents=True, exist_ok=True)
        definition = {k: v for k, v in desired.payload.items() if k not in {"secret", "secrets", "apiKey"}}
        (base / "mcp-definition.json").write_text(
            json.dumps(definition, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        commands: list[str] = []
        profile = desired.payload.get("profileName") or ctx.profile_name
        if ctx.hermes_cli is not None:
            try:
                await ctx.hermes_cli.config_check(profile_name=str(profile) if profile else None)
                commands.append("hermes config check")
                code, out, err = await ctx.hermes_cli.run_profile(
                    str(profile) if profile else None,
                    ["mcp", "test", desired.resource_id],
                )
                commands.append(f"hermes mcp test {desired.resource_id}")
                if code != 0:
                    return ApplyResult(
                        status="failed",
                        message=(err or out)[:500],
                        commands_run=commands,
                        restart_required=True,
                    )
            except Exception as exc:
                commands.append(f"hermes mcp test (error: {exc})")
        else:
            commands.append("hermes config check (not on PATH)")
            commands.append(f"hermes mcp test {desired.resource_id} (not on PATH)")

        result = copy_staged_to_version(ctx, desired, staged, restart_required=True)
        write_resource_meta(
            ctx,
            desired.resource_type,
            desired.resource_id,
            version=desired.version,
            revision=desired.revision,
            payload=desired.payload,
            from_version=desired.from_version,
        )
        result.commands_run = commands
        return result

    async def verify(self, ctx: ResourceContext, desired: ResourceDesired) -> dict[str, Any]:
        from runtime.resources._common import default_verify

        probe = await default_verify(ctx, desired)
        base = ctx.resources_root / desired.resource_type / desired.resource_id
        probe["hasDefinition"] = (base / "mcp-definition.json").is_file()
        missing = await self._missing_secrets(ctx, desired)
        probe["missingSecrets"] = missing
        probe["blocked"] = bool(missing)
        pointer = read_current_pointer(ctx, desired.resource_type, desired.resource_id)
        ver_path = pointer.get("path")
        if ver_path:
            probe["filesystem"] = Path(str(ver_path)).exists()
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


_: ResourceAdapter = McpResourceAdapter()
