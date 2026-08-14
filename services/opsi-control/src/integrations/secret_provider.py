from __future__ import annotations

import os
from typing import Protocol

import httpx

from core.errors import ErrorCode, OpsiControlError


class SecretProvider(Protocol):
    async def get(self, name: str) -> str: ...

    async def ready(self) -> bool: ...


class EnvSecretProvider:
    """Resolves secret references from process environment. Lab/test only."""

    async def get(self, name: str) -> str:
        value = os.environ.get(name, "")
        if not value:
            raise OpsiControlError(ErrorCode.INTERNAL_ERROR, f"secret {name} missing", status_code=500)
        return value

    async def ready(self) -> bool:
        return True


class HttpSecretProvider:
    """Production adapter: GET {base}/{name} with timeout. Never logs secret values."""

    def __init__(self, base_url: str, token: str = "", timeout: float = 5.0) -> None:
        if not base_url.startswith("https://"):
            raise ValueError("secret provider must be https")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._client = httpx.AsyncClient(timeout=timeout, verify=True)

    async def get(self, name: str) -> str:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        try:
            response = await self._client.get(f"{self.base_url}/{name}", headers=headers)
        except Exception as exc:
            raise OpsiControlError(ErrorCode.INTERNAL_ERROR, "secret provider unavailable", status_code=503) from exc
        if response.status_code >= 400:
            raise OpsiControlError(ErrorCode.INTERNAL_ERROR, "secret provider error", status_code=503)
        body = response.json()
        value = str(body.get("value") or "")
        if not value:
            raise OpsiControlError(ErrorCode.INTERNAL_ERROR, "secret empty", status_code=500)
        return value

    async def ready(self) -> bool:
        try:
            response = await self._client.get(f"{self.base_url}/health")
            return response.status_code < 400
        except Exception:
            return False

    async def aclose(self) -> None:
        await self._client.aclose()
