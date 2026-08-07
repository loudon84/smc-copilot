"""Tests for Gateway internal Bearer auth (FR-01)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from integrations.hermes.client import HermesGatewayClient


# @lat: [[tests#Gateway Auth#Client adds Bearer token]]
@pytest.mark.asyncio
async def test_gateway_client_adds_bearer_token():
    client = HermesGatewayClient(8642, api_key="secret-key-value")
    assert client._auth_headers() == {"Authorization": "Bearer secret-key-value"}

    captured: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["authorization"] = request.headers.get("authorization")
        return httpx.Response(200, json={"data": [{"id": "m1"}]})

    transport = httpx.MockTransport(handler)
    real = httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8642")

    class _Factory:
        def __call__(self, *args, **kwargs):
            return self

        async def __aenter__(self):
            return real

        async def __aexit__(self, *args):
            await real.aclose()

    with patch("httpx.AsyncClient", new=_Factory()):
        models, _ = await client.list_models()
    assert models[0]["id"] == "m1"
    assert captured["authorization"] == "Bearer secret-key-value"


# @lat: [[tests#Gateway Auth#Chat stream adds Bearer token]]
@pytest.mark.asyncio
async def test_chat_stream_adds_bearer_token():
    from services.gateway_credential_service import GatewayCredentialService

    svc = GatewayCredentialService(MagicMock(), MagicMock())
    with patch.object(svc, "resolve_api_server_key", new=AsyncMock(return_value="stream-key")):
        key = await svc.resolve_api_server_key("default")
        assert key == "stream-key"
        headers = {"Authorization": f"Bearer {key}"}
        assert headers["Authorization"] == "Bearer stream-key"


# @lat: [[tests#Gateway Auth#Client omits auth when no key]]
@pytest.mark.asyncio
async def test_gateway_client_omits_auth_when_no_key():
    client = HermesGatewayClient(8642)
    assert client._auth_headers() == {}

    captured: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["authorization"] = request.headers.get("authorization")
        return httpx.Response(200, json={"data": []})

    transport = httpx.MockTransport(handler)
    real = httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8642")

    class _Factory:
        def __call__(self, *args, **kwargs):
            return self

        async def __aenter__(self):
            return real

        async def __aexit__(self, *args):
            await real.aclose()

    with patch("httpx.AsyncClient", new=_Factory()):
        await client.list_models()
    assert captured["authorization"] is None
