#!/usr/bin/env python3
"""Classification Correction Window for adaptive governance (v5.0.6).

States: PROVISIONAL → FROZEN / ESCALATED.
Before first production write (PROVISIONAL), FULL→LEAN is allowed with
CLASSIFICATION_CORRECTION. After FROZEN, FULL→LEAN is forbidden; LEAN→FULL
(escalation) remains allowed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

SCHEMA = "smc.ges.classification-state.v1"
STATES = frozenset({"PROVISIONAL", "FROZEN", "ESCALATED"})
PROFILES = frozenset({"NONE", "LEAN", "FULL"})


def _utc() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def state_path(repo: Path, work_item_id: str) -> Path:
    return repo / ".smc" / "runs" / work_item_id / "routing" / "classification-state.json"


def load_state(repo: Path, work_item_id: str) -> dict[str, Any]:
    path = state_path(repo, work_item_id)
    if not path.is_file():
        return {
            "schema": SCHEMA,
            "work_item_id": work_item_id,
            "state": "PROVISIONAL",
            "governance_profile": None,
            "history": [],
            "updated_at": None,
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != SCHEMA:
        raise ValueError("CLASSIFICATION_STATE_INVALID")
    return data


def save_state(repo: Path, data: dict[str, Any]) -> Path:
    # @lat: [[frontend-context#Classification Correction]]
    out = state_path(repo, str(data.get("work_item_id") or "unknown"))
    out.parent.mkdir(parents=True, exist_ok=True)
    data = dict(data)
    data["schema"] = SCHEMA
    data["updated_at"] = _utc()
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return out


def can_transition(current_profile: str | None, new_profile: str, state: str) -> tuple[bool, str]:
    """Return (allowed, reason_code)."""
    if new_profile not in PROFILES:
        return False, "CLASSIFICATION_PROFILE_INVALID"
    if state not in STATES:
        return False, "CLASSIFICATION_STATE_INVALID"
    if current_profile is None or current_profile == new_profile:
        return True, "CLASSIFICATION_UNCHANGED" if current_profile == new_profile else "CLASSIFICATION_SET"
    order = {"NONE": 0, "LEAN": 1, "FULL": 2}
    cur = order.get(current_profile, -1)
    nxt = order.get(new_profile, -1)
    if nxt > cur:
        return True, "CLASSIFICATION_ESCALATION"
    # Downgrade
    if state == "PROVISIONAL":
        return True, "CLASSIFICATION_CORRECTION"
    return False, "CLASSIFICATION_DOWNGRADE_DENIED"


# Alias retained for one release (v5.0.8 C31).
CLASSIFICATION_DOWNGRADE_FORBIDDEN = "CLASSIFICATION_DOWNGRADE_DENIED"


def apply_profile(
    repo: Path,
    work_item_id: str,
    new_profile: str,
    *,
    evidence: str = "",
    risk_facts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = load_state(repo, work_item_id)
    ok, code = can_transition(data.get("governance_profile"), new_profile, data.get("state") or "PROVISIONAL")
    if not ok:
        raise ValueError(code)
    entry = {
        "at": _utc(),
        "from": data.get("governance_profile"),
        "to": new_profile,
        "reason": code,
        "evidence": evidence[:500],
        "risk_facts": risk_facts or {},
    }
    data["history"] = list(data.get("history") or []) + [entry]
    data["governance_profile"] = new_profile
    if code == "CLASSIFICATION_ESCALATION" and new_profile == "FULL":
        data["state"] = "ESCALATED"
    save_state(repo, data)
    return data


def freeze(repo: Path, work_item_id: str, reason: str = "first_production_write") -> dict[str, Any]:
    """Freeze classification after first production write / todo completion."""
    data = load_state(repo, work_item_id)
    if data.get("state") == "FROZEN":
        return data
    data["state"] = "FROZEN"
    data["history"] = list(data.get("history") or []) + [
        {"at": _utc(), "event": "FREEZE", "reason": reason}
    ]
    save_state(repo, data)
    return data


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("show")
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--work-item-id", required=True)
    p = sub.add_parser("set")
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--work-item-id", required=True)
    p.add_argument("--profile", choices=sorted(PROFILES), required=True)
    p.add_argument("--evidence", default="")
    p = sub.add_parser("freeze")
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--work-item-id", required=True)
    a = ap.parse_args()
    if a.cmd == "show":
        print(json.dumps(load_state(a.repo.resolve(), a.work_item_id), indent=2))
        return 0
    if a.cmd == "set":
        print(json.dumps(apply_profile(a.repo.resolve(), a.work_item_id, a.profile, evidence=a.evidence), indent=2))
        return 0
    print(json.dumps(freeze(a.repo.resolve(), a.work_item_id), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
