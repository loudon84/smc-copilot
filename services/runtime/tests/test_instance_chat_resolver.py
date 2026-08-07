from __future__ import annotations

import ast
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.constants import GatewayStatus
from core.runtime_enums import InstanceStatus
from db.models.profile import Profile
from db.models.runtime import HermesInstance, RuntimeVersion
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from db.session import create_sessionmaker
from services.instance_chat_service import InstanceChatService
from services.instance_ref_resolver import InstanceRefResolver

_ROOT = Path(__file__).resolve().parents[1]
_INSTANCE_CHAT_MODULES = (
    _ROOT / "src" / "services" / "instance_ref_resolver.py",
    _ROOT / "src" / "services" / "instance_chat_service.py",
)


def _module_source_paths() -> list[Path]:
    return list(_INSTANCE_CHAT_MODULES)


def _assert_no_profile_status_checks() -> None:
    forbidden_tokens = (
        "profiles.status",
        "profile.status",
        "GatewayStatus",
        "ProfileRefResolver",
    )
    for path in _module_source_paths():
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in {"ProfileRefResolver", "GatewayStatus"}:
                        raise AssertionError(f"{path.name} imports forbidden symbol: {alias.name}")
            if isinstance(node, ast.ImportFrom) and node.module:
                if node.module.endswith("profile_ref_resolver"):
                    raise AssertionError(f"{path.name} imports ProfileRefResolver from {node.module}")
                for alias in node.names:
                    if alias.name in {"ProfileRefResolver", "GatewayStatus"}:
                        raise AssertionError(f"{path.name} imports forbidden symbol: {alias.name}")
        for token in forbidden_tokens:
            assert token not in source, f"{path.name} must not reference {token!r}"


# @lat: [[tests#Instance Chat#Does not read profiles status]]
@pytest.mark.asyncio
async def test_instance_chat_does_not_read_profiles_status(app_client, monkeypatch: pytest.MonkeyPatch) -> None:
    _assert_no_profile_status_checks()

    _client, _supervisor, settings, _hub, app = app_client
    session_maker = create_sessionmaker(app.state.engine)

    async with session_maker() as session:
        profile = Profile(
            name="instance-chat-profile",
            type="default",
            hermes_home=str(settings.hermes_home_path),
            profile_path=str(settings.hermes_home_path / "profiles" / "instance-chat-profile"),
            gateway_port=19901,
            enabled=True,
            auto_start=False,
            status=GatewayStatus.STOPPED.value,
        )
        session.add(profile)
        await session.flush()

        ver = RuntimeVersion(
            version="0.20.0-test",
            channel="stable",
            install_path=str(settings.resolved_runtime_data_dir()),
            executable_path=sys.executable,
            status="active",
        )
        session.add(ver)
        await session.flush()

        inst = HermesInstance(
            name="instance-chat-inst",
            profile_name=profile.name,
            runtime_version_id=ver.id,
            gateway_port=19901,
            status=InstanceStatus.RUNNING.value,
            healthy=True,
            auto_start=False,
        )
        session.add(inst)
        await session.commit()
        instance_id = inst.id

    profile_home = settings.hermes_home_path / "profiles" / "instance-chat-profile"
    profile_home.mkdir(parents=True, exist_ok=True)

    mock_client = MagicMock()
    mock_client.health_check = AsyncMock(return_value=True)
    mock_client.list_models = AsyncMock(
        return_value=(
            [{"id": "test-model", "name": "Test Model"}],
            {"data": [{"id": "test-model", "name": "Test Model"}]},
        )
    )

    async def fake_create_for_instance(
        self,
        _instance_id: str,
        *,
        timeout: float = 60.0,
        require_key: bool = True,
    ):
        _ = self
        _ = timeout
        _ = require_key
        return mock_client

    monkeypatch.setattr(
        "services.instance_chat_service.HermesGatewayClientFactory.create_for_instance",
        fake_create_for_instance,
    )

    async with session_maker() as session:
        svc = InstanceChatService(
            session,
            ChatSettingsRepository(session),
            ChatAttachmentRepository(session),
            WorkspaceRepository(session),
            profile_repo=ProfileRepository(session),
            settings=settings,
        )
        result = await svc.list_models(instance_id)

    assert result.status == "ok"
    assert len(result.models) == 1
    assert result.models[0].id == "test-model"
    assert result.instance_id == instance_id

    async with session_maker() as session:
        resolver = InstanceRefResolver(session, settings=settings)
        resolved = await resolver.resolve(instance_id)
    assert resolved.status == "running"
    assert resolved.healthy is True


@pytest.mark.asyncio
async def test_resolve_instance_by_profile_name(app_client) -> None:
    _client, _supervisor, settings, _hub, app = app_client
    session_maker = create_sessionmaker(app.state.engine)

    async with session_maker() as session:
        inst = HermesInstance(
            name="resolve-by-profile",
            profile_name="resolve-profile-name",
            gateway_port=19902,
            status=InstanceStatus.STOPPED.value,
            healthy=False,
            auto_start=False,
        )
        session.add(inst)
        await session.commit()

    async with session_maker() as session:
        resolver = InstanceRefResolver(session, settings=settings)
        resolved = await resolver.resolve("resolve-profile-name")

    assert resolved.name == "resolve-by-profile"
    assert resolved.profile_name == "resolve-profile-name"
