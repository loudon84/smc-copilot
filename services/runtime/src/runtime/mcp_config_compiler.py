# @lat: [[runtime-service#MCP 配置编译]]
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from core.config import Settings
from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import McpServer, SecretReference
from integrations.hermes.cli_adapter import HermesCliAdapter
from services.configuration_service import HermesConfigAdapter
from services.secret_service import SecretStore

logger = get_logger(__name__)

MCP_STATUS_DRAFT = "draft"
MCP_STATUS_VALIDATING = "validating"
MCP_STATUS_READY = "ready"
MCP_STATUS_ERROR = "error"
MCP_STATUS_DISABLED = "disabled"


class McpSecretResolver:
    """Resolve MCP secret references from SecretStore into env key/value pairs."""

    def __init__(self, settings: Settings) -> None:
        self._store = SecretStore(settings)

    def resolve(self, refs: list[tuple[str, SecretReference]]) -> dict[str, str]:
        env: dict[str, str] = {}
        for secret_name, ref in refs:
            value = self._store.get(ref.storage_key)
            if value is None:
                raise RuntimeServiceError(
                    f"MCP secret not configured: {secret_name}",
                    code="secret_not_configured",
                )
            env[secret_name] = value
        return env


@dataclass(frozen=True)
class McpCompileResult:
    config: dict[str, Any]
    validation: dict[str, Any]


class _HermesCliPort(Protocol):
    async def config_check(self, *, profile_name: str | None = None) -> dict[str, Any]: ...


class McpRuntimeValidator:
    """Run ``hermes config check`` after MCP compile; soft-skip when Hermes is absent."""

    def __init__(self, settings: Settings, *, cli: _HermesCliPort | None = None) -> None:
        self._settings = settings
        self._cli = cli

    async def validate(self, *, profile_name: str, executable: Path | None = None) -> dict[str, Any]:
        if executable is None or not executable.exists():
            return {"ok": True, "nativeCheck": False, "skipped": True}
        cli = self._cli or HermesCliAdapter(self._settings, executable=executable)
        return await cli.config_check(profile_name=profile_name)


class McpConfigCompiler:
    """Compile Runtime MCP records into the Hermes profile ``config.yaml`` MCP section."""

    def __init__(
        self,
        settings: Settings,
        *,
        config_adapter: HermesConfigAdapter | None = None,
        secret_resolver: McpSecretResolver | None = None,
        validator: McpRuntimeValidator | None = None,
    ) -> None:
        self._settings = settings
        self._config = config_adapter or HermesConfigAdapter(settings)
        self._secrets = secret_resolver or McpSecretResolver(settings)
        self._validator = validator or McpRuntimeValidator(settings)

    def build_server_entry(
        self,
        row: McpServer,
        *,
        secret_refs: list[tuple[str, SecretReference]] | None = None,
    ) -> dict[str, Any]:
        entry: dict[str, Any] = {"transport": row.transport}
        if row.transport == "stdio":
            if row.command:
                entry["command"] = row.command
            args = []
            if row.args_json:
                try:
                    parsed = json.loads(row.args_json)
                    if isinstance(parsed, list):
                        args = [str(a) for a in parsed]
                except json.JSONDecodeError:
                    pass
            if args:
                entry["args"] = args
        elif row.url:
            entry["url"] = row.url
        if secret_refs:
            env = self._secrets.resolve(secret_refs)
            if env:
                entry["env"] = env
        return entry

    def compile_servers(
        self,
        servers: list[McpServer],
        *,
        secret_refs_by_server: dict[str, list[tuple[str, SecretReference]]] | None = None,
    ) -> dict[str, Any]:
        refs_by_server = secret_refs_by_server or {}
        compiled: dict[str, Any] = {}
        for row in servers:
            if not row.enabled:
                continue
            refs = refs_by_server.get(row.id, [])
            compiled[row.name] = self.build_server_entry(row, secret_refs=refs)
        return {"mcp": {"servers": compiled}}

    def merge_into_config(self, current: dict[str, Any], mcp_section: dict[str, Any]) -> dict[str, Any]:
        merged = dict(current)
        if "mcp" in mcp_section:
            merged["mcp"] = mcp_section["mcp"]
        else:
            merged.update(mcp_section)
        return merged

    async def compile_and_write(
        self,
        profile_name: str,
        servers: list[McpServer],
        *,
        secret_refs_by_server: dict[str, list[tuple[str, SecretReference]]] | None = None,
        executable: Path | None = None,
    ) -> McpCompileResult:
        mcp_section = self.compile_servers(servers, secret_refs_by_server=secret_refs_by_server)
        current = self._config.read(profile_name)
        merged = self.merge_into_config(current, mcp_section)
        self._config.write(profile_name, merged)
        validation = await self._validator.validate(profile_name=profile_name, executable=executable)
        logger.info(
            "mcp_config_compiled",
            profile_name=profile_name,
            server_count=len(mcp_section.get("mcp", {}).get("servers", {})),
            native_check=validation.get("nativeCheck"),
        )
        return McpCompileResult(config=merged, validation=validation)
