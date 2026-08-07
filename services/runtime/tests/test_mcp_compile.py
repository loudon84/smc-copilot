"""MCP config compiler unit tests (v1.4 FR-07)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from core.config import Settings
from db.models.runtime import McpServer
from runtime.mcp_config_compiler import McpConfigCompiler, McpRuntimeValidator


class _FakeConfigAdapter:
    def __init__(self) -> None:
        self.written: dict[str, dict] = {}

    def read(self, profile_name: str) -> dict:
        return {"model": {"id": "test-model"}}

    def write(self, profile_name: str, data: dict) -> None:
        self.written[profile_name] = data


class _FakeValidator:
    async def validate(self, *, profile_name: str, executable: Path | None = None) -> dict:
        return {"ok": True, "nativeCheck": False, "skipped": True}


# @lat: [[tests#MCP Compile#Writes Hermes config]]
def test_mcp_compile_writes_hermes_config(test_settings: Settings) -> None:
    adapter = _FakeConfigAdapter()
    compiler = McpConfigCompiler(
        test_settings,
        config_adapter=adapter,
        validator=_FakeValidator(),
    )
    server = McpServer(
        id="srv-1",
        instance_id="inst-1",
        name="markitdown",
        transport="stdio",
        command="markitdown-mcp",
        args_json='["--verbose"]',
        enabled=True,
        status="draft",
    )

    import asyncio

    asyncio.run(
        compiler.compile_and_write(
            "mcp-profile",
            [server],
            secret_refs_by_server={},
            executable=None,
        )
    )

    written = adapter.written["mcp-profile"]
    assert written["model"]["id"] == "test-model"
    assert "mcp" in written
    assert written["mcp"]["servers"]["markitdown"] == {
        "transport": "stdio",
        "command": "markitdown-mcp",
        "args": ["--verbose"],
    }


def test_mcp_compile_skips_disabled_servers(test_settings: Settings) -> None:
    adapter = _FakeConfigAdapter()
    compiler = McpConfigCompiler(test_settings, config_adapter=adapter, validator=_FakeValidator())
    enabled = McpServer(
        id="srv-1",
        instance_id="inst-1",
        name="enabled-server",
        transport="stdio",
        command="tool-a",
        enabled=True,
        status="draft",
    )
    disabled = McpServer(
        id="srv-2",
        instance_id="inst-1",
        name="disabled-server",
        transport="stdio",
        command="tool-b",
        enabled=False,
        status="disabled",
    )

    section = compiler.compile_servers([enabled, disabled])
    assert list(section["mcp"]["servers"].keys()) == ["enabled-server"]


@pytest.mark.asyncio
async def test_mcp_runtime_validator_skips_without_executable(test_settings: Settings) -> None:
    validator = McpRuntimeValidator(test_settings, cli=MagicMock())
    result = await validator.validate(profile_name="default", executable=None)
    assert result["skipped"] is True
    validator._cli.config_check.assert_not_called()
