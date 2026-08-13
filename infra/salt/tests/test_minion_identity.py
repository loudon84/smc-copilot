from __future__ import annotations

from pathlib import Path

import pytest

from client.minion_identity import (
    SNAPSHOT_SCHEMA,
    load_snapshot,
    plan_adoption,
    should_revoke_old_key,
    validate_master_finger,
    write_snapshot,
)


def test_plan_adoption_requires_ep_and_finger() -> None:
    snap = plan_adoption(
        old_minion_id="ITBJB0676",
        new_endpoint_id="ep_abc",
        master_finger="sha256:" + ("ab" * 32),
        conf_backup="C:/backup",
    )
    assert snap.new_endpoint_id == "ep_abc"
    with pytest.raises(ValueError):
        plan_adoption(
            old_minion_id="ITBJB0676",
            new_endpoint_id="bad",
            master_finger="sha256:ff",
            conf_backup="x",
        )
    with pytest.raises(ValueError):
        validate_master_finger("")


def test_revoke_only_after_full_manual_gates() -> None:
    assert should_revoke_old_key(new_identity_online=True, highstate_ok=True) is False
    assert (
        should_revoke_old_key(
            fingerprint_compared=True,
            key_accepted=True,
            ping_ok=True,
            sync_ok=True,
            inspect_ok=True,
            doctor_ok=True,
            pillar_gate_ok=True,
        )
        is True
    )


def test_snapshot_schema_roundtrip(tmp_path: Path) -> None:
    snap = plan_adoption(
        old_minion_id="ITBJB0676",
        new_endpoint_id="ep_abc",
        master_finger="sha256:" + ("ab" * 32),
        conf_backup=str(tmp_path / "backup"),
        service_start_type="Automatic",
    )
    path = tmp_path / "minion-identity-adoption.json"
    write_snapshot(path, snap)
    payload = path.read_text(encoding="utf-8")
    assert SNAPSHOT_SCHEMA in payload
    loaded = load_snapshot(path)
    assert loaded.old_minion_id == "ITBJB0676"
    assert loaded.new_endpoint_id == "ep_abc"
