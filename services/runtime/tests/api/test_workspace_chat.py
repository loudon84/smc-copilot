from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient

from services.gateway_supervisor import GatewaySupervisor

_ROOT = Path(__file__).resolve().parents[2]
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", "default"]


@pytest.mark.asyncio
async def test_resolve_profile_by_name(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "default",
            "type": "default",
            "gateway_port": 18642,
            "enabled": True,
            "auto_start": False,
        },
    )
    assert create_resp.status_code == 201, create_resp.text

    resolve_resp = await client.get("/api/v1/profiles/resolve", params={"ref": "default"})
    assert resolve_resp.status_code == 200, resolve_resp.text
    body = resolve_resp.json()
    assert body["name"] == "default"
    assert body["profile_id"]


@pytest.mark.asyncio
async def test_resolve_profile_not_found(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    resp = await client.get("/api/v1/profiles/resolve", params={"ref": "missing-profile-xyz"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "PROFILE_NOT_FOUND"


@pytest.mark.asyncio
async def test_list_models_gateway_down(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "writer-chat-test",
            "type": "writer",
            "gateway_port": 18643,
            "enabled": True,
            "auto_start": False,
        },
    )
    assert create_resp.status_code == 201
    profile_id = create_resp.json()["id"]

    models_resp = await client.get(f"/api/v1/profiles/{profile_id}/chat/models")
    assert models_resp.status_code == 200
    body = models_resp.json()
    assert body["models"] == []
    assert body["status"] == "gateway_not_running"


@pytest.mark.asyncio
async def test_set_and_get_model_config(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "finance-chat-test",
            "type": "finance",
            "gateway_port": 18644,
            "enabled": True,
            "auto_start": False,
        },
    )
    profile_id = create_resp.json()["id"]

    put_resp = await client.put(
        f"/api/v1/profiles/{profile_id}/chat/model-config",
        json={
            "provider": "ollama",
            "model_id": "qwen3-coder",
            "model_label": "Qwen3 Coder",
            "base_url": "http://127.0.0.1:11434/v1",
        },
    )
    assert put_resp.status_code == 200, put_resp.text
    assert put_resp.json()["model_id"] == "qwen3-coder"

    get_resp = await client.get(f"/api/v1/profiles/{profile_id}/chat/model-config")
    assert get_resp.status_code == 200
    assert get_resp.json()["model_id"] == "qwen3-coder"


@pytest.mark.asyncio
async def test_chat_completions_sse_mock_gateway(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, supervisor, _settings, _hub, _app = app_client
    port = 18645
    supervisor.set_mock_gateway_command(_mock_cmd(port))

    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "chat-sse-test",
            "type": "default",
            "gateway_port": port,
            "enabled": True,
            "auto_start": False,
        },
    )
    profile_id = create_resp.json()["id"]

    start_resp = await client.post(f"/api/v1/profiles/{profile_id}/start")
    assert start_resp.status_code == 200, start_resp.text

    async with client.stream(
        "POST",
        f"/api/v1/profiles/{profile_id}/chat/completions",
        json={
            "workspace_id": profile_id,
            "session_id": "session_test_1",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
    ) as stream_resp:
        assert stream_resp.status_code == 200
        body = ""
        async for chunk in stream_resp.aiter_text():
            body += chunk
        assert "chat.chunk" in body
        assert "chat.done" in body
        assert "resolved_session_id" in body


@pytest.mark.asyncio
async def test_resolve_profile_not_deployed(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    import shutil

    from core.config import Settings

    client, _supervisor, settings, _hub, _app = app_client
    assert isinstance(settings, Settings)
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "undeployed-chat",
            "type": "writer",
            "gateway_port": 18646,
            "enabled": True,
            "auto_start": False,
        },
    )
    assert create_resp.status_code == 201
    profile_id = create_resp.json()["id"]
    profile_path = settings.hermes_home_path / "profiles" / "undeployed-chat"
    if profile_path.exists():
        shutil.rmtree(profile_path)

    resolve_resp = await client.get("/api/v1/profiles/resolve", params={"ref": profile_id})
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "not_deployed"


@pytest.mark.asyncio
async def test_session_messages_from_state_db(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    import sqlite3

    from core.config import Settings

    client, _supervisor, settings, _hub, _app = app_client
    assert isinstance(settings, Settings)
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "session-db-test",
            "type": "default",
            "gateway_port": 18650,
            "enabled": True,
            "auto_start": False,
        },
    )
    assert create_resp.status_code == 201
    profile_id = create_resp.json()["id"]
    profile_path = settings.hermes_home_path / "profiles" / "session-db-test"
    profile_path.mkdir(parents=True, exist_ok=True)
    db_path = profile_path / "state.db"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            """
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT,
                timestamp INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO messages (session_id, role, content, timestamp)
            VALUES ('session_hist_1', 'user', 'hello from db', 1000),
                   ('session_hist_1', 'assistant', 'reply from db', 1001)
            """
        )
        conn.commit()
    finally:
        conn.close()

    resp = await client.get(
        f"/api/v1/profiles/{profile_id}/sessions/session_hist_1/messages",
    )
    assert resp.status_code == 200
    messages = resp.json()["messages"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "hello from db"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_session_messages_empty_without_db(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "session-msg-test",
            "type": "default",
            "gateway_port": 18647,
            "enabled": True,
            "auto_start": False,
        },
    )
    profile_id = create_resp.json()["id"]
    resp = await client.get(
        f"/api/v1/profiles/{profile_id}/sessions/session_test_1/messages",
    )
    assert resp.status_code == 200
    assert resp.json()["messages"] == []
