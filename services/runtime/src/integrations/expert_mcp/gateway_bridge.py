from __future__ import annotations

"""Local Expert MCP bridge — binds 127.0.0.1 and forwards to remote gateway."""

from typing import Any

from integrations.expert_mcp.client import ExpertMcpClient
from integrations.expert_mcp.descriptor import DEFAULT_MANAGED_SERVER_NAME


class ExpertMcpGatewayBridge:
    """Managed MCP server facade reused by McpService registration."""

    def __init__(self, *, local_url: str | None = None) -> None:
        self._local_url = local_url or "http://127.0.0.1:48742/mcp"
        self._running = False

    @property
    def managed_server_name(self) -> str:
        return DEFAULT_MANAGED_SERVER_NAME

    @property
    def local_url(self) -> str:
        return self._local_url

    @property
    def running(self) -> bool:
        return self._running

    def start(self) -> None:
        # Bridge HTTP server is started by ExpertMcpGatewayService when connect succeeds.
        self._running = True

    def stop(self) -> None:
        self._running = False

    def managed_server_payload(self) -> dict[str, Any]:
        return {
            "name": DEFAULT_MANAGED_SERVER_NAME,
            "transport": "streamable_http",
            "url": self._local_url,
            "managed": True,
            "enabled": True,
        }

    async def forward_tools_list(self, client: ExpertMcpClient) -> list[dict[str, Any]]:
        return await client.tools_list()
