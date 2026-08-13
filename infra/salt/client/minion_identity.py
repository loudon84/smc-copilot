"""Minion identity migration helpers (hostname → ep_*)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ENDPOINT_ID_RE = re.compile(r"^ep_[A-Za-z0-9_-]+$")
MASTER_FINGER_RE = re.compile(r"^sha256:[A-Fa-f0-9:]+$")
SNAPSHOT_SCHEMA = "smc.minion-identity-adoption.v1"
SNAPSHOT_VERSION = 1


@dataclass
class IdentitySnapshot:
    old_minion_id: str
    new_endpoint_id: str
    conf_backup: str
    service_start_type: str
    master_finger: str


def validate_endpoint_id(endpoint_id: str) -> str:
    if not ENDPOINT_ID_RE.match(endpoint_id):
        raise ValueError(f"endpoint id must match ep_*: {endpoint_id}")
    return endpoint_id


def validate_master_finger(finger: str) -> str:
    value = finger.strip()
    if not value or not MASTER_FINGER_RE.match(value):
        raise ValueError("master_finger required and must look like sha256:...")
    return value


def plan_adoption(
    *,
    old_minion_id: str,
    new_endpoint_id: str,
    master_finger: str,
    conf_backup: str,
    service_start_type: str = "Automatic",
) -> IdentitySnapshot:
    if old_minion_id.startswith("ep_"):
        raise ValueError("old minion id already looks like endpoint id")
    return IdentitySnapshot(
        old_minion_id=old_minion_id,
        new_endpoint_id=validate_endpoint_id(new_endpoint_id),
        conf_backup=conf_backup,
        service_start_type=service_start_type,
        master_finger=validate_master_finger(master_finger),
    )


def should_revoke_old_key(
    *,
    fingerprint_compared: bool = False,
    key_accepted: bool = False,
    ping_ok: bool = False,
    sync_ok: bool = False,
    inspect_ok: bool = False,
    doctor_ok: bool = False,
    pillar_gate_ok: bool = False,
    new_identity_online: bool = False,
    highstate_ok: bool = False,
) -> bool:
    """Old key stays accepted until the new identity fully passes manual gates."""
    del new_identity_online, highstate_ok
    return all(
        [
            fingerprint_compared,
            key_accepted,
            ping_ok,
            sync_ok,
            inspect_ok,
            doctor_ok,
            pillar_gate_ok,
        ]
    )


def snapshot_payload(snapshot: IdentitySnapshot) -> dict[str, Any]:
    return {
        "schema": SNAPSHOT_SCHEMA,
        "version": SNAPSHOT_VERSION,
        "oldMinionId": snapshot.old_minion_id,
        "newEndpointId": snapshot.new_endpoint_id,
        "confBackup": snapshot.conf_backup,
        "serviceStartType": snapshot.service_start_type,
        "masterFinger": snapshot.master_finger,
        "revokeOldKeyAllowed": False,
    }


def write_snapshot(path: Path, snapshot: IdentitySnapshot) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(snapshot_payload(snapshot), indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_snapshot(path: Path) -> IdentitySnapshot:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return plan_adoption(
        old_minion_id=str(payload["oldMinionId"]),
        new_endpoint_id=str(payload["newEndpointId"]),
        master_finger=str(payload["masterFinger"]),
        conf_backup=str(payload["confBackup"]),
        service_start_type=str(payload.get("serviceStartType") or "Automatic"),
    )
