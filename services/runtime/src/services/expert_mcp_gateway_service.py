from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance
from integrations.expert_mcp.auth_provider import ExpertMcpAuthProvider
from integrations.expert_mcp.client import ExpertMcpClient
from integrations.expert_mcp.descriptor import DEFAULT_MANAGED_SERVER_NAME, ExpertMcpDescriptor
from integrations.expert_mcp.diagnostics import build_diagnostics
from integrations.expert_mcp.errors import ExpertMcpError
from integrations.expert_mcp.gateway_bridge import ExpertMcpGatewayBridge
from integrations.expert_mcp.tool_cache import ExpertMcpToolCache
from schemas.runtime import McpServerCreateRequest
from services.mcp_service import McpService

_tool_cache = ExpertMcpToolCache()
_last_error: str | None = None


class ExpertMcpGatewayService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._descriptor = ExpertMcpDescriptor(settings)
        self._auth = ExpertMcpAuthProvider(settings, session)
        self._bridge = ExpertMcpGatewayBridge()

    def _config(self) -> dict[str, Any]:
        return self._descriptor.load()

    async def status(self) -> dict[str, Any]:
        cfg = self._config()
        auth_ok = self._auth.authorization_configured()
        endpoint = str(cfg.get("endpoint") or "")
        tool_count = int(cfg.get("toolCount") or _tool_cache.count or 0)
        enabled = bool(cfg.get("enabled"))
        if enabled and auth_ok and endpoint:
            status = "connected"
            ready = True
        elif endpoint and auth_ok:
            status = "configured"
            ready = False
        elif endpoint:
            status = "unauthorized"
            ready = False
        else:
            status = "not_configured"
            ready = False

        enabled_instances = 0
        result = await self._session.execute(select(HermesInstance))
        for inst in result.scalars().all():
            try:
                servers = await McpService(self._settings, self._session).list(inst.id)
                if any(s.name == DEFAULT_MANAGED_SERVER_NAME for s in servers):
                    enabled_instances += 1
            except Exception:
                continue

        return {
            "ready": ready,
            "status": status,
            "endpoint": endpoint,
            "authorizationConfigured": auth_ok,
            "toolCount": tool_count,
            "lastSyncAt": cfg.get("lastSyncAt"),
            "enabledInstances": enabled_instances,
            "managedServerName": DEFAULT_MANAGED_SERVER_NAME,
            "lastError": _last_error,
        }

    async def get_config(self) -> dict[str, Any]:
        cfg = self._config()
        return {
            "endpoint": cfg.get("endpoint") or "",
            "enabled": bool(cfg.get("enabled")),
            "managedServerName": DEFAULT_MANAGED_SERVER_NAME,
            "authorizationConfigured": self._auth.authorization_configured(),
        }

    async def patch_config(self, body: dict[str, Any]) -> dict[str, Any]:
        cfg = self._config()
        if "endpoint" in body and body["endpoint"] is not None:
            cfg["endpoint"] = str(body["endpoint"]).strip()
        if "enabled" in body and body["enabled"] is not None:
            cfg["enabled"] = bool(body["enabled"])
        if "accessToken" in body and body["accessToken"]:
            await self._auth.put_token(str(body["accessToken"]))
        self._descriptor.save(cfg)
        return await self.get_config()

    def _client(self) -> ExpertMcpClient:
        cfg = self._config()
        return ExpertMcpClient(
            endpoint=str(cfg.get("endpoint") or ""),
            auth_headers=self._auth.auth_headers(),
        )

    async def connect(self) -> dict[str, Any]:
        global _last_error
        cfg = self._config()
        if not cfg.get("endpoint"):
            raise ExpertMcpError("Expert MCP endpoint not configured", code="expert_mcp_not_configured")
        if not self._auth.authorization_configured():
            raise ExpertMcpError("Expert MCP access token not configured", code="expert_mcp_unauthorized")
        try:
            tools = await self._client().tools_list()
            _tool_cache.set(tools)
            cfg["enabled"] = True
            cfg["toolCount"] = len(tools)
            cfg["lastSyncAt"] = datetime.now(UTC).isoformat()
            self._descriptor.save(cfg)
            self._bridge.start()
            _last_error = None
        except ExpertMcpError as exc:
            _last_error = str(exc)
            raise
        return await self.status()

    async def reconnect(self) -> dict[str, Any]:
        _tool_cache.clear()
        return await self.connect()

    async def test(self) -> dict[str, Any]:
        global _last_error
        try:
            result = await self._client().tools_list()
            _last_error = None
            return {"ok": True, "toolCount": len(result)}
        except ExpertMcpError as exc:
            _last_error = str(exc)
            return {"ok": False, "error": str(exc), "code": exc.code}

    async def list_tools(self, *, refresh: bool = False) -> list[dict[str, Any]]:
        cached = None if refresh else _tool_cache.get()
        if cached is not None:
            return cached
        tools = await self._client().tools_list()
        _tool_cache.set(tools)
        cfg = self._config()
        cfg["toolCount"] = len(tools)
        cfg["lastSyncAt"] = datetime.now(UTC).isoformat()
        self._descriptor.save(cfg)
        return tools

    async def diagnostics(self) -> dict[str, Any]:
        st = await self.status()
        return build_diagnostics(
            status=str(st["status"]),
            endpoint=str(st.get("endpoint") or ""),
            auth_configured=bool(st.get("authorizationConfigured")),
            tool_count=int(st.get("toolCount") or 0),
            last_error=_last_error,
        )

    async def logs(self, *, tail: int = 200) -> list[str]:
        # Structured logs live under Runtime layout; return diagnostic summary lines for now.
        diag = await self.diagnostics()
        lines = [
            f"status={diag.get('status')}",
            f"endpoint={diag.get('endpoint')}",
            f"tools={diag.get('toolCount')}",
            f"auth={diag.get('authorizationConfigured')}",
        ]
        if diag.get("lastError"):
            lines.append(f"lastError={diag['lastError']}")
        return lines[-tail:]

    async def enable_for_instance(self, instance_id: str) -> dict[str, Any]:
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        mcp = McpService(self._settings, self._session)
        existing = await mcp.list(instance_id)
        if any(s.name == DEFAULT_MANAGED_SERVER_NAME for s in existing):
            return {"status": "enabled", "instanceId": instance_id, "server": DEFAULT_MANAGED_SERVER_NAME}
        payload = self._bridge.managed_server_payload()
        await mcp.create(
            instance_id,
            McpServerCreateRequest(
                name=payload["name"],
                transport=payload["transport"],
                url=payload["url"],
                enabled=True,
            ),
        )
        return {"status": "enabled", "instanceId": instance_id, "server": payload["name"]}

    async def disable_for_instance(self, instance_id: str) -> dict[str, Any]:
        mcp = McpService(self._settings, self._session)
        servers = await mcp.list(instance_id)
        for server in servers:
            if server.name == DEFAULT_MANAGED_SERVER_NAME:
                await mcp.delete(instance_id, server.id)
        return {"status": "disabled", "instanceId": instance_id}
