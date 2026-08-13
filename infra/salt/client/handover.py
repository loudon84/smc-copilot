"""Runtime → Salt ownership handover + rollback (PRD v2.3).

Owner switch happens only via explicit commit after health + work probe.
Production must not use stub hooks that always return True.
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


def assert_no_stub_hooks(hooks: HandoverHooks, *, salt_env: str | None = None) -> None:
    env = (salt_env or os.environ.get("SMC_SALT_ENV", "lab")).strip().lower()
    if env in {"lab", "test"}:
        return
    for name in (
        "inspect",
        "snapshot",
        "verify_salt",
        "stop_gateway",
        "disable_runtime",
        "start_salt_gateway",
        "health",
        "work_probe",
        "restore_snapshot",
        "restore_runtime",
        "runtime_reconcile",
    ):
        fn = getattr(hooks, name)
        # Detect trivial lambdas used as production stubs: always-True / empty-ok.
        code = getattr(fn, "__code__", None)
        if code is not None and code.co_code and "lambda" in (fn.__name__ or ""):
            # Production path must supply named callables from real adapters.
            if fn.__name__ == "<lambda>":
                raise RuntimeError(f"stub hook forbidden in production: {name}")


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


def _restore_owner(owner_path: Path, initial_owner: str | None) -> None:
    if initial_owner in {"salt", "runtime", "direct"}:
        atomic_write_json(owner_path, {"hermes": initial_owner})
    elif owner_path.is_file():
        owner_path.unlink()


def migrate(
    *,
    hooks: HandoverHooks,
    program_data: Path,
    endpoint_id: str = "ep_lab",
    hermes_home: str = "",
) -> HandoverResult:
    assert_no_stub_hooks(hooks)
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
            owner=read_owner(owner_path) if owner_path.is_file() else initial_owner,
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

    def restore_after_owner_switch() -> None:
        if snapshot:
            hooks.restore_snapshot(snapshot)
        hooks.restore_runtime()
        hooks.runtime_reconcile()
        _restore_owner(owner_path, initial_owner)

    steps.append("SALT_GATEWAY_STARTED")
    if not hooks.start_salt_gateway():
        restore_after_owner_switch()
        return fail("SALT_GATEWAY_STARTED", "salt_gateway_start_failed")

    if not hooks.health():
        restore_after_owner_switch()
        return fail("SALT_GATEWAY_STARTED", "gateway_unhealthy")

    steps.append("WORK_VERIFIED")
    if not hooks.work_probe():
        restore_after_owner_switch()
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
    assert_no_stub_hooks(hooks)
    owner_path = control_owner_path(program_data)
    snapshot_path = smc_root(program_data) / "handover-snapshots" / "latest.json"
    payload = snapshot or {}
    if not payload and snapshot_path.is_file():
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    steps = ["ROLLBACK", "stop_salt_gateway", "restore_snapshot", "owner_restore", "restore_runtime", "reconcile"]
    hooks.stop_gateway()
    if payload:
        hooks.restore_snapshot(payload)
    previous = payload.get("owner")
    if previous in {"salt", "runtime", "direct"}:
        atomic_write_json(owner_path, {"hermes": previous})
        restored_owner: str | None = str(previous)
    else:
        if owner_path.is_file():
            owner_path.unlink()
        restored_owner = None
    hooks.restore_runtime()
    healthy = bool(hooks.runtime_reconcile())
    marker_path = migration_marker_path(program_data)
    if marker_path.is_file():
        marker_path.unlink()
    return HandoverResult(
        state="ROLLBACK",
        ok=bool(healthy),
        owner=restored_owner,
        error=None if healthy else "rollback_health_failed",
        snapshot=payload,
        steps=steps,
    )


def remigrate(
    *,
    hooks: HandoverHooks,
    program_data: Path,
    endpoint_id: str = "ep_lab",
    hermes_home: str = "",
    idempotency_key: str | None = None,
) -> HandoverResult:
    """Re-run preflight + Salt ownership on the same endpoint (v2.3.1).

    Idempotency is recorded in the migration marker for Salt Control Job correlation.
    """
    assert_no_stub_hooks(hooks)
    marker_path = migration_marker_path(program_data)
    if marker_path.is_file():
        try:
            existing = json.loads(marker_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = {}
        if existing.get("status") == "COMPLETED":
            return HandoverResult(
                state="PRECHECK",
                ok=False,
                owner=existing.get("owner"),
                error="remigrate_requires_rollback",
                steps=["PRECHECK"],
            )
    result = migrate(
        hooks=hooks,
        program_data=program_data,
        endpoint_id=endpoint_id,
        hermes_home=hermes_home,
    )
    if result.ok and result.marker:
        marker_path = Path(result.marker)
        try:
            payload = json.loads(marker_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {}
        payload["status"] = "REMIGRATE_COMPLETED"
        payload["idempotency_key"] = idempotency_key
        payload["operation"] = "remigrate"
        atomic_write_json(marker_path, payload)
        result.steps = list(result.steps) + ["REMIGRATE"]
    return result
