from __future__ import annotations

from pathlib import Path

from _modules import smc_hermes
from _states import smc_hermes as state_mod


def test_profile_apply(tmp_path: Path) -> None:
    home = tmp_path / "hermes"
    result = smc_hermes.profile_apply("default", hermes_home=str(home), port=8642, windows_account=r"DOMAIN\zhangsan")
    assert (home / "profiles" / "default" / "profile.json").is_file()
    assert result["profile"]["port"] == 8642
    assert result["wrapper"]["ok"] is True


def test_mcp_validate_and_test() -> None:
    ok = smc_hermes.mcp_validate({"mcpServers": [{"name": "fs", "command": "npx"}]})
    assert ok["ok"] is True
    bad = smc_hermes.mcp_validate({"mcpServers": [{"name": "fs"}]})
    assert bad["ok"] is False
    tested = smc_hermes.mcp_test({"mcpServers": [{"command": "npx"}]})
    assert tested["ok"] is True


def test_state_mcp_configured(monkeypatch) -> None:
    monkeypatch.setattr(
        state_mod,
        "_salt",
        lambda: {
            "smc_hermes.mcp_validate": lambda **kwargs: {"ok": True, "count": 1},
            "smc_hermes.mcp_test": lambda **kwargs: {"ok": True, "tested": 1},
        },
    )
    ret = state_mod.mcp_configured("mcp", config={"mcpServers": [{"command": "npx"}]})
    assert ret["result"] is True
