"""Owner-switch-after-ready failures must restore Runtime snapshot."""

from __future__ import annotations

import json
from pathlib import Path

from client.handover import HandoverHooks, migrate, remigrate, rollback
from client.paths import control_owner_path


def _hooks(**overrides) -> HandoverHooks:
    restored: dict[str, object] = {"snapshot": False, "runtime": False, "reconcile": False}

    def restore_snapshot(_payload: dict) -> bool:
        restored["snapshot"] = True
        return True

    def restore_runtime() -> bool:
        restored["runtime"] = True
        return True

    def runtime_reconcile() -> bool:
        restored["reconcile"] = True
        return True

    base = dict(
        inspect=lambda: {"ok": True, "home": "C:/Users/a/AppData/Local/hermes"},
        snapshot=lambda: {
            "owner": "runtime",
            "hermes_home": "C:/Users/a/AppData/Local/hermes",
            "gateway_port": 8642,
            "runtime_port": 8765,
            "runtime_service": "SMCRuntime",
        },
        verify_salt=lambda: True,
        stop_gateway=lambda: True,
        disable_runtime=lambda: True,
        start_salt_gateway=lambda: True,
        health=lambda: True,
        work_probe=lambda: True,
        restore_snapshot=restore_snapshot,
        restore_runtime=restore_runtime,
        runtime_reconcile=runtime_reconcile,
    )
    base.update(overrides)
    hooks = HandoverHooks(**base)
    hooks._restored = restored  # type: ignore[attr-defined]
    return hooks


def test_preflight_failure_keeps_runtime_owner(tmp_path: Path) -> None:
    control_owner_path(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    control_owner_path(tmp_path).write_text('{"hermes": "runtime"}\n', encoding="utf-8")
    result = migrate(hooks=_hooks(verify_salt=lambda: False), program_data=tmp_path)
    assert result.ok is False
    assert json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))["hermes"] == "runtime"


def test_owner_switch_gateway_failure_restores_snapshot(tmp_path: Path) -> None:
    control_owner_path(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    control_owner_path(tmp_path).write_text('{"hermes": "runtime"}\n', encoding="utf-8")
    hooks = _hooks(start_salt_gateway=lambda: False)
    result = migrate(hooks=hooks, program_data=tmp_path)
    assert result.ok is False
    assert json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))["hermes"] == "runtime"
    assert hooks._restored["snapshot"] is True  # type: ignore[attr-defined]
    assert hooks._restored["runtime"] is True  # type: ignore[attr-defined]
    assert hooks._restored["reconcile"] is True  # type: ignore[attr-defined]


def test_work_probe_failure_restores_runtime(tmp_path: Path) -> None:
    control_owner_path(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    control_owner_path(tmp_path).write_text('{"hermes": "runtime"}\n', encoding="utf-8")
    hooks = _hooks(work_probe=lambda: False)
    result = migrate(hooks=hooks, program_data=tmp_path)
    assert result.ok is False
    assert json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))["hermes"] == "runtime"
    assert hooks._restored["reconcile"] is True  # type: ignore[attr-defined]


def test_remigrate_blocked_until_rollback(tmp_path: Path) -> None:
    migrate(hooks=_hooks(), program_data=tmp_path, endpoint_id="ep_1")
    blocked = remigrate(hooks=_hooks(), program_data=tmp_path, endpoint_id="ep_1")
    assert blocked.ok is False
    assert blocked.error == "remigrate_requires_rollback"
    rolled = rollback(hooks=_hooks(), program_data=tmp_path)
    assert rolled.ok is True
    again = remigrate(hooks=_hooks(), program_data=tmp_path, endpoint_id="ep_1")
    assert again.ok is True
