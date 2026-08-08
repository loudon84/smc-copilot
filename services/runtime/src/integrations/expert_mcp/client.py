from __future__ import annotations

import json
import time
from typing import Any

from integrations.expert_mcp.errors import ExpertMcpError

# Preserve Desktop proxy protections (PRD §48)
MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
DEFAULT_TIMEOUT_SEC = 30.0


class ExpertMcpClient:
    """HTTPS JSON-RPC client for remote Expert MCP Gateway."""

    def __init__(
        self,
        *,
        endpoint: str,
        auth_headers: dict[str, str] | None = None,
        timeout_sec: float = DEFAULT_TIMEOUT_SEC,
    ) -> None:
        self._endpoint = (endpoint or "").rstrip("/")
        self._headers = dict(auth_headers or {})
        self._timeout = timeout_sec

    async def tools_list(self) -> list[dict[str, Any]]:
        result = await self._rpc("tools/list", {})
        tools = result.get("tools") if isinstance(result, dict) else None
        return list(tools) if isinstance(tools, list) else []

    async def ping(self) -> dict[str, Any]:
        return await self._rpc("ping", {})

    async def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if not self._endpoint:
            raise ExpertMcpError("Expert MCP endpoint not configured", code="expert_mcp_not_configured")
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        body = json.dumps(payload).encode("utf-8")
        if len(body) > MAX_REQUEST_BODY_BYTES:
            raise ExpertMcpError("Request body exceeds 2MB limit", code="expert_mcp_payload_too_large")

        try:
            import httpx
        except ImportError as exc:
            raise ExpertMcpError("httpx is required for Expert MCP", code="expert_mcp_dependency") from exc

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            **self._headers,
        }
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._endpoint, content=body, headers=headers)
        except Exception as exc:
            raise ExpertMcpError(f"Expert MCP request failed: {exc}", code="expert_mcp_network") from exc

        elapsed_ms = int((time.monotonic() - started) * 1000)
        if resp.status_code == 401:
            raise ExpertMcpError("Expert MCP unauthorized", code="expert_mcp_unauthorized")
        if resp.status_code >= 400:
            raise ExpertMcpError(
                f"Expert MCP HTTP {resp.status_code}",
                code="expert_mcp_http_error",
            )
        try:
            data = resp.json()
        except Exception as exc:
            raise ExpertMcpError("Invalid Expert MCP JSON response", code="expert_mcp_invalid_response") from exc

        if isinstance(data, dict) and data.get("error"):
            err = data["error"]
            message = err.get("message") if isinstance(err, dict) else str(err)
            raise ExpertMcpError(str(message or "Expert MCP RPC error"), code="expert_mcp_rpc_error")

        result = data.get("result") if isinstance(data, dict) else {}
        if not isinstance(result, dict):
            result = {"value": result, "elapsedMs": elapsed_ms}
        return result
