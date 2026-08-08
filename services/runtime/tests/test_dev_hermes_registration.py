"""PRD v1.4.1 — Dev Hermes discovery / registration / idempotency tests."""

from __future__ import annotations

# @lat: [[tests#v1.4.1 Hotfix#Dev Hermes registration idempotent]]

import json
import os
import stat
import textwrap
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from core.config import Settings
from core.runtime_enums import RuntimeVersionStatus
from db.models.runtime import HermesInstance, RuntimeVersion
from db.session import create_engine, create_sessionmaker, init_db
from services.dev_hermes_registration_service import (
    DevHermesRegistrationError,
    DevHermesRegistrationService,
    parse_hermes_version,
    resolve_local_hermes,
    validate_hermes_executable,
)


def _write_fake_hermes(path: Path, version: str) -> Path:
    if os.name == "nt":
        script = path.with_suffix(".cmd")
        script.write_text(
            textwrap.dedent(
                f"""
                @echo off
                echo hermes {version}
                exit /b 0
                """
            ).lstrip(),
            encoding="utf-8",
        )
        return script
    script = path
    script.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            echo "hermes {version}"
            exit 0
            """
        ),
        encoding="utf-8",
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return script


@pytest.fixture
def reg_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    data = tmp_path / "runtime-data"
    data.mkdir()
    db_path = data / "runtime.db"
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(data))
    monkeypatch.setenv("SQLITE_PATH", str(db_path))
    monkeypatch.setenv("LOG_DIR", str(data / "logs"))
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    monkeypatch.delenv("HERMES_DEV_EXECUTABLE", raising=False)
    monkeypatch.delenv("HERMES_DEV_REQUIRED", raising=False)
    return Settings()


@pytest_asyncio.fixture
async def session_maker(reg_settings: Settings):
    engine = create_engine(reg_settings)
    await init_db(engine)
    maker = create_sessionmaker(engine)
    yield maker
    await engine.dispose()


def test_parse_hermes_version() -> None:
    assert parse_hermes_version("hermes 0.20.0") == "0.20.0"
    assert parse_hermes_version("0.21") == "0.21"
    with pytest.raises(DevHermesRegistrationError):
        parse_hermes_version("not-a-version")


def test_resolve_explicit_override(tmp_path: Path) -> None:
    exe = _write_fake_hermes(tmp_path / "hermes", "0.20.0")
    path, explicit = resolve_local_hermes(env={"HERMES_DEV_EXECUTABLE": str(exe)})
    assert explicit is True
    assert path is not None
    assert path == exe.resolve()


def test_resolve_missing_explicit_fails() -> None:
    with pytest.raises(DevHermesRegistrationError):
        resolve_local_hermes(env={"HERMES_DEV_EXECUTABLE": "C:\\missing\\hermes.exe"})


@pytest.mark.asyncio
async def test_register_creates_active_version_and_default_instance(
    reg_settings: Settings, session_maker, tmp_path: Path
) -> None:
    exe = _write_fake_hermes(tmp_path / "hermes", "0.20.0")
    env = {"HERMES_DEV_EXECUTABLE": str(exe)}
    result = await DevHermesRegistrationService(reg_settings, session_maker, env=env).register()
    assert result.status == "ready"
    assert result.version == "0.20.0"

    async with session_maker() as session:
        versions = list((await session.execute(select(RuntimeVersion))).scalars().all())
        assert len(versions) == 1
        assert versions[0].status == RuntimeVersionStatus.ACTIVE.value
        assert versions[0].channel == "development"
        meta = json.loads(versions[0].metadata_json or "{}")
        assert meta.get("source") == "external-dev"
        assert meta.get("managed") is False
        instances = list((await session.execute(select(HermesInstance))).scalars().all())
        assert len(instances) == 1
        assert instances[0].name == "default"
        assert instances[0].auto_start is True
        assert instances[0].runtime_version_id == versions[0].id


@pytest.mark.asyncio
async def test_register_idempotent(
    reg_settings: Settings, session_maker, tmp_path: Path
) -> None:
    exe = _write_fake_hermes(tmp_path / "hermes", "0.20.0")
    env = {"HERMES_DEV_EXECUTABLE": str(exe)}
    svc = DevHermesRegistrationService(reg_settings, session_maker, env=env)
    await svc.register()
    await svc.register()
    await svc.register()

    async with session_maker() as session:
        version_count = (
            await session.execute(select(func.count()).select_from(RuntimeVersion))
        ).scalar_one()
        instance_count = (
            await session.execute(select(func.count()).select_from(HermesInstance))
        ).scalar_one()
        assert int(version_count) == 1
        assert int(instance_count) == 1


@pytest.mark.asyncio
async def test_register_upgrades_version(
    reg_settings: Settings, session_maker, tmp_path: Path
) -> None:
    exe20 = _write_fake_hermes(tmp_path / "hermes20", "0.20.0")
    await DevHermesRegistrationService(
        reg_settings, session_maker, env={"HERMES_DEV_EXECUTABLE": str(exe20)}
    ).register()

    exe21 = _write_fake_hermes(tmp_path / "hermes21", "0.21.0")
    await DevHermesRegistrationService(
        reg_settings, session_maker, env={"HERMES_DEV_EXECUTABLE": str(exe21)}
    ).register()

    async with session_maker() as session:
        rows = list((await session.execute(select(RuntimeVersion))).scalars().all())
        assert len(rows) == 2
        active = [r for r in rows if r.status == RuntimeVersionStatus.ACTIVE.value]
        assert len(active) == 1
        assert active[0].version == "0.21.0"
        assert Path(active[0].executable_path).exists()
        # Old external file must not be deleted
        assert exe20.exists()
        inst = (
            await session.execute(select(HermesInstance).where(HermesInstance.name == "default"))
        ).scalar_one()
        assert inst.runtime_version_id == active[0].id


@pytest.mark.asyncio
async def test_missing_hermes_skipped_unless_required(
    reg_settings: Settings, session_maker, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PATH", "")
    result = await DevHermesRegistrationService(
        reg_settings, session_maker, env={"PATH": "", "HERMES_DEV_EXECUTABLE": ""}
    ).register()
    assert result.status == "skipped"

    with pytest.raises(DevHermesRegistrationError):
        await DevHermesRegistrationService(
            reg_settings,
            session_maker,
            env={"PATH": "", "HERMES_DEV_EXECUTABLE": "", "HERMES_DEV_REQUIRED": "1"},
        ).register()


def test_validate_rejects_non_zero_exit(tmp_path: Path) -> None:
    if os.name == "nt":
        bad = tmp_path / "bad.cmd"
        bad.write_text("@echo off\nexit /b 1\n", encoding="utf-8")
    else:
        bad = tmp_path / "bad"
        bad.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        bad.chmod(bad.stat().st_mode | stat.S_IEXEC)
    with pytest.raises(DevHermesRegistrationError):
        validate_hermes_executable(bad)
