from __future__ import annotations

import json
from pathlib import Path

from client.handover import HandoverHooks, migrate, rollback
from client.paths import control_owner_path, migration_marker_path


def _hooks(**overrides) -> HandoverHooks:
    base = dict(
        inspect=lambda: {"ok": True, "home": "C:/Users/a/AppData/Local/hermes"},
        snapshot=lambda: {"owner": "runtime", "config": "ok"},
        verify_salt=lambda: True,
        stop_gateway=lambda: True,
        disable_runtime=lambda: True,
        start_salt_gateway=lambda: True,
        health=lambda: True,
        work_probe=lambda: True,
        restore_snapshot=lambda s: True,
        restore_runtime=lambda: True,
        runtime_reconcile=lambda: True,
    )
    base.update(overrides)
    return HandoverHooks(**base)


def test_migrate_happy_path(tmp_path: Path) -> None:
    result = migrate(hooks=_hooks(), program_data=tmp_path, endpoint_id="ep_1")
    assert result.ok is True
    assert result.state == "COMPLETED"
    assert result.owner == "salt"
    owner = json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))
    assert owner["hermes"] == "salt"
    assert migration_marker_path(tmp_path).is_file()


def test_migrate_failure_before_owner_switch(tmp_path: Path) -> None:
    result = migrate(hooks=_hooks(verify_salt=lambda: False), program_data=tmp_path)
    assert result.ok is False
    assert result.state == "SALT_READY"
    assert not control_owner_path(tmp_path).is_file()


def test_migrate_gateway_start_failure_restores_owner(tmp_path: Path) -> None:
    control_owner_path(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    control_owner_path(tmp_path).write_text('{"hermes": "runtime"}\n', encoding="utf-8")
    result = migrate(hooks=_hooks(start_salt_gateway=lambda: False), program_data=tmp_path)
    assert result.ok is False
    assert json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))["hermes"] == "runtime"


def test_rollback_restores_runtime_owner(tmp_path: Path) -> None:
    migrate(hooks=_hooks(), program_data=tmp_path, endpoint_id="ep_1")
    result = rollback(hooks=_hooks(), program_data=tmp_path)
    assert result.ok is True
    assert result.state == "ROLLBACK"
    assert json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))["hermes"] == "runtime"
    assert not migration_marker_path(tmp_path).is_file()


def test_rollback_is_idempotent(tmp_path: Path) -> None:
    first = rollback(hooks=_hooks(), program_data=tmp_path, snapshot={"owner": "runtime"})
    second = rollback(hooks=_hooks(), program_data=tmp_path, snapshot={"owner": "runtime"})
    assert first.ok is True
    assert second.ok is True
    assert json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))["hermes"] == "runtime"
