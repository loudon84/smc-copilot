from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

from core.errors import GatewayError, HermesClientError
from core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class GatewayHealthResult:
    """Structured Gateway health probe result (PRD v1.5).

    ``healthy`` is True only when the gateway is reachable *and* authenticated
    against a known successful API response. Auth failures (401/403) must never
    be treated as healthy.
    """

    reachable: bool
    authenticated: bool
    healthy: bool
    status_code: int | None = None
    source: str | None = None
    error_code: str | None = None
    latency_ms: float | None = None

    def __bool__(self) -> bool:
        """Allow ``if await client.health_check():`` to mean healthy."""
        return self.healthy


class HermesGatewayClient:
    """HTTP client for a local Hermes Gateway API Server.

    When ``api_key`` is set, every request includes
    ``Authorization: Bearer <api_key>``. The key must never be logged.
    Prefer constructing via ``HermesGatewayClientFactory``.
    """

    def __init__(
        self,
        port: int,
        *,
        timeout: float = 60.0,
        api_key: str | None = None,
    ) -> None:
        self._base_url = f"http://127.0.0.1:{port}"
        self._timeout = timeout
        self._api_key = (api_key or "").strip() or None

    def _url(self, path: str) -> str:
        return f"{self._base_url}{path}"

    def _auth_headers(self) -> dict[str, str]:
        if not self._api_key:
            return {}
        return {"Authorization": f"Bearer {self._api_key}"}

    async def health_check(self) -> GatewayHealthResult:
        """Probe Gateway health with structured semantics (PRD v1.5 §18–21)."""
        headers = self._auth_headers()
        started = time.monotonic()
        health_404 = False
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Primary: GET /health
            try:
                resp = await client.get(self._url("/health"), headers=headers)
                latency = (time.monotonic() - started) * 1000.0
                code = resp.status_code

                if code in (401, 403):
                    return GatewayHealthResult(
                        reachable=True,
                        authenticated=False,
                        healthy=False,
                        status_code=code,
                        source="/health",
                        error_code="GATEWAY_AUTH_FAILED",
                        latency_ms=latency,
                    )

                if code == 404:
                    health_404 = True
                elif code < 400:
                    status_ok = False
                    try:
                        data = resp.json()
                        if isinstance(data, dict) and str(data.get("status", "")).lower() == "ok":
                            status_ok = True
                        elif code == 200:
                            status_ok = True
                    except Exception:
                        status_ok = code == 200
                    if status_ok:
                        return GatewayHealthResult(
                            reachable=True,
                            authenticated=True,
                            healthy=True,
                            status_code=code,
                            source="/health",
                            error_code=None,
                            latency_ms=latency,
                        )
                    return GatewayHealthResult(
                        reachable=True,
                        authenticated=True,
                        healthy=False,
                        status_code=code,
                        source="/health",
                        error_code="GATEWAY_HEALTH_DEGRADED",
                        latency_ms=latency,
                    )
                else:
                    # 4xx (non-auth) or 5xx on /health
                    return GatewayHealthResult(
                        reachable=True,
                        authenticated=True,
                        healthy=False,
                        status_code=code,
                        source="/health",
                        error_code="GATEWAY_HEALTH_DEGRADED",
                        latency_ms=latency,
                    )
            except httpx.HTTPError:
                # Connection refused / timeout — try fallback, then unreachable
                pass

            # Fallback: GET /v1/models (strict semantics — never <500 → healthy)
            try:
                resp = await client.get(self._url("/v1/models"), headers=headers)
                latency = (time.monotonic() - started) * 1000.0
                code = resp.status_code

                if 200 <= code < 300:
                    return GatewayHealthResult(
                        reachable=True,
                        authenticated=True,
                        healthy=True,
                        status_code=code,
                        source="/v1/models",
                        error_code=None,
                        latency_ms=latency,
                    )
                if code in (401, 403):
                    return GatewayHealthResult(
                        reachable=True,
                        authenticated=False,
                        healthy=False,
                        status_code=code,
                        source="/v1/models",
                        error_code="GATEWAY_AUTH_FAILED",
                        latency_ms=latency,
                    )
                if code == 404:
                    return GatewayHealthResult(
                        reachable=True,
                        authenticated=False,
                        healthy=False,
                        status_code=code,
                        source="/v1/models",
                        error_code="GATEWAY_HEALTH_ENDPOINT_UNAVAILABLE",
                        latency_ms=latency,
                    )
                return GatewayHealthResult(
                    reachable=True,
                    authenticated=False,
                    healthy=False,
                    status_code=code,
                    source="/v1/models",
                    error_code="GATEWAY_HEALTH_DEGRADED",
                    latency_ms=latency,
                )
            except httpx.HTTPError:
                latency = (time.monotonic() - started) * 1000.0
                if health_404:
                    return GatewayHealthResult(
                        reachable=True,
                        authenticated=False,
                        healthy=False,
                        status_code=404,
                        source="/health",
                        error_code="GATEWAY_HEALTH_ENDPOINT_UNAVAILABLE",
                        latency_ms=latency,
                    )
                return GatewayHealthResult(
                    reachable=False,
                    authenticated=False,
                    healthy=False,
                    status_code=None,
                    source=None,
                    error_code="GATEWAY_UNREACHABLE",
                    latency_ms=latency,
                )

    async def list_models(self) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(self._url("/v1/models"), headers=self._auth_headers())
            if resp.status_code >= 400:
                raise HermesClientError(f"list_models failed: {resp.status_code}")
            data = resp.json()
            if isinstance(data, dict) and "data" in data:
                models = data["data"] if isinstance(data["data"], list) else []
                return models, data
            if isinstance(data, list):
                return data, None
            return [], data if isinstance(data, dict) else None

    async def create_run(
        self,
        *,
        model: str | None = None,
        input_payload: str | dict[str, Any] | list[Any] = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if model:
            body["model"] = model
        if isinstance(input_payload, str):
            body["input"] = input_payload
        else:
            body["input"] = input_payload
        if metadata:
            body["metadata"] = metadata
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(self._url("/v1/runs"), json=body, headers=self._auth_headers())
            if resp.status_code >= 400:
                raise HermesClientError(f"create_run failed: {resp.status_code}")
            data = resp.json()
            if not isinstance(data, dict):
                raise HermesClientError("create_run returned non-object response")
            return data

    async def get_run(self, run_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                self._url(f"/v1/runs/{run_id}"),
                headers=self._auth_headers(),
            )
            if resp.status_code >= 400:
                raise HermesClientError(f"get_run failed: {resp.status_code}")
            data = resp.json()
            if not isinstance(data, dict):
                raise HermesClientError("get_run returned non-object response")
            return data

    async def list_run_events(self, run_id: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                self._url(f"/v1/runs/{run_id}/events"),
                headers=self._auth_headers(),
            )
            if resp.status_code >= 400:
                raise HermesClientError(f"list_run_events failed: {resp.status_code}")
            data = resp.json()
            if isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
                return data["data"]
            if isinstance(data, list):
                return data
            return []

    async def cancel_run(self, run_id: str) -> None:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                self._url(f"/v1/runs/{run_id}/cancel"),
                headers=self._auth_headers(),
            )
            if resp.status_code >= 400 and resp.status_code != 404:
                raise HermesClientError(f"cancel_run failed: {resp.status_code}")


def extract_run_id(data: dict[str, Any]) -> str:
    for key in ("id", "run_id"):
        if key in data and data[key]:
            return str(data[key])
    raise GatewayError("Hermes run response missing id")
