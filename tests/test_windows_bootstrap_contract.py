"""Windows bootstrap / provision script contract checks (v1.3.1 FR-11/12/13)."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def test_cmd_wrappers_exist() -> None:
    for name in (
        "runtime-install-windows.cmd",
        "runtime-provision-windows.cmd",
        "runtime-start-windows.cmd",
    ):
        path = SCRIPTS / name
        assert path.is_file(), path
        text = path.read_text(encoding="utf-8", errors="replace")
        assert "ExecutionPolicy Bypass" in text
        assert "powershell" in text.lower()


def test_provision_script_orders_userdaemon_last() -> None:
    text = (SCRIPTS / "runtime-provision-windows.ps1").read_text(encoding="utf-8")
    smoke_idx = text.lower().find("runtime-smoke-test-windows")
    daemon_idx = text.lower().find("windows_user_daemon")
    assert smoke_idx > 0
    assert daemon_idx > smoke_idx


def test_bootstrap_accepts_python_path() -> None:
    text = (SCRIPTS / "bootstrap-windows.ps1").read_text(encoding="utf-8")
    assert "PythonPath" in text
    assert "uv venv --python" in text
    assert "TOOLCHAIN_PYTHON_PATH" in text


def test_precheck_port_allow_existing() -> None:
    text = (SCRIPTS / "runtime-precheck-windows.ps1").read_text(encoding="utf-8")
    assert "AllowExistingRuntime" in text
    assert "api/v1/health" in text


def test_smoke_require_hermes_flags() -> None:
    text = (SCRIPTS / "runtime-smoke-test-windows.ps1").read_text(encoding="utf-8")
    assert "RequireHermes" in text
    assert "RequireGateway" in text
    assert "/v1/models" in text
