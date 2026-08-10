"""PRD v1.5.4 — Hermes Execution Model Catalog normalization + seed/reconcile."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from db.models.chat_settings import ProfileChatSettings
from db.models.runtime import HermesInstance
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from db.session import create_engine, create_sessionmaker, init_db
from integrations.hermes.client import GatewayHealthResult
from services.hermes_model_catalog_service import normalize_model_options
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


# @lat: [[tests#Hermes Model Catalog]]
def test_normalize_model_options_providers_shape() -> None:
    raw = {
        "providers": [
            {
                "id": "custom",
                "models": [
                    {"id": "model-a", "label": "Model A"},
                    {"id": "model-b", "label": "Model B"},
                ],
            }
        ]
    }
    models = normalize_model_options(raw)
    assert len(models) == 2
    assert {m.id for m in models} == {"model-a", "model-b"}
    assert all(m.provider == "custom" for m in models)
    assert all(m.source == "hermes-model-options" for m in models)


def test_normalize_model_options_flat_shape() -> None:
    raw = {
        "models": [
            {"id": "gpt-4.1", "provider": "custom", "capabilities": {"vision": True}},
        ]
    }
    models = normalize_model_options(raw)
    assert len(models) == 1
    assert models[0].id == "gpt-4.1"
    assert models[0].capabilities is not None
    assert models[0].capabilities.vision is True


@pytest.mark.asyncio
async def test_ensure_default_model_config_from_yaml_not_gateway(
    seed_settings, seed_session: AsyncSession
) -> None:
    """PRD v1.5.4: seed from config.yaml, never /v1/models virtual alias."""
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
    mock_client.list_model_options = AsyncMock(
        return_value={
            "providers": [
                {"id": "custom", "models": [{"id": "gpt-4.1"}, {"id": "gpt-4o"}]}
            ]
        }
    )
    mock_factory = MagicMock()
    mock_factory.create_for_instance = AsyncMock(return_value=mock_client)

    with patch.object(svc, "_factory", return_value=mock_factory):
        cfg = await svc.ensure_default_model_config("inst-default-1")
        listed = await svc.list_models("inst-default-1")

    assert cfg is not None
    assert cfg.model_id == "gpt-4.1"
    assert cfg.provider == "custom"
    assert cfg.source == "hermes-config"
    assert all(m.id != "smc-copilot" for m in listed.models)
    assert any(m.id == "gpt-4.1" and m.is_default for m in listed.models)
    assert listed.default_model is not None
    assert listed.default_model.model_id == "gpt-4.1"


@pytest.mark.asyncio
async def test_list_models_excludes_gateway_virtual(
    seed_settings, seed_session: AsyncSession
) -> None:
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
        return_value=([{"id": "smc-copilot"}], {"data": [{"id": "smc-copilot"}]})
    )
    mock_client.list_model_options = AsyncMock(
        return_value={
            "models": [
                {"id": "smc-copilot", "provider": "hermes"},
                {"id": "model-a", "provider": "custom"},
                {"id": "model-b", "provider": "custom"},
            ]
        }
    )
    mock_factory = MagicMock()
    mock_factory.create_for_instance = AsyncMock(return_value=mock_client)

    with patch.object(svc, "_factory", return_value=mock_factory):
        listed = await svc.list_models("inst-default-1")

    ids = [m.id for m in listed.models]
    assert "smc-copilot" not in ids
    assert "model-a" in ids
    assert "model-b" in ids
    assert listed.gateway is not None
    assert listed.gateway.virtual_model == "smc-copilot"


@pytest.mark.asyncio
async def test_reconcile_legacy_virtual_model_binding(
    seed_settings, seed_session: AsyncSession
) -> None:
    settings, _ = seed_settings
    svc = _svc(seed_session, settings)

    # Seed a shadow profile + polluted settings row.
    from db.models.profile import Profile
    from utils.paths import profile_dir

    shadow = Profile(
        name="default",
        type="default",
        hermes_home=str(settings.hermes_home_path),
        profile_path=str(profile_dir(settings, "default")),
        gateway_port=8642,
        enabled=True,
        auto_start=False,
        status="stopped",
    )
    created = await ProfileRepository(seed_session).create(shadow)
    now = "2026-08-10T00:00:00+00:00"
    row = ProfileChatSettings(
        profile_id=created.id,
        instance_id="inst-default-1",
        provider="hermes",
        model_id="smc-copilot",
        model_label="smc-copilot",
        base_url=None,
        is_default=1,
        created_at=now,
        updated_at=now,
    )
    await ChatSettingsRepository(seed_session).upsert_for_instance("inst-default-1", row)

    mock_client = MagicMock()
    mock_client.list_models = AsyncMock(
        return_value=([{"id": "smc-copilot"}], {"data": []})
    )
    mock_factory = MagicMock()
    mock_factory.create_for_instance = AsyncMock(return_value=mock_client)

    with patch.object(svc, "_factory", return_value=mock_factory):
        cfg = await svc.get_model_config("inst-default-1")

    assert cfg is not None
    assert cfg.model_id == "gpt-4.1"
    assert cfg.provider == "custom"


@pytest.mark.asyncio
async def test_ensure_does_not_overwrite_real_user_selection(
    seed_settings, seed_session: AsyncSession
) -> None:
    settings, _ = seed_settings
    svc = _svc(seed_session, settings)

    from db.models.profile import Profile
    from utils.paths import profile_dir

    shadow = Profile(
        name="default",
        type="default",
        hermes_home=str(settings.hermes_home_path),
        profile_path=str(profile_dir(settings, "default")),
        gateway_port=8642,
        enabled=True,
        auto_start=False,
        status="stopped",
    )
    created = await ProfileRepository(seed_session).create(shadow)
    now = "2026-08-10T00:00:00+00:00"
    row = ProfileChatSettings(
        profile_id=created.id,
        instance_id="inst-default-1",
        provider="custom",
        model_id="gpt-4o",
        model_label="gpt-4o",
        base_url=None,
        is_default=1,
        created_at=now,
        updated_at=now,
    )
    await ChatSettingsRepository(seed_session).upsert_for_instance("inst-default-1", row)

    kept = await svc.ensure_default_model_config("inst-default-1")
    assert kept is not None
    assert kept.model_id == "gpt-4o"
    assert kept.provider == "custom"


@pytest.mark.asyncio
async def test_set_model_config_writes_hermes_config_yaml(
    seed_settings, seed_session: AsyncSession
) -> None:
    """Set default via Runtime must update Hermes config.yaml (Agent SOT)."""
    settings, hermes = seed_settings
    svc = _svc(seed_session, settings)

    from db.models.profile import Profile
    from utils.paths import profile_dir

    shadow = Profile(
        name="default",
        type="default",
        hermes_home=str(settings.hermes_home_path),
        profile_path=str(profile_dir(settings, "default")),
        gateway_port=8642,
        enabled=True,
        auto_start=False,
        status="stopped",
    )
    await ProfileRepository(seed_session).create(shadow)

    from schemas.chat import SetInstanceChatModelConfigPayload

    saved = await svc.set_model_config(
        "inst-default-1",
        SetInstanceChatModelConfigPayload(
            provider="custom",
            model_id="gpt-4o",
            model_label="GPT-4o",
            base_url="https://api.openai.com/v1",
        ),
    )
    assert saved.model_id == "gpt-4o"

    text = (hermes / "config.yaml").read_text(encoding="utf-8")
    assert "gpt-4o" in text
    assert "https://api.openai.com/v1" in text


@pytest.mark.asyncio
async def test_executor_resolve_skips_virtual_and_uses_config_yaml(
    seed_settings, seed_session: AsyncSession
) -> None:
    """PRD v1.5.4 P0: chat execution must not send smc-copilot from /v1/models or DB."""
    from services.hermes_chat_executor import HermesChatExecutor

    settings, _ = seed_settings
    from db.models.profile import Profile
    from utils.paths import profile_dir

    shadow = Profile(
        name="default",
        type="default",
        hermes_home=str(settings.hermes_home_path),
        profile_path=str(profile_dir(settings, "default")),
        gateway_port=8642,
        enabled=True,
        auto_start=False,
        status="stopped",
    )
    created = await ProfileRepository(seed_session).create(shadow)
    now = "2026-08-10T00:00:00+00:00"
    row = ProfileChatSettings(
        profile_id=created.id,
        instance_id="inst-default-1",
        provider="hermes",
        model_id="smc-copilot",
        model_label="smc-copilot",
        base_url=None,
        is_default=1,
        created_at=now,
        updated_at=now,
    )
    await ChatSettingsRepository(seed_session).upsert_for_instance("inst-default-1", row)

    executor = HermesChatExecutor(seed_session, settings=settings)
    mock_client = MagicMock()
    mock_client.list_models = AsyncMock(
        return_value=([{"id": "smc-copilot"}], {"data": []})
    )
    mock_factory = MagicMock()
    mock_factory.create_for_instance = AsyncMock(return_value=mock_client)

    with patch(
        "services.hermes_model_catalog_service.HermesGatewayClientFactory",
        return_value=mock_factory,
    ):
        # Unreconciled DB + session override virtual → config.yaml gpt-4.1
        model = await executor.resolve_default_model("inst-default-1", "smc-copilot")
        assert model == "gpt-4.1"
        # Real session override wins
        assert await executor.resolve_default_model("inst-default-1", "gpt-4o") == "gpt-4o"


@pytest.mark.asyncio
async def test_executor_omit_model_when_no_config_default(
    seed_settings, seed_session: AsyncSession, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PRD §47: when no execution model resolves, return None (omit payload.model)."""
    from services.hermes_chat_executor import HermesChatExecutor
    import core.config as config_mod

    settings, hermes = seed_settings
    (hermes / "config.yaml").write_text("model:\n  provider: custom\n", encoding="utf-8")
    config_mod._settings = None
    settings = get_settings()

    executor = HermesChatExecutor(seed_session, settings=settings)
    mock_client = MagicMock()
    mock_client.list_models = AsyncMock(
        return_value=([{"id": "smc-copilot"}], {"data": []})
    )
    mock_factory = MagicMock()
    mock_factory.create_for_instance = AsyncMock(return_value=mock_client)

    with patch(
        "services.hermes_model_catalog_service.HermesGatewayClientFactory",
        return_value=mock_factory,
    ):
        model = await executor.resolve_default_model("inst-default-1", None)
    assert model is None
