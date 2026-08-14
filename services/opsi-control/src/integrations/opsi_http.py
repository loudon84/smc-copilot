from __future__ import annotations

from typing import Any

import httpx

from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from core.logging import safe_log_fields
from integrations.opsi_jsonrpc import ALLOWED_METHODS


class HttpOpsiJsonRpc:
    def __init__(self, settings: Settings) -> None:
        if not settings.opsi_rpc_url.startswith("https://"):
            raise ValueError("opsi rpc url must be https")
        self.settings = settings
        self._id = 0

    async def ready(self) -> bool:
        try:
            await self.call("backend_info")
            return True
        except Exception:
            return False

    async def call(self, method: str, *params: Any) -> Any:
        if method not in ALLOWED_METHODS:
            raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, f"rpc not allowed: {method}", status_code=400)
        self._id += 1
        payload = {"jsonrpc": "2.0", "id": self._id, "method": method, "params": list(params)}
        auth = None
        if self.settings.opsi_rpc_username:
            auth = (self.settings.opsi_rpc_username, self.settings.opsi_rpc_password)
        try:
            async with httpx.AsyncClient(timeout=self.settings.opsi_rpc_timeout_seconds, verify=True) as client:
                response = await client.post(self.settings.opsi_rpc_url, json=payload, auth=auth)
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
