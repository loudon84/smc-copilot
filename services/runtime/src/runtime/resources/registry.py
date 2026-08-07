"""Resource adapter registry and context factory."""

from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.hermes.cli_adapter import HermesCliAdapter
from runtime.platform_paths import RuntimeLayout
from runtime.resources.artifact_cache import ArtifactCache
from runtime.resources.base import ResourceAdapter, ResourceContext
from runtime.resources.expert_adapter import ExpertBundleResourceAdapter
from runtime.resources.mcp_adapter import McpResourceAdapter
from runtime.resources.plugin_adapter import PluginResourceAdapter
from runtime.resources.policy_adapter import PolicyResourceAdapter
from runtime.resources.profile_adapter import ProfileResourceAdapter
from runtime.resources.skill_adapter import SkillResourceAdapter


def build_adapter_registry() -> dict[str, ResourceAdapter]:
    adapters: list[ResourceAdapter] = [
        ProfileResourceAdapter(),
        ExpertBundleResourceAdapter(),
        SkillResourceAdapter(),
        PluginResourceAdapter(),
        McpResourceAdapter(),
        PolicyResourceAdapter(),
    ]
    return {a.resource_type: a for a in adapters}


async def build_resource_context(
    settings: Settings,
    session: AsyncSession,
    *,
    profile_name: str | None = None,
) -> ResourceContext:
    repo = EndpointSyncRepository(session)
    layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
    layout.ensure()
    cache_dir = layout.root / "artifact-cache"
    resources_root = layout.root / "synced-resources"
    staging_root = layout.staging / "resource-apply"
    cache_dir.mkdir(parents=True, exist_ok=True)
    resources_root.mkdir(parents=True, exist_ok=True)
    staging_root.mkdir(parents=True, exist_ok=True)

    hermes_cli: HermesCliAdapter | None = None
    from db.repositories.runtime_repo import RuntimeVersionRepository

    active = await RuntimeVersionRepository(session).get_active()
    if active is not None and active.executable_path and Path(active.executable_path).exists():
        hermes_cli = HermesCliAdapter(settings, executable=Path(active.executable_path))
    else:
        # Probe PATH
        try:
            import asyncio

            proc = await asyncio.create_subprocess_exec(
                "hermes",
                "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            if proc.returncode == 0:
                hermes_cli = HermesCliAdapter(settings)
        except FileNotFoundError:
            pass

    return ResourceContext(
        settings=settings,
        session=session,
        repo=repo,
        resources_root=resources_root,
        staging_root=staging_root,
        artifact_cache=ArtifactCache(settings, cache_dir),
        hermes_cli=hermes_cli,
        profile_name=profile_name,
    )


def cleanup_staging(ctx: ResourceContext, path: Path) -> None:
    if path.exists() and str(path).startswith(str(ctx.staging_root)):
        shutil.rmtree(path, ignore_errors=True)


def get_adapter(registry: dict[str, ResourceAdapter], resource_type: str) -> ResourceAdapter | None:
    return registry.get(resource_type)
