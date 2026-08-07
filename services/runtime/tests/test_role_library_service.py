from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from db.repositories.profile_repo import ProfileRepository
from db.repositories.role_spec_repo import RoleSpecRepository
from db.session import create_engine, create_sessionmaker, init_db
from schemas.role_library import PresetImportRequest, RoleLibrarySyncRequest
from services.role_library_service import RoleLibraryService


@pytest_asyncio.fixture
async def role_lib_session(
    test_settings: Settings,
) -> AsyncSession:
    engine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)
    async with session_maker() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_sync_library_mock_git(test_settings: Settings, role_lib_session: AsyncSession) -> None:
    svc = RoleLibraryService(
        test_settings,
        ProfileRepository(role_lib_session),
        RoleSpecRepository(role_lib_session),
    )
    svc._run_git = AsyncMock(return_value="abc123")  # type: ignore[method-assign]
    svc._git_head = AsyncMock(return_value="abc123")  # type: ignore[method-assign]

    result = await svc.sync_library(RoleLibrarySyncRequest(local_dir="test-lib"))
    assert result.ok is True
    assert "role-library" in result.path
    assert result.commit == "abc123"


@pytest.mark.asyncio
async def test_recompile_role_with_local_sources(
    test_settings: Settings,
    role_lib_session: AsyncSession,
    tmp_path: Path,
) -> None:
    from services.profile_service import ProfileService
    from schemas.profile import ProfileCreate
    from db.models.role_spec import ProfileRoleSpec

    profile_repo = ProfileRepository(role_lib_session)
    role_spec_repo = RoleSpecRepository(role_lib_session)
    profile_svc = ProfileService(test_settings, profile_repo)

    profile = await profile_svc.create_profile(
        ProfileCreate(name="writer-9601", type="writer", gateway_port=19602)
    )
    profile.description = "写作专家"
    await profile_repo.update(profile)

    source_root = tmp_path / "lib"
    rel = "marketing/marketing-content-creator.md"
    (source_root / "marketing").mkdir(parents=True)
    (source_root / rel).write_text("# Role\n", encoding="utf-8")

    spec = ProfileRoleSpec(
        profile_id=profile.id,
        role_key="writer",
        role_name="写作生文专家",
        source_repo="https://example.com/repo.git",
        source_paths_json=json.dumps([rel]),
        output_mode="soul-memory-skill",
    )
    await role_spec_repo.create(spec)

    svc = RoleLibraryService(test_settings, profile_repo, role_spec_repo)
    svc.sync_library = AsyncMock(  # type: ignore[method-assign]
        return_value=type("R", (), {"ok": True, "path": str(source_root), "error": None})()
    )

    updated = await svc.recompile_role(profile.id)
    assert updated.soul_path
    assert updated.source_checksum
    soul = Path(updated.soul_path).read_text(encoding="utf-8")
    assert "9601" not in soul and "端口" not in soul


@pytest.mark.asyncio
async def test_import_preset_overwrite_calls_stop(
    test_settings: Settings,
    role_lib_session: AsyncSession,
) -> None:
    from services.profile_service import ProfileService
    from schemas.profile import ProfileCreate

    profile_repo = ProfileRepository(role_lib_session)
    role_spec_repo = RoleSpecRepository(role_lib_session)
    profile_svc = ProfileService(test_settings, profile_repo)
    profile = await profile_svc.create_profile(
        ProfileCreate(name="writer-9601", type="writer", gateway_port=19603)
    )

    mock_supervisor = MagicMock()
    mock_supervisor.stop_profile = AsyncMock()

    svc = RoleLibraryService(
        test_settings,
        profile_repo,
        role_spec_repo,
        gateway_supervisor=mock_supervisor,
    )
    svc.sync_library = AsyncMock(  # type: ignore[method-assign]
        return_value=type("R", (), {"ok": True, "path": str(test_settings.hermes_home_path), "error": None})()
    )

    preset = """
version: team_v1.4
roleLibrary:
  localDir: agency-agents-zh
profiles:
  writer-9601:
    displayName: Writer
    port: 19603
    enabled: true
    autoStart: false
    roleSpec:
      roleKey: writer
      roleName: Writer
      sourcePaths: []
"""
    resp = await svc.import_preset(
        PresetImportRequest(preset_yaml=preset, overwrite=True),
    )
    assert resp.imported_count == 1
    mock_supervisor.stop_profile.assert_awaited_once_with(profile.id)
