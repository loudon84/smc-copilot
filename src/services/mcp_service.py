from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from runtime.executable_policy import ExecutablePolicy
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import McpServerCreateRequest, McpServerResponse


class HermesMcpAdapter:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        layout.ensure()
        self._store = layout.root / "mcp_servers.json"

    def _load(self) -> dict[str, list[dict[str, Any]]]:
        if not self._store.exists():
            return {}
        try:
            data = json.loads(self._store.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save(self, data: dict[str, list[dict[str, Any]]]) -> None:
        self._store.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def list_servers(self, instance_id: str) -> list[dict[str, Any]]:
        return list(self._load().get(instance_id, []))

    def save_servers(self, instance_id: str, servers: list[dict[str, Any]]) -> None:
        data = self._load()
        data[instance_id] = servers
        self._save(data)


class McpService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._adapter = HermesMcpAdapter(settings)
        self._policy = ExecutablePolicy()

    def _to_response(self, row: dict[str, Any]) -> McpServerResponse:
        return McpServerResponse(
            id=row["id"],
            name=row["name"],
            transport=row.get("transport", "stdio"),
            command=row.get("command"),
            args=list(row.get("args") or []),
            url=row.get("url"),
            enabled=bool(row.get("enabled", True)),
            secretConfigured=bool(row.get("secretConfigured", False)),
            status=row.get("status", "unknown"),
            lastTestAt=datetime.fromisoformat(row["lastTestAt"]) if row.get("lastTestAt") else None,
            lastError=row.get("lastError"),
        )

    def list(self, instance_id: str) -> list[McpServerResponse]:
        return [self._to_response(r) for r in self._adapter.list_servers(instance_id)]

    def get(self, instance_id: str, server_id: str) -> McpServerResponse:
        for row in self._adapter.list_servers(instance_id):
            if row["id"] == server_id:
                return self._to_response(row)
        raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")

    def create(self, instance_id: str, body: McpServerCreateRequest) -> McpServerResponse:
        if body.transport == "stdio":
            self._policy.validate_command(body.command, body.args)
        servers = self._adapter.list_servers(instance_id)
        if any(s["name"] == body.name for s in servers):
            raise RuntimeServiceError(f"MCP server name exists: {body.name}", code="conflict")
        row = {
            "id": str(uuid.uuid4()),
            "name": body.name,
            "transport": body.transport,
            "command": body.command,
            "args": body.args,
            "url": body.url,
            "enabled": body.enabled,
            "secretConfigured": False,
            "status": "unknown",
            "lastTestAt": None,
            "lastError": None,
        }
        servers.append(row)
        self._adapter.save_servers(instance_id, servers)
        return self._to_response(row)

    def update(self, instance_id: str, server_id: str, body: McpServerCreateRequest) -> McpServerResponse:
        if body.transport == "stdio":
            self._policy.validate_command(body.command, body.args)
        servers = self._adapter.list_servers(instance_id)
        for i, row in enumerate(servers):
            if row["id"] == server_id:
                servers[i] = {
                    **row,
                    "name": body.name,
                    "transport": body.transport,
                    "command": body.command,
                    "args": body.args,
                    "url": body.url,
                    "enabled": body.enabled,
                }
                self._adapter.save_servers(instance_id, servers)
                return self._to_response(servers[i])
        raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")

    def delete(self, instance_id: str, server_id: str) -> None:
        servers = self._adapter.list_servers(instance_id)
        new_servers = [s for s in servers if s["id"] != server_id]
        if len(new_servers) == len(servers):
            raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")
        self._adapter.save_servers(instance_id, new_servers)

    def set_enabled(self, instance_id: str, server_id: str, enabled: bool) -> McpServerResponse:
        servers = self._adapter.list_servers(instance_id)
        for i, row in enumerate(servers):
            if row["id"] == server_id:
                servers[i] = {**row, "enabled": enabled}
                self._adapter.save_servers(instance_id, servers)
                return self._to_response(servers[i])
        raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")

    async def test(self, instance_id: str, server_id: str, *, timeout: float = 10.0) -> McpServerResponse:
        servers = self._adapter.list_servers(instance_id)
        target = None
        idx = -1
        for i, row in enumerate(servers):
            if row["id"] == server_id:
                target = row
                idx = i
                break
        if target is None:
            raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")

        last_error = None
        status = "healthy"
        if target.get("transport") == "stdio":
            command = target.get("command")
            args = list(target.get("args") or [])
            self._policy.validate_command(command, args)
            try:
                proc = await asyncio.create_subprocess_exec(
                    str(command),
                    *args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                try:
                    await asyncio.wait_for(proc.communicate(), timeout=timeout)
                except TimeoutError:
                    proc.kill()
                    await proc.wait()
                    status = "unhealthy"
                    last_error = "MCP test timed out"
                else:
                    if (proc.returncode or 0) != 0:
                        status = "unhealthy"
                        last_error = f"exit code {proc.returncode}"
            except FileNotFoundError:
                status = "unhealthy"
                last_error = f"command not found: {command}"
            except Exception as exc:
                status = "unhealthy"
                last_error = str(exc)
        else:
            # URL transports: mark as unknown without network probe in this phase
            status = "unknown"

        servers[idx] = {
            **target,
            "status": status,
            "lastTestAt": datetime.now(timezone.utc).isoformat(),
            "lastError": last_error,
        }
        self._adapter.save_servers(instance_id, servers)
        return self._to_response(servers[idx])
