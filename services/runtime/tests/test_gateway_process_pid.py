from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

from core.config import Settings
from runtime.gateway_process import GatewayProcessManager, is_pid_alive

_ROOT = Path(__file__).resolve().parents[1]
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", "pid-test"]


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        sqlite_path=str(tmp_path / "test.db"),
        log_dir=str(tmp_path / "logs"),
        hermes_home=str(tmp_path / "hermes"),
        default_gateway_port=18801,
    )


@pytest.mark.asyncio
async def test_stop_by_pid_when_handle_missing(settings: Settings) -> None:
    manager = GatewayProcessManager(settings)
    port = 18802
    handle = await manager.start("profile-1", "pid-test", port, mock_command=_mock_cmd(port))
    pid = handle.pid
    assert pid is not None
    assert is_pid_alive(pid)

    manager._handles.pop("profile-1", None)
    await manager.stop("profile-1", pid=pid)
    await asyncio.sleep(0.3)
    assert not is_pid_alive(pid)
