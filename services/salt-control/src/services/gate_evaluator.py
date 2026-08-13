"""Ring 0 SLO / security gate evaluator (v2.4.1)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from db.repositories.interfaces import RepositoryBundle

WINDOW_SECONDS = {"15m": 900, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}


def gate_digest(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


async def evaluate_rollout(repos: RepositoryBundle, rollout_id: str) -> dict[str, Any]:
    record = await repos.rollouts.get(rollout_id)
    if record is None:
        return {"ok": False, "reason": "rollout_not_found", "gates": {}}
    incidents = await repos.control_plane_incidents.list_open(rollout_id=rollout_id)
    p0 = [i for i in incidents if i.severity == "P0"]
    p1 = [i for i in incidents if i.severity == "P1"]
    security_codes = {
        "SECRET_LEAK",
        "SIGNATURE_BYPASS",
        "OWNER_CONFLICT",
        "DUPLICATE_PUBLISH",
        "RETURN_IDENTITY_MISMATCH",
    }
    security = [i for i in incidents if i.code in security_codes]
    observations = await repos.rollout_observations.list_for_rollout(rollout_id, window="15m")
    latest = observations[-1].payload_json if observations else {}
    master_ok = bool(latest.get("masterAvailable", True))
    gateway_ok = str(latest.get("gatewayHealth") or "unknown") not in {"failed", "unhealthy"}
    work_ok = bool(latest.get("workProbeOk", True))
    gates = {
        "p0": len(p0) == 0,
        "p1": len(p1) == 0,
        "security": len(security) == 0,
        "master": master_ok,
        "gateway": gateway_ok,
        "workProbe": work_ok,
    }
    ok = all(gates.values())
    payload = {
        "ok": ok,
        "gates": gates,
        "p0Count": len(p0),
        "p1Count": len(p1),
        "evaluatedAt": datetime.now(UTC).isoformat(),
        "rolloutId": rollout_id,
        "state": record.state,
    }
    payload["digest"] = gate_digest(payload)
    return payload
