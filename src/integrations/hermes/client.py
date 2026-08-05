from __future__ import annotations

from typing import Any

import httpx

from core.errors import GatewayError, HermesClientError
from core.logging import get_logger

logger = get_logger(__name__)


class HermesGatewayClient:
    def __init__(self, port: int, *, timeout: float = 60.0) -> None:
        self._base_url = f"http://127.0.0.1:{port}"
        self._timeout = timeout

    def _url(self, path: str) -> str:
        return f"{self._base_url}{path}"

    async def health_check(self) -> bool:
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                resp = await client.get(self._url("/health"))
                if resp.status_code < 400:
                    try:
                        data = resp.json()
                        if isinstance(data, dict) and str(data.get("status", "")).lower() == "ok":
                            return True
                        # Tolerate gateways that return non-JSON ok body but 200
                        if resp.status_code == 200:
                            return True
                    except Exception:
                        if resp.status_code == 200:
                            return True
            except httpx.HTTPError:
                pass
            # Fallback for mocks / older gateways
            try:
                resp = await client.get(self._url("/v1/models"))
                if resp.status_code < 500:
                    return True
            except httpx.HTTPError:
                pass
        return False

    async def list_models(self) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(self._url("/v1/models"))
            if resp.status_code >= 400:
                raise HermesClientError(f"list_models failed: {resp.status_code} {resp.text}")
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
            resp = await client.post(self._url("/v1/runs"), json=body)
            if resp.status_code >= 400:
                raise HermesClientError(f"create_run failed: {resp.status_code} {resp.text}")
            data = resp.json()
            if not isinstance(data, dict):
                raise HermesClientError("create_run returned non-object response")
            return data

    async def get_run(self, run_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(self._url(f"/v1/runs/{run_id}"))
            if resp.status_code >= 400:
                raise HermesClientError(f"get_run failed: {resp.status_code} {resp.text}")
            data = resp.json()
            if not isinstance(data, dict):
                raise HermesClientError("get_run returned non-object response")
            return data

    async def list_run_events(self, run_id: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(self._url(f"/v1/runs/{run_id}/events"))
            if resp.status_code >= 400:
                raise HermesClientError(f"list_run_events failed: {resp.status_code} {resp.text}")
            data = resp.json()
            if isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
                return data["data"]
            if isinstance(data, list):
                return data
            return []

    async def cancel_run(self, run_id: str) -> None:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(self._url(f"/v1/runs/{run_id}/cancel"))
            if resp.status_code >= 400 and resp.status_code != 404:
                raise HermesClientError(f"cancel_run failed: {resp.status_code} {resp.text}")


def extract_run_id(data: dict[str, Any]) -> str:
    for key in ("id", "run_id"):
        if key in data and data[key]:
            return str(data[key])
    raise GatewayError("Hermes run response missing id")
