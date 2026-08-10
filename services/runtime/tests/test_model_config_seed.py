"""Default model-config seeding when Instance is ready (PRD v1.5.4)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from db.models.runtime import HermesInstance
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from db.session import create_engine, create_sessionmaker, init_db
from integrations.hermes.client import GatewayHealthResult
from services.instance_chat_service import InstanceChatService


def _svc(session: AsyncSession, settings) -> InstanceChatService:
    return InstanceChatService(
        session,
        ChatSettingsRepository(session),
        ChatAttachmentRepository(session),
        WorkspaceRepository(session),
        profile_repo=ProfileRepository(session),
        settings=settings,
    )


@pytest.fixture
def seed_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    hermes = tmp_path / "hermes"
    hermes.mkdir()
    (hermes / ".env").write_text("API_SERVER_KEY=test-key\n", encoding="utf-8")
    (hermes / "config.yaml").write_text(
        "model:\n  provider: custom\n  default: gpt-4.1\n",
        encoding="utf-8",
    )
    data = tmp_path / "data"
    data.mkdir()
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes))
    monkeypatch.setenv("SQLITE_PATH", str(data / "test.db"))
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(runtime))
    monkeypatch.setenv("RUNTIME_ALLOW_INSECURE_SECRET_STORE", "true")
    monkeypatch.setenv("LOG_DIR", str(data / "logs"))
    import core.config as config_mod

    config_mod._settings = None
    settings = get_settings()
    yield settings, hermes
    config_mod._settings = None


@pytest_asyncio.fixture
async def seed_session(seed_settings) -> AsyncSession:
    settings, _ = seed_settings
    engine = create_engine(settings)
    await init_db(engine)
    maker = create_sessionmaker(engine)
    async with maker() as session:
        inst = HermesInstance(
            id="inst-default-1",
            name="default",
            profile_name="default",
            gateway_port=8642,
            status="running",
            healthy=True,
            auto_start=True,
        )
        session.add(inst)
        await session.commit()
        yield session


@pytest.mark.asyncio
async def test_ensure_default_model_config_from_yaml(seed_settings, seed_session: AsyncSession) -> None:
    """PRD v1.5.4: seed from config.yaml even when Gateway returns virtual model."""
    settings, _ = seed_settings
    svc = _svc(seed_session, settings)

    healthy = GatewayHealthResult(
        reachable=True,
        authenticated=True,
        healthy=True,
        status_code=200,
        source="/v1/models",
    )
    mock_client = MagicMock()
    mock_client.health_check = AsyncMock(return_value=healthy)
    mock_client.list_models = AsyncMock(
        return_value=([{"id": "smc-copilot", "owned_by": "hermes"}], {"data": []})
    )
    mock_factory = MagicMock()
    mock_factory.create_for_instance = AsyncMock(return_value=mock_client)

    with patch.object(svc, "_factory", return_value=mock_factory):
        cfg = await svc.ensure_default_model_config("inst-default-1")
        again = await svc.get_model_config("inst-default-1")

    assert cfg is not None
    assert cfg.model_id == "gpt-4.1"
    assert cfg.provider == "custom"
    assert again is not None
    assert again.model_id == "gpt-4.1"
    # Second ensure must not overwrite
    with patch.object(svc, "_factory", return_value=mock_factory):
        kept = await svc.ensure_default_model_config("inst-default-1")
    assert kept is not None
    assert kept.model_id == "gpt-4.1"
    profile = await ProfileRepository(seed_session).get_by_name("default")
    assert profile is not None


@pytest.mark.asyncio
async def test_ensure_default_model_config_when_gateway_down(
    seed_settings, seed_session: AsyncSession
) -> None:
    settings, _ = seed_settings
    svc = _svc(seed_session, settings)
    unhealthy = GatewayHealthResult(
        reachable=False,
        authenticated=False,
        healthy=False,
        error_code="GATEWAY_UNREACHABLE",
    )
    mock_client = MagicMock()
    mock_client.health_check = AsyncMock(return_value=unhealthy)
    mock_client.list_models = AsyncMock(side_effect=Exception("unreachable"))
    mock_factory = MagicMock()
    mock_factory.create_for_instance = AsyncMock(return_value=mock_client)

    with patch.object(svc, "_factory", return_value=mock_factory):
        cfg = await svc.ensure_default_model_config("inst-default-1")

    assert cfg is not None
    assert cfg.model_id == "gpt-4.1"
    assert cfg.provider == "custom"
