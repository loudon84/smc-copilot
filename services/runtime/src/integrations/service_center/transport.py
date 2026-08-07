"""Shared httpx transport for Service Center (PRD v1.6 FR-102)."""

from __future__ import annotations

from typing import Any

import httpx

from core.logging import get_logger
from integrations.service_center.circuit_breaker import CircuitBreaker, CircuitOpenError
from integrations.service_center.retry_policy import RetryPolicy, execute_with_retry

logger = get_logger(__name__)

_shared: ServiceCenterTransport | None = None


class ServiceCenterTransport:
    """One pooled AsyncClient per process — do not create per-request clients."""

    def __init__(
        self,
        *,
        timeout: httpx.Timeout | None = None,
        max_connections: int = 20,
        max_keepalive: int = 10,
        max_response_bytes: int = 2_000_000,
        retry_policy: RetryPolicy | None = None,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        self._timeout = timeout or httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=10.0)
        self._limits = httpx.Limits(max_connections=max_connections, max_keepalive_connections=max_keepalive)
        self._max_response_bytes = max_response_bytes
        self._retry = retry_policy or RetryPolicy()
        self._breaker = circuit_breaker or CircuitBreaker()
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                limits=self._limits,
                follow_redirects=False,
            )
            logger.info("service_center_transport_started")

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            logger.info("service_center_transport_closed")

    @property
    def circuit_breaker(self) -> CircuitBreaker:
        return self._breaker

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("ServiceCenterTransport not started")
        return self._client

    async def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        idempotent: bool = True,
        idempotency_key: str | None = None,
        **kwargs: Any,
    ) -> httpx.Response:
        await self.start()
        host = httpx.URL(url).host or ""

        async def _once() -> httpx.Response:
            self._breaker.before_call(host)
            try:
                resp = await self.client.request(method, url, headers=headers, **kwargs)
                if len(resp.content) > self._max_response_bytes:
                    raise httpx.HTTPError("response too large")
                if resp.status_code >= 500 or resp.status_code in {408, 425, 429}:
                    self._breaker.record_failure(host, error=f"http_{resp.status_code}")
                else:
                    self._breaker.record_success(host)
                return resp
            except CircuitOpenError:
                raise
            except Exception as exc:
                self._breaker.record_failure(host, error=str(exc))
                raise

        return await execute_with_retry(
            _once,
            policy=self._retry,
            idempotent=idempotent,
            idempotency_key=idempotency_key,
        )


def get_shared_transport() -> ServiceCenterTransport:
    global _shared
    if _shared is None:
        _shared = ServiceCenterTransport()
    return _shared


async def close_shared_transport() -> None:
    global _shared
    if _shared is not None:
        await _shared.aclose()
        _shared = None
