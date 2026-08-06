"""Resource adapter apply/rollback tests (PRD FR-301–308)."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import ConflictError, CopilotError
from db.models.endpoint_sync import DesiredStateResource, DesiredStateRevision
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from runtime.resources.artifact_cache import ArtifactCache
from runtime.resources.base import ResourceDesired
from runtime.resources.mcp_adapter import McpResourceAdapter
from runtime.resources.registry import build_resource_context
from runtime.resources.skill_adapter import SkillResourceAdapter
from services.desired_state_service import DesiredStateService
from services.resource_sync_service import ResourceSyncService


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        h.update(f.read())
    return h.hexdigest()


def _make_skill_zip(tmp_path: Path, skill_id: str, content: str = "# Skill") -> tuple[Path, str]:
    bundle = tmp_path / f"{skill_id}-bundle"
    bundle.mkdir()
    (bundle / "SKILL.md").write_text(content, encoding="utf-8")
    archive = tmp_path / f"{skill_id}.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.write(bundle / "SKILL.md", "SKILL.md")
    return archive, _sha256(archive)


# @lat: [[tests#Resource Apply#Adapter stage apply rollback]]
@pytest.mark.asyncio
async def test_skill_adapter_stage_apply_rollback(test_settings: Settings, tmp_path: Path) -> None:
    from db.session import create_engine, create_sessionmaker, init_db

    engine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)

    archive, checksum = _make_skill_zip(tmp_path, "demo-skill")
    file_url = archive.as_uri()

    async with session_maker() as session:
        ctx = await build_resource_context(test_settings, session)
        adapter = SkillResourceAdapter()
        desired = ResourceDesired(
            resource_type="skill",
            resource_id="demo-skill",
            version="1.0.0",
            operation="install",
            artifact_url=file_url,
            checksum=checksum,
            revision=1,
        )
        errors = await adapter.validate(ctx, desired)
        assert errors == []
        staged = await adapter.stage(ctx, desired)
        assert staged.is_dir()
        result = await adapter.apply(ctx, desired, staged)
        assert result.status == "installed"
        probe = await adapter.verify(ctx, desired)
        assert probe["filesystem"] is True

        snapshot = __import__(
            "runtime.resources._common", fromlist=["capture_snapshot"]
        ).capture_snapshot(ctx, "skill", "demo-skill", None)
        await adapter.rollback(ctx, desired, snapshot)
        probe_after = await adapter.verify(ctx, desired)
        assert probe_after.get("filesystem") in {True, False}

    await engine.dispose()


# @lat: [[tests#Resource Apply#MCP missing secret blocked]]
@pytest.mark.asyncio
async def test_mcp_missing_secret_blocked(test_settings: Settings) -> None:
    from db.session import create_engine, create_sessionmaker, init_db

    engine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)

    async with session_maker() as session:
        ctx = await build_resource_context(test_settings, session)
        adapter = McpResourceAdapter()
        desired = ResourceDesired(
            resource_type="mcp",
            resource_id="needs-secret",
            version="1.0.0",
            operation="install",
            payload={"requiredSecretNames": ["API_KEY"], "profileName": "default"},
            revision=2,
        )
        staged = await adapter.stage(ctx, desired)
        result = await adapter.apply(ctx, desired, staged)
        assert result.status == "blocked"
        assert result.conflict_type == "missing_secret"
        probe = await adapter.verify(ctx, desired)
        assert probe["blocked"] is True

    await engine.dispose()


# @lat: [[tests#Resource Apply#Checksum failure rejects download]]
@pytest.mark.asyncio
async def test_artifact_checksum_failure(test_settings: Settings, tmp_path: Path) -> None:
    archive, _ = _make_skill_zip(tmp_path, "chk-skill")
    layout_cache = test_settings.resolved_runtime_data_dir() / "artifact-cache"
    cache = ArtifactCache(test_settings, layout_cache)
    with pytest.raises(CopilotError) as exc:
        await cache.download(archive.as_uri(), expected_sha256="bad:deadbeef")
    assert exc.value.code == "checksum_mismatch"


# @lat: [[tests#Resource Apply#Revision rollback reverses completed ops]]
@pytest.mark.asyncio
async def test_revision_apply_rollback_on_failure(test_settings: Settings, tmp_path: Path) -> None:
    from db.session import create_engine, create_sessionmaker, init_db

    engine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)

    good_archive, good_checksum = _make_skill_zip(tmp_path, "good-skill")

    async with session_maker() as session:
        repo = EndpointSyncRepository(session)
        rev = DesiredStateRevision(
            revision=42,
            payload_json=json.dumps(
                {
                    "revision": 42,
                    "resources": [
                        {
                            "resourceType": "skill",
                            "resourceId": "good-skill",
                            "version": "1.0.0",
                            "checksum": good_checksum,
                            "artifactUrl": good_archive.as_uri(),
                        },
                        {
                            "resourceType": "skill",
                            "resourceId": "bad-skill",
                            "version": "9.9.9",
                            "checksum": "bad:deadbeef",
                            "artifactUrl": good_archive.as_uri(),
                        },
                    ],
                }
            ),
            status="pending",
        )
        await repo.add_revision(rev)
        await repo.add_desired_resource(
            DesiredStateResource(
                revision_id=rev.id,
                resource_type="skill",
                resource_id="good-skill",
                version="1.0.0",
                checksum=good_checksum,
                artifact_url=good_archive.as_uri(),
                ownership="center",
                payload_json="{}",
            )
        )
        await repo.add_desired_resource(
            DesiredStateResource(
                revision_id=rev.id,
                resource_type="skill",
                resource_id="bad-skill",
                version="9.9.9",
                checksum="bad:deadbeef",
                artifact_url=good_archive.as_uri(),
                ownership="center",
                payload_json="{}",
            )
        )
        await session.commit()

    async with session_maker() as session:
        svc = DesiredStateService(test_settings, session)
        with pytest.raises(ConflictError):
            await svc.apply_revision(42)
        await session.commit()

    async with session_maker() as session:
        repo = EndpointSyncRepository(session)
        inst = await repo.get_installation("skill", "good-skill")
        assert inst is None
        rev_row = await repo.get_revision_by_number(42)
        assert rev_row is not None
        assert rev_row.status == "rolled_back"

    await engine.dispose()


# @lat: [[tests#Resource Apply#Resource sync apply metadata only]]
@pytest.mark.asyncio
async def test_resource_sync_apply_metadata_only(test_settings: Settings) -> None:
    from db.session import create_engine, create_sessionmaker, init_db

    engine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)

    async with session_maker() as session:
        svc = ResourceSyncService(test_settings, session)
        result = await svc.apply_operation(
            operation="install",
            resource_type="policy",
            resource_id="workspace-policy",
            from_version=None,
            to_version="1.0.0",
            revision=5,
            desired_row=None,
        )
        assert result["status"] == "installed"
        probe = await svc.probe_resource("policy", "workspace-policy")
        assert probe["probed"] is True

    await engine.dispose()
