# @lat: [[runtime-service#MCP 配置编译]]
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, McpServer, McpTestResult
from db.repositories.mcp_repo import McpServerRepository
from db.repositories.runtime_repo import RuntimeVersionRepository
from runtime.executable_policy import ExecutablePolicy
from runtime.mcp_config_compiler import (
    MCP_STATUS_DISABLED,
    MCP_STATUS_DRAFT,
    MCP_STATUS_ERROR,
    MCP_STATUS_READY,
    MCP_STATUS_VALIDATING,
    McpConfigCompiler,
)
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import McpServerCreateRequest, McpServerResponse


class McpJsonCache:
    """Optional JSON export/cache for MCP servers (compat with pre-v1.4 file layout)."""

    def __init__(self, settings: Settings) -> None:
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

    def save_servers(self, instance_id: str, servers: list[dict[str, Any]]) -> None:
        data = self._load()
        data[instance_id] = servers
        self._store.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def list_servers(self, instance_id: str) -> list[dict[str, Any]]:
        return list(self._load().get(instance_id, []))


class McpService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._repo = McpServerRepository(session)
        self._compiler = McpConfigCompiler(settings)
        self._cache = McpJsonCache(settings)
        self._policy = ExecutablePolicy()
        self._imported_instances: set[str] = set()

    async def _instance(self, instance_id: str) -> HermesInstance:
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        return inst

    async def _hermes_executable(self) -> Path | None:
        active = await RuntimeVersionRepository(self._session).get_active()
        if active is None or not active.executable_path:
            return None
        path = Path(active.executable_path)
        return path if path.exists() else None

    async def _maybe_import_json(self, instance_id: str) -> None:
        if instance_id in self._imported_instances:
            return
        self._imported_instances.add(instance_id)
        if await self._repo.count_by_instance(instance_id) > 0:
            return
        legacy_rows = self._cache.list_servers(instance_id)
        if not legacy_rows:
            return
        for row in legacy_rows:
            server = McpServer(
                id=row.get("id") or str(uuid.uuid4()),
                instance_id=instance_id,
                name=row["name"],
                transport=row.get("transport", "stdio"),
                command=row.get("command"),
                args_json=McpServerRepository.args_to_json(list(row.get("args") or [])),
                url=row.get("url"),
                enabled=bool(row.get("enabled", True)),
                status=row.get("status", MCP_STATUS_DRAFT),
            )
            await self._repo.add(server)
        await self._session.flush()

    async def _secret_refs_map(self, servers: list[McpServer]) -> dict[str, list]:
        refs: dict[str, list] = {}
        for server in servers:
            refs[server.id] = await self._repo.resolve_secret_refs(server.id)
        return refs

    async def _compile_instance(self, instance_id: str) -> None:
        inst = await self._instance(instance_id)
        servers = await self._repo.list_by_instance(instance_id)
        for server in servers:
            if server.enabled:
                server.status = MCP_STATUS_VALIDATING
            else:
                server.status = MCP_STATUS_DISABLED
        await self._session.flush()

        try:
            refs_map = await self._secret_refs_map(servers)
            await self._compiler.compile_and_write(
                inst.profile_name,
                servers,
                secret_refs_by_server=refs_map,
                executable=await self._hermes_executable(),
            )
            for server in servers:
                if server.enabled:
                    server.status = MCP_STATUS_READY
                else:
                    server.status = MCP_STATUS_DISABLED
        except RuntimeServiceError as exc:
            for server in servers:
                if server.enabled:
                    server.status = MCP_STATUS_ERROR
            await self._session.flush()
            raise exc
        except Exception as exc:
            for server in servers:
                if server.enabled:
                    server.status = MCP_STATUS_ERROR
            await self._session.flush()
            raise RuntimeServiceError(
                f"MCP compile failed: {exc}",
                code="mcp_compile_failed",
            ) from exc

        await self._session.flush()
        self._cache.save_servers(
            instance_id,
            [McpServerRepository.server_to_dict(s) for s in servers],
        )

    def _to_response(
        self, row: McpServer, *, test: McpTestResult | None = None, secret_configured: bool = False
    ) -> McpServerResponse:
        return McpServerResponse(
            id=row.id,
            name=row.name,
            transport=row.transport,
            command=row.command,
            args=McpServerRepository.args_from_json(row.args_json),
            url=row.url,
            enabled=row.enabled,
            secretConfigured=secret_configured,
            status=row.status,
            lastTestAt=test.tested_at if test else None,
            lastError=test.message if test and test.status != "healthy" else None,
        )

    async def _to_response_async(self, row: McpServer) -> McpServerResponse:
        refs = await self._repo.list_secret_refs(row.id)
        test = await self._repo.latest_test_result(row.id)
        return self._to_response(row, test=test, secret_configured=bool(refs))

    async def list(self, instance_id: str) -> list[McpServerResponse]:
        await self._maybe_import_json(instance_id)
        rows = await self._repo.list_by_instance(instance_id)
        return [await self._to_response_async(row) for row in rows]

    async def get(self, instance_id: str, server_id: str) -> McpServerResponse:
        await self._maybe_import_json(instance_id)
        row = await self._repo.get(instance_id, server_id)
        if row is None:
            raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")
        return await self._to_response_async(row)

    async def create(self, instance_id: str, body: McpServerCreateRequest) -> McpServerResponse:
        await self._instance(instance_id)
        await self._maybe_import_json(instance_id)
        if body.transport == "stdio":
            self._policy.validate_command(body.command, body.args)
        if await self._repo.get_by_name(instance_id, body.name):
            raise RuntimeServiceError(f"MCP server name exists: {body.name}", code="conflict")
        row = McpServer(
            instance_id=instance_id,
            name=body.name,
            transport=body.transport,
            command=body.command,
            args_json=McpServerRepository.args_to_json(body.args),
            url=body.url,
            enabled=body.enabled,
            status=MCP_STATUS_DRAFT,
        )
        await self._repo.add(row)
        await self._compile_instance(instance_id)
        refreshed = await self._repo.get(instance_id, row.id)
        assert refreshed is not None
        return await self._to_response_async(refreshed)

    async def update(self, instance_id: str, server_id: str, body: McpServerCreateRequest) -> McpServerResponse:
        await self._maybe_import_json(instance_id)
        if body.transport == "stdio":
            self._policy.validate_command(body.command, body.args)
        row = await self._repo.get(instance_id, server_id)
        if row is None:
            raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")
        existing = await self._repo.get_by_name(instance_id, body.name)
        if existing is not None and existing.id != server_id:
            raise RuntimeServiceError(f"MCP server name exists: {body.name}", code="conflict")
        row.name = body.name
        row.transport = body.transport
        row.command = body.command
        row.args_json = McpServerRepository.args_to_json(body.args)
        row.url = body.url
        row.enabled = body.enabled
        row.status = MCP_STATUS_DRAFT
        await self._session.flush()
        await self._compile_instance(instance_id)
        refreshed = await self._repo.get(instance_id, server_id)
        assert refreshed is not None
        return await self._to_response_async(refreshed)

    async def delete(self, instance_id: str, server_id: str) -> None:
        await self._maybe_import_json(instance_id)
        row = await self._repo.get(instance_id, server_id)
        if row is None:
            raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")
        await self._repo.delete(row)
        await self._compile_instance(instance_id)

    async def set_enabled(self, instance_id: str, server_id: str, enabled: bool) -> McpServerResponse:
        await self._maybe_import_json(instance_id)
        row = await self._repo.get(instance_id, server_id)
        if row is None:
            raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")
        row.enabled = enabled
        row.status = MCP_STATUS_DRAFT if enabled else MCP_STATUS_DISABLED
        await self._session.flush()
        await self._compile_instance(instance_id)
        refreshed = await self._repo.get(instance_id, server_id)
        assert refreshed is not None
        return await self._to_response_async(refreshed)

    async def test(self, instance_id: str, server_id: str, *, timeout: float = 10.0) -> McpServerResponse:
        await self._maybe_import_json(instance_id)
        row = await self._repo.get(instance_id, server_id)
        if row is None:
            raise RuntimeServiceError(f"MCP server not found: {server_id}", code="not_found")

        last_error = None
        status = "healthy"
        if row.transport == "stdio":
            command = row.command
            args = McpServerRepository.args_from_json(row.args_json)
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
            status = "unknown"

        await self._repo.add_test_result(
            McpTestResult(
                mcp_server_id=row.id,
                status=status,
                message=last_error,
                tested_at=datetime.now(UTC),
            )
        )
        return await self._to_response_async(row)
