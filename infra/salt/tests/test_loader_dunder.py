from __future__ import annotations

from pathlib import Path

from _beacons import smc_hermes_health
from _grains import smc_endpoint
from _modules import smc_hermes
from _pillar import smc_external
from _returners import smc_backend
from _utils.dunder import call_util


def test_extensions_do_not_expose_sys_path_hacks() -> None:
    assert not any(
        getattr(mod, "_UTILS_ROOT", None)
        or getattr(mod, "_UTILS_PARENT", None)
        or getattr(mod, "_REPO_SALT", None)
        for mod in (smc_hermes, smc_endpoint, smc_external, smc_hermes_health, smc_backend)
    )


def test_call_util_prefers_injected_dunder() -> None:
    def fake_read():
        return "salt"

    result = call_util(
        {"smc_control_owner.read_control_owner": fake_read},
        "smc_control_owner.read_control_owner",
    )
    assert result == "salt"


def test_call_util_falls_back_without_dunder() -> None:
    owner = call_util(None, "smc_control_owner.read_control_owner")
    assert owner in {None, "salt", "runtime"}


def test_modules_have_no_sys_path_insert_source() -> None:
    root = Path(__file__).resolve().parents[1] / "extensions"
    offenders = []
    for path in root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "sys.path.insert" in text or "sys.path.append" in text:
            offenders.append(str(path))
    assert offenders == []
