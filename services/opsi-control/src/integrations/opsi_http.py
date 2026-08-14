from __future__ import annotations

from typing import Any

import httpx

from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from core.logging import safe_log_fields
from integrations.opsi_jsonrpc import ALLOWED_METHODS
from integrations.secret_provider import SecretProvider


class HttpOpsiJsonRpc:
    def __init__(
        self, settings: Settings, secrets: SecretProvider | None = None, client: httpx.AsyncClient | None = None
    ) -> None:
        if not settings.opsi_rpc_url.startswith("https://"):
            raise ValueError("opsi rpc url must be https")
        self.settings = settings
        self.secrets = secrets
        self._id = 0
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.opsi_rpc_timeout_seconds),
            verify=True,
            limits=httpx.Limits(max_connections=16, max_keepalive_connections=8),
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def ready(self) -> bool:
        try:
            await self.call("backend_info")
            return True
        except Exception:
            return False

    async def _password(self) -> str:
        if self.settings.opsi_rpc_password_ref and self.secrets is not None:
            return await self.secrets.get(self.settings.opsi_rpc_password_ref)
        return self.settings.opsi_rpc_password

    async def call(self, method: str, *params: Any) -> Any:
        if method not in ALLOWED_METHODS:
            raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, f"rpc not allowed: {method}", status_code=400)
        self._id += 1
        payload = {"jsonrpc": "2.0", "id": self._id, "method": method, "params": list(params)}
        auth = None
        if self.settings.opsi_rpc_username:
            auth = (self.settings.opsi_rpc_username, await self._password())
        try:
            response = await self._client.post(self.settings.opsi_rpc_url, json=payload, auth=auth)
        except httpx.TimeoutException as exc:
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc timeout", status_code=503) from exc
        except Exception as exc:
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc unavailable", status_code=503) from exc
        if len(response.content) > self.settings.opsi_rpc_max_bytes:
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc response too large", status_code=502)
        if response.status_code >= 400:
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc http error", status_code=503)
        body = response.json()
        if body.get("error"):
            safe_log_fields({"rpc": method})
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc error", status_code=502)
        return body.get("result")
