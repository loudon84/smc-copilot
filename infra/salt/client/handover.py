"""Runtime → Salt ownership handover + rollback (PRD v2.1 §14).

Owner switch happens only after Salt can manage Hermes. v2.1 does not uninstall Runtime files.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from client.paths import control_owner_path, migration_marker_path, smc_root

HandoverState = Literal[
    "PRECHECK",
    "SALT_READY",
    "HERMES_ADOPTED",
    "OLD_GATEWAY_STOPPED",
    "RUNTIME_STOPPED",
    "OWNER_SWITCHED",
    "SALT_GATEWAY_STARTED",
    "WORK_VERIFIED",
    "COMPLETED",
    "ROLLBACK",
]

MIGRATE_STEPS: tuple[HandoverState, ...] = (
    "PRECHECK",
    "SALT_READY",
    "HERMES_ADOPTED",
    "OLD_GATEWAY_STOPPED",
    "RUNTIME_STOPPED",
    "OWNER_SWITCHED",
    "SALT_GATEWAY_STARTED",
    "WORK_VERIFIED",
    "COMPLETED",
)


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def read_owner(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    owner = str(payload.get("hermes", "")).strip().lower()
    return owner if owner in {"salt", "runtime", "direct"} else None


@dataclass
class HandoverHooks:
    inspect: Callable[[], dict[str, Any]]
    snapshot: Callable[[], dict[str, Any]]
    verify_salt: Callable[[], bool]
    stop_gateway: Callable[[], bool]
    disable_runtime: Callable[[], bool]
    start_salt_gateway: Callable[[], bool]
    health: Callable[[], bool]
    work_probe: Callable[[], bool]
    restore_snapshot: Callable[[dict[str, Any]], bool]
    restore_runtime: Callable[[], bool]
    runtime_reconcile: Callable[[], bool]


@dataclass
class HandoverResult:
    state: HandoverState
    ok: bool
    owner: str | None
    error: str | None = None
    snapshot: dict[str, Any] = field(default_factory=dict)
    marker: str | None = None
    steps: list[str] = field(default_factory=list)


def migrate(
    *,
    hooks: HandoverHooks,
    program_data: Path,
    endpoint_id: str = "ep_lab",
    hermes_home: str = "",
) -> HandoverResult:
    owner_path = control_owner_path(program_data)
    marker_path = migration_marker_path(program_data)
    snapshot_dir = smc_root(program_data) / "handover-snapshots"
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    initial_owner = read_owner(owner_path)
    steps: list[str] = []
    snapshot: dict[str, Any] = {}

    def fail(state: HandoverState, error: str) -> HandoverResult:
        return HandoverResult(
            state=state,
            ok=False,
            owner=read_owner(owner_path) or initial_owner,
            error=error,
            snapshot=snapshot,
            steps=steps,
        )

    steps.append("PRECHECK")
    facts = hooks.inspect()
    if not facts.get("ok", True) and facts.get("error"):
        return fail("PRECHECK", str(facts.get("error")))

    steps.append("SALT_READY")
    if not hooks.verify_salt():
        return fail("SALT_READY", "salt_not_ready")

    steps.append("HERMES_ADOPTED")
    snapshot = hooks.snapshot()
    snapshot.setdefault("owner", initial_owner)
    snapshot.setdefault("endpoint_id", endpoint_id)
    snapshot.setdefault("hermes_home", hermes_home or facts.get("home"))
    atomic_write_json(snapshot_dir / "latest.json", snapshot)

    steps.append("OLD_GATEWAY_STOPPED")
    if not hooks.stop_gateway():
        return fail("OLD_GATEWAY_STOPPED", "stop_gateway_failed")

    steps.append("RUNTIME_STOPPED")
    if not hooks.disable_runtime():
        return fail("RUNTIME_STOPPED", "disable_runtime_failed")

    steps.append("OWNER_SWITCHED")
    atomic_write_json(owner_path, {"hermes": "salt"})

    steps.append("SALT_GATEWAY_STARTED")
    if not hooks.start_salt_gateway():
        atomic_write_json(owner_path, {"hermes": initial_owner or "runtime"})
        return fail("SALT_GATEWAY_STARTED", "salt_gateway_start_failed")

    if not hooks.health():
        atomic_write_json(owner_path, {"hermes": initial_owner or "runtime"})
        return fail("SALT_GATEWAY_STARTED", "gateway_unhealthy")

    steps.append("WORK_VERIFIED")
    if not hooks.work_probe():
        atomic_write_json(owner_path, {"hermes": initial_owner or "runtime"})
        return fail("WORK_VERIFIED", "work_probe_failed")

    steps.append("COMPLETED")
    marker = {
        "endpoint_id": endpoint_id,
        "hermes_home": snapshot.get("hermes_home"),
        "owner": "salt",
        "status": "COMPLETED",
    }
    atomic_write_json(marker_path, marker)
    return HandoverResult(
        state="COMPLETED",
        ok=True,
        owner="salt",
        snapshot=snapshot,
        marker=str(marker_path),
        steps=steps,
    )


def rollback(
    *,
    hooks: HandoverHooks,
    program_data: Path,
    snapshot: dict[str, Any] | None = None,
) -> HandoverResult:
    owner_path = control_owner_path(program_data)
    snapshot_path = smc_root(program_data) / "handover-snapshots" / "latest.json"
    payload = snapshot or {}
    if not payload and snapshot_path.is_file():
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    steps = ["ROLLBACK", "stop_salt_gateway", "restore_snapshot", "owner_runtime", "restore_runtime", "reconcile"]
    hooks.stop_gateway()
    if payload:
        hooks.restore_snapshot(payload)
    atomic_write_json(owner_path, {"hermes": "runtime"})
    hooks.restore_runtime()
    healthy = hooks.runtime_reconcile() and hooks.health()
    marker_path = migration_marker_path(program_data)
    if marker_path.is_file():
        marker_path.unlink()
    return HandoverResult(
        state="ROLLBACK",
        ok=bool(healthy),
        owner="runtime",
        error=None if healthy else "rollback_health_failed",
        snapshot=payload,
        steps=steps,
    )
