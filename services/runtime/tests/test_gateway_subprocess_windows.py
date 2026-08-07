from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from core.config import Settings
from runtime.gateway_process import GatewayProcessManager


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        sqlite_path=str(tmp_path / "test.db"),
        log_dir=str(tmp_path / "logs"),
        hermes_home=str(tmp_path / "hermes"),
        default_gateway_port=18801,
    )


@pytest.mark.asyncio
async def test_create_gateway_process_windows_hidden(settings: Settings, tmp_path: Path) -> None:
    manager = GatewayProcessManager(settings)
    log_path = tmp_path / "gateway-test.log"
    log_file = log_path.open("a", encoding="utf-8")
    cmd = [sys.executable, "-c", "pass"]

    captured: dict[str, object] = {}

    async def fake_create_subprocess_exec(*args: object, **kwargs: object) -> AsyncMock:
        captured["args"] = args
        captured["kwargs"] = kwargs
        mock_proc = AsyncMock()
        mock_proc.pid = 12345
        mock_proc.returncode = None
        return mock_proc

    with patch.object(asyncio, "create_subprocess_exec", side_effect=fake_create_subprocess_exec):
        process = await manager._create_gateway_process(cmd, log_file)

    assert process.pid == 12345
    assert captured["args"] == tuple(cmd)
    kwargs = captured["kwargs"]
    assert isinstance(kwargs, dict)
    assert kwargs["stdout"] is log_file
    assert kwargs["stderr"] == asyncio.subprocess.STDOUT
    assert kwargs["cwd"] == str(settings.hermes_home_path)

    if sys.platform == "win32":
        assert kwargs["creationflags"] == subprocess.CREATE_NO_WINDOW
        startupinfo = kwargs["startupinfo"]
        assert isinstance(startupinfo, subprocess.STARTUPINFO)
        assert startupinfo.dwFlags & subprocess.STARTF_USESHOWWINDOW
        assert startupinfo.wShowWindow == subprocess.SW_HIDE
    else:
        assert "creationflags" not in kwargs
        assert "startupinfo" not in kwargs

    log_file.close()
