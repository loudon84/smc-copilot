from __future__ import annotations

import json
from pathlib import Path

from client.handover import HandoverHooks, migrate, rollback
from client.paths import control_owner_path, migration_marker_path


def _hooks(**overrides) -> HandoverHooks:
    def _ok() -> bool:
        return True

    base = dict(
        inspect=lambda: {"ok": True, "home": "C:/Users/a/AppData/Local/hermes"},
        snapshot=lambda: {"owner": "runtime", "config": "ok"},
        verify_salt=_ok,
        stop_gateway=_ok,
        disable_runtime=_ok,
        start_salt_gateway=_ok,
        health=_ok,
        work_probe=_ok,
        restore_snapshot=lambda s: True,
        restore_runtime=_ok,
        runtime_reconcile=_ok,
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


def test_owner_303_rollback_restores_direct_not_forced_runtime(tmp_path: Path) -> None:
    control_owner_path(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    control_owner_path(tmp_path).write_text('{"hermes": "direct"}\n', encoding="utf-8")
    migrate(
        hooks=_hooks(snapshot=lambda: {"owner": "direct", "config": "ok"}),
        program_data=tmp_path,
        endpoint_id="ep_1",
    )
    result = rollback(hooks=_hooks(), program_data=tmp_path)
    assert result.ok is True
    assert json.loads(control_owner_path(tmp_path).read_text(encoding="utf-8"))["hermes"] == "direct"


def test_owner_303_rollback_absent_owner_removes_file(tmp_path: Path) -> None:
    migrate(
        hooks=_hooks(snapshot=lambda: {"owner": None, "config": "ok"}),
        program_data=tmp_path,
        endpoint_id="ep_1",
    )
    result = rollback(hooks=_hooks(), program_data=tmp_path)
    assert result.ok is True
    assert not control_owner_path(tmp_path).is_file()
