from __future__ import annotations

import inspect

from _modules import smc_hermes


def test_gateway_lifecycle_module_signatures():
    assert hasattr(smc_hermes, "gateway_start")
    assert hasattr(smc_hermes, "gateway_stop")
    assert hasattr(smc_hermes, "gateway_restart")
    sig = inspect.signature(smc_hermes.gateway_restart)
    assert "action" in sig.parameters


def test_gateway_start_stop_accept_injected_hooks():
    stop = smc_hermes.gateway_stop(stop=lambda: {"ok": True}, wait_closed=lambda: True)
    assert stop["ok"] is True
    start = smc_hermes.gateway_start(start=lambda: {"ok": True}, wait_health=lambda: True)
    assert start["ok"] is True
    restart = smc_hermes.gateway_restart(
        action="restart",
        stop=lambda: {"ok": True},
        start=lambda: {"ok": True},
        wait_closed=lambda: True,
        wait_health=lambda: True,
    )
    assert restart["ok"] is True
    assert restart["action"] == "restart"
