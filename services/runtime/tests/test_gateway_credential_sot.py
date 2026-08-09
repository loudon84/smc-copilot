"""Gateway credential SOT alignment tests (PRD v1.5.3 §83–§86)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings, get_settings
from core.runtime_errors import RuntimeServiceError
from db.session import create_engine, create_sessionmaker, init_db
from integrations.hermes.client_factory import HermesGatewayClientFactory
from runtime.gateway_environment import build_gateway_environment
from services.gateway_credential_service import GatewayCredentialService
from services.hermes_local_config_service import HermesLocalConfigService
from services.secret_service import SecretService


@pytest.fixture
def sot_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Settings, Path]:
    hermes = tmp_path / "hermes"
    hermes.mkdir()
    data = tmp_path / "data"
    data.mkdir()
    runtime_data = tmp_path / "runtime"
    runtime_data.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes))
    monkeypatch.setenv("SQLITE_PATH", str(data / "test.db"))
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(runtime_data))
    monkeypatch.setenv("RUNTIME_ALLOW_INSECURE_SECRET_STORE", "true")
    monkeypatch.setenv("LOG_DIR", str(data / "logs"))
    import core.config as config_mod

    config_mod._settings = None
    settings = get_settings()
    yield settings, hermes.resolve()
    config_mod._settings = None


@pytest_asyncio.fixture
async def sot_session(sot_settings) -> AsyncSession:
    settings, _ = sot_settings
    engine = create_engine(settings)
    await init_db(engine)
    maker = create_sessionmaker(engine)
    async with maker() as session:
        yield session


@pytest.mark.asyncio
async def test_credential_service_reads_dotenv(sot_settings, sot_session: AsyncSession) -> None:
    # @lat: [[tests#Gateway credential SOT#Dotenv key resolution]]
    settings, hermes = sot_settings
    (hermes / ".env").write_text("API_SERVER_KEY=test-key-a\n", encoding="utf-8")
    svc = GatewayCredentialService(settings, sot_session)
    assert await svc.resolve_api_server_key("default") == "test-key-a"


@pytest.mark.asyncio
async def test_legacy_secret_store_ignored(sot_settings, sot_session: AsyncSession) -> None:
    # @lat: [[tests#Gateway credential SOT#Ignore legacy runtime secret]]
    settings, hermes = sot_settings
    (hermes / ".env").write_text("API_SERVER_KEY=KEY-A\n", encoding="utf-8")
    await SecretService(settings, sot_session).put("default", "API_SERVER_KEY", "KEY-B")
    await sot_session.commit()
    svc = GatewayCredentialService(settings, sot_session)
    assert await svc.resolve_api_server_key("default") == "KEY-A"
    assert await svc.has_legacy_runtime_api_server_key("default") is True


@pytest.mark.asyncio
async def test_external_missing_key_fail_closed(sot_settings, sot_session: AsyncSession) -> None:
    # @lat: [[tests#Gateway credential SOT#Missing external key]]
    settings, hermes = sot_settings
    (hermes / ".env").write_text("OPENAI_API_KEY=sk\n", encoding="utf-8")
    with pytest.raises(RuntimeServiceError) as ei:
        await SecretService(settings, sot_session).ensure_api_server_key(
            "default",
            managed_install=False,
        )
    assert ei.value.code == "HERMES_API_SERVER_KEY_MISSING"
    # Must not create a SecretStore entry
    assert await GatewayCredentialService(settings, sot_session).has_legacy_runtime_api_server_key("default") is False
    assert HermesLocalConfigService(settings).resolve_api_server_key("default") is None


@pytest.mark.asyncio
async def test_spawn_and_client_use_identical_key(sot_settings, sot_session: AsyncSession) -> None:
    # @lat: [[tests#Gateway credential SOT#Same key for spawn and client]]
    settings, hermes = sot_settings
    (hermes / ".env").write_text("API_SERVER_KEY=KEY-A\n", encoding="utf-8")

    local = HermesLocalConfigService(settings)
    key = local.resolve_api_server_key("default")
    assert key == "KEY-A"

    child = build_gateway_environment(
        settings,
        profile_name="default",
        gateway_port=8642,
        secrets={"API_SERVER_KEY": key},
        base_env={"PATH": "/usr/bin"},
    )
    assert child["API_SERVER_KEY"] == "KEY-A"

    creds = await GatewayCredentialService(settings, sot_session).resolve_for_profile_name("default", 8642)
    assert creds.api_server_key == "KEY-A"

    # Factory path (no instance row) — profile port helper
    factory = HermesGatewayClientFactory(settings, sot_session)
    client = await factory.create_for_profile_name("default", 8642, require_key=True)
    assert client._api_key == "KEY-A"  # noqa: SLF001


@pytest.mark.asyncio
async def test_named_profile_credential_rejected(sot_settings, sot_session: AsyncSession) -> None:
    settings, hermes = sot_settings
    (hermes / ".env").write_text("API_SERVER_KEY=KEY-A\n", encoding="utf-8")
    svc = GatewayCredentialService(settings, sot_session)
    with pytest.raises(RuntimeServiceError) as ei:
        await svc.resolve_api_server_key("finance")
    assert ei.value.code == "LOCAL_HERMES_PROFILE_UNSUPPORTED"
