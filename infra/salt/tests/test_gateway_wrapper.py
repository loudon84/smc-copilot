from __future__ import annotations

from pathlib import Path

from _modules import smc_hermes


def test_wrapper_writes_hermes_gateway_run(tmp_path: Path) -> None:
    home = tmp_path / "hermes"
    home.mkdir()
    result = smc_hermes.gateway_wrapper(
        endpoint_id="ep_1",
        hermes_home=str(home),
        windows_account=r"DOMAIN\zhangsan",
        program_data=str(tmp_path / "ProgramData"),
        hermes_exe=str(home / "hermes.exe"),
    )
    assert result["ok"] is True
    wrapper = Path(result["wrapper"])
    text = wrapper.read_text(encoding="utf-8")
    assert "set HERMES_HOME=" in text
    assert "gateway run" in text
    assert result["task"]["trigger"] == "OnLogon"
    assert result["task"]["user_name"] == r"DOMAIN\zhangsan"
    assert result["task"]["force"] is True


def test_wrapper_refuses_system_fallback() -> None:
    result = smc_hermes.gateway_wrapper(
        endpoint_id="ep_1",
        hermes_home="C:\\Users\\x\\AppData\\Local\\hermes",
        windows_account="System",
    )
    assert result["ok"] is False
    assert result["error"] == "system_user_forbidden"


def test_wrapper_waiting_user_binding() -> None:
    result = smc_hermes.gateway_wrapper(endpoint_id="ep_1", hermes_home="C:\\h")
    assert result["ok"] is False
    assert result["error"] == "waiting_user_binding"


def test_gateway_restart_stop_run_health(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(tmp_path / "owner.json"))
    monkeypatch.setenv("SMC_HERMES_CONTROL_OWNER", "salt")
    calls: list[str] = []
    result = smc_hermes.gateway_restart(
        hermes_home=str(tmp_path / "h"),
        port=9,
        stop=lambda: calls.append("stop") or True,
        start=lambda: calls.append("start") or True,
        wait_closed=lambda: calls.append("closed") or True,
        wait_health=lambda: calls.append("health") or True,
    )
    assert result["ok"] is True
    assert calls == ["stop", "closed", "start", "health"]
    assert result["steps"] == ["task.stop", "port_closed", "task.run", "health_ok"]
