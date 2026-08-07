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
async def test_upload_text_attachment(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "attach-text-test",
            "type": "default",
            "gateway_port": 18648,
            "enabled": True,
            "auto_start": False,
        },
    )
    assert create_resp.status_code == 201
    profile_id = create_resp.json()["id"]

    files = {"files": ("notes.md", b"# hello attachment", "text/markdown")}
    data = {
        "profile_id": profile_id,
        "session_id": "session_att_1",
    }
    upload_resp = await client.post(
        f"/api/v1/workspaces/{profile_id}/attachments",
        data=data,
        files=files,
    )
    assert upload_resp.status_code == 200, upload_resp.text
    body = upload_resp.json()
    assert len(body["attachments"]) == 1
    assert body["attachments"][0]["text_preview"]


@pytest.mark.asyncio
async def test_upload_oversized_attachment(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "attach-big-test",
            "type": "default",
            "gateway_port": 18649,
            "enabled": True,
            "auto_start": False,
        },
    )
    profile_id = create_resp.json()["id"]
    big = b"x" * (26 * 1024 * 1024)
    files = {"files": ("big.bin", big, "application/octet-stream")}
    data = {"profile_id": profile_id, "session_id": "session_big"}
    upload_resp = await client.post(
        f"/api/v1/workspaces/{profile_id}/attachments",
        data=data,
        files=files,
    )
    assert upload_resp.status_code == 400
    assert upload_resp.json()["error"]["code"] == "ATTACHMENT_TOO_LARGE"


@pytest.mark.asyncio
async def test_attachment_scope_mismatch_on_chat(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, supervisor, _settings, _hub, _app = app_client
    port = 18650
    supervisor.set_mock_gateway_command(_mock_cmd(port))

    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "attach-scope-test",
            "type": "default",
            "gateway_port": port,
            "enabled": True,
            "auto_start": False,
        },
    )
    profile_id = create_resp.json()["id"]
    await client.post(f"/api/v1/profiles/{profile_id}/start")

    upload_resp = await client.post(
        f"/api/v1/workspaces/{profile_id}/attachments",
        data={"profile_id": profile_id, "session_id": "session_a"},
        files={"files": ("a.txt", b"hello", "text/plain")},
    )
    att_id = upload_resp.json()["attachments"][0]["id"]

    async with client.stream(
        "POST",
        f"/api/v1/profiles/{profile_id}/chat/completions",
        json={
            "workspace_id": profile_id,
            "session_id": "session_b",
            "messages": [{"role": "user", "content": "hi"}],
            "attachments": [att_id],
            "stream": True,
        },
    ) as stream_resp:
        body = ""
        async for chunk in stream_resp.aiter_text():
            body += chunk
        assert "chat.error" in body
        assert "ATTACHMENT_SCOPE_MISMATCH" in body
