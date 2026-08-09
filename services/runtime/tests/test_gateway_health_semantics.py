"""Gateway health semantics tests (PRD v1.5 §78)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from integrations.hermes.client import GatewayHealthResult, HermesGatewayClient


def _mock_response(status_code: int, json_data: object | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    if json_data is None:
        resp.json.side_effect = Exception("no json")
    else:
        resp.json.return_value = json_data
    return resp


@pytest.mark.asyncio
async def test_health_200_ok() -> None:
    # @lat: [[tests#Gateway health semantics#Health 200]]
    # With api_key, /health liveness must be followed by authenticated /v1/models (PRD v1.5.3).
    client = HermesGatewayClient(8642, api_key="test-key")
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(
        side_effect=[
            _mock_response(200, {"status": "ok"}),
            _mock_response(200, {"data": []}),
        ]
    )
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert isinstance(result, GatewayHealthResult)
    assert result.reachable is True
    assert result.authenticated is True
    assert result.healthy is True
    assert result.status_code == 200
    assert result.source == "/v1/models"
    assert result.error_code is None
    assert bool(result) is True


@pytest.mark.asyncio
async def test_health_200_without_key_skips_auth_probe() -> None:
    client = HermesGatewayClient(8642)
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(return_value=_mock_response(200, {"status": "ok"}))
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert result.healthy is True
    assert result.source == "/health"
    assert mock_http.get.await_count == 1


@pytest.mark.asyncio
async def test_health_200_then_models_401_auth_failed() -> None:
    # @lat: [[tests#Gateway health semantics#Health then models 401]]
    client = HermesGatewayClient(8642, api_key="wrong-key")
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(
        side_effect=[
            _mock_response(200, {"status": "ok"}),
            _mock_response(401),
        ]
    )
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert result.reachable is True
    assert result.authenticated is False
    assert result.healthy is False
    assert result.error_code == "GATEWAY_AUTH_FAILED"
    assert result.source == "/v1/models"


@pytest.mark.asyncio
async def test_health_401_unauthorized() -> None:
    # @lat: [[tests#Gateway health semantics#Health 401]]
    client = HermesGatewayClient(8642, api_key="bad-key")
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(return_value=_mock_response(401))
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert result.reachable is True
    assert result.authenticated is False
    assert result.healthy is False
    assert result.error_code == "GATEWAY_AUTH_FAILED"
    assert bool(result) is False


@pytest.mark.asyncio
async def test_health_403_unauthorized() -> None:
    client = HermesGatewayClient(8642, api_key="bad-key")
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(return_value=_mock_response(403))
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert result.reachable is True
    assert result.authenticated is False
    assert result.healthy is False
    assert result.error_code == "GATEWAY_AUTH_FAILED"


@pytest.mark.asyncio
async def test_fallback_401_not_healthy() -> None:
    # @lat: [[tests#Gateway health semantics#Fallback 401]]
    client = HermesGatewayClient(8642, api_key="bad-key")
    # /health → 404, /v1/models → 401
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(
        side_effect=[
            _mock_response(404),
            _mock_response(401),
        ]
    )
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert result.reachable is True
    assert result.authenticated is False
    assert result.healthy is False
    assert result.error_code == "GATEWAY_AUTH_FAILED"
    assert result.source == "/v1/models"


@pytest.mark.asyncio
async def test_health_404_then_models_2xx() -> None:
    client = HermesGatewayClient(8642, api_key="key")
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(
        side_effect=[
            _mock_response(404),
            _mock_response(200, {"data": []}),
        ]
    )
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert result.healthy is True
    assert result.authenticated is True
    assert result.source == "/v1/models"


@pytest.mark.asyncio
async def test_connection_refused_unreachable() -> None:
    client = HermesGatewayClient(8642, api_key="key")
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)

    with patch("integrations.hermes.client.httpx.AsyncClient", return_value=mock_http):
        result = await client.health_check()

    assert result.reachable is False
    assert result.authenticated is False
    assert result.healthy is False
    assert result.error_code == "GATEWAY_UNREACHABLE"
