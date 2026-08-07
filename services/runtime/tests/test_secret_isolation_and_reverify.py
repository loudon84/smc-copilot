"""Priority fixes: secret scope isolation + alreadyInstalled re-verify (v1.3.1)."""

from __future__ import annotations

from pathlib import Path

import pytest

from core.runtime_errors import RuntimeServiceError
from db.models.runtime import RuntimeVersion, SecretReference
from db.session import create_engine, create_sessionmaker, init_db
from runtime.gateway_process import GatewayProcessManager
from services.installation_service import InstallationService
from services.instance_gateway_service import InstanceGatewayService
from services.secret_service import SecretStore


@pytest.mark.asyncio
async def test_named_profile_does_not_borrow_default_secrets(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(tmp_path / "rt"))
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "db.sqlite"))
    monkeypatch.setenv("RUNTIME_ALLOW_INSECURE_SECRET_STORE", "true")
    import core.config as config_mod

    config_mod._settings = None
    from core.config import get_settings

    settings = get_settings()
    (tmp_path / "hermes").mkdir(parents=True)
    engine = create_engine(settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)
    store = SecretStore(settings)
    store.put("sk-default", "DEFAULT_ONLY_VALUE")
    store.put("sk-named", "NAMED_ONLY_VALUE")

    async with session_maker() as session:
        session.add(
            SecretReference(
                scope_type="profile",
                scope_id="default",
                secret_name="DASHSCOPE_API_KEY",
                storage_provider="file",
                storage_key="sk-default",
            )
        )
        session.add(
            SecretReference(
                scope_type="profile",
                scope_id="alice",
                secret_name="OPENAI_API_KEY",
                storage_provider="file",
                storage_key="sk-named",
            )
        )
        await session.commit()

    pm = GatewayProcessManager(settings)
    svc = InstanceGatewayService(
        settings=settings, session_maker=session_maker, process_manager=pm
    )
    async with session_maker() as session:
        default_secrets = await svc._resolve_secrets(session, "default")
        named_secrets = await svc._resolve_secrets(session, "alice")

    assert default_secrets.get("DASHSCOPE_API_KEY") == "DEFAULT_ONLY_VALUE"
    assert "OPENAI_API_KEY" not in default_secrets
    assert named_secrets.get("OPENAI_API_KEY") == "NAMED_ONLY_VALUE"
    assert "DASHSCOPE_API_KEY" not in named_secrets  # no borrow from default
    config_mod._settings = None


@pytest.mark.asyncio
async def test_already_installed_rejects_missing_executable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(tmp_path / "rt"))
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "db.sqlite"))
    import core.config as config_mod

    config_mod._settings = None
    from core.config import get_settings

    settings = get_settings()
    engine = create_engine(settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)
    missing = tmp_path / "no-such-hermes.exe"
    async with session_maker() as session:
        from db.repositories.runtime_repo import RuntimeVersionRepository

        row = RuntimeVersion(
            version="0.19.0",
            channel="stable",
            install_path=str(tmp_path / "install"),
            executable_path=str(missing),
            status="active",
        )
        repo = RuntimeVersionRepository(session)
        await repo.add(row)
        await session.commit()

    svc = InstallationService(settings, session_maker)
    with pytest.raises(RuntimeServiceError) as ei:
        await svc._verify_existing_executable(
            RuntimeVersion(
                version="0.19.0",
                channel="stable",
                install_path=str(tmp_path),
                executable_path=str(missing),
                status="active",
            ),
            "0.19.0",
        )
    assert ei.value.code == "hermes_executable_missing"
    config_mod._settings = None


@pytest.mark.asyncio
async def test_already_installed_rejects_stub_script(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(tmp_path / "rt"))
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "db.sqlite"))
    import core.config as config_mod

    config_mod._settings = None
    from core.config import get_settings

    settings = get_settings()
    stub = tmp_path / "hermes"
    stub.write_text("#!/usr/bin/env python\n# stub hermes\nprint('hermes stub')\n", encoding="utf-8")
    svc = InstallationService(settings, create_sessionmaker(create_engine(settings)))
    with pytest.raises(RuntimeServiceError) as ei:
        await svc._verify_existing_executable(
            RuntimeVersion(
                version="0.19.0",
                channel="stable",
                install_path=str(tmp_path),
                executable_path=str(stub),
                status="active",
            ),
            "0.19.0",
        )
    assert ei.value.code == "artifact_not_installable"
    config_mod._settings = None
