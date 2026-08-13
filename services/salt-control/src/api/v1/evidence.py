from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter

from api.deps import RequestServicesDep
from core.auth import OperatorAuth
from schemas.common import CamelModel
from services.evidence_service import generate_bundle

router = APIRouter(prefix="/evidence", tags=["evidence"])


class EvidenceGenerateRequest(CamelModel):
    rollout_id: str
    git_commit: str | None = None
    root: str | None = None


def _secret_scan(payload: dict[str, Any]) -> int:
    blob = str(payload).lower()
    needles = ("password", "secret", "token", "api_key", "bearer ")
    return sum(blob.count(n) for n in needles)


@router.post("/bundles:generate")
async def generate_evidence(
    body: EvidenceGenerateRequest,
    services: RequestServicesDep,
    _auth: OperatorAuth,
) -> dict[str, Any]:
    record = await services.repos.rollouts.get(body.rollout_id)
    targets = await services.repos.rollouts.list_targets(body.rollout_id) if record else []
    jobs = await services.repos.rollout_target_jobs.list_for_rollout(body.rollout_id) if record else []
    incidents = await services.repos.control_plane_incidents.list_open(rollout_id=body.rollout_id)
    files = {
        "baseline": {"master": "192.168.102.104", "secondMaster": False, "status": "not_proven"},
        "target-snapshot": {
            "snapshotDigest": record.snapshot_digest if record else None,
            "targets": record.snapshot_json if record else [],
        },
        "approvals": {
            "approvals": [a.__dict__ for a in await services.repos.rollout_approvals.list_for_rollout(body.rollout_id)]
            if record
            else []
        },
        "batches": {"sizes": [1, 2, 2], "currentBatch": record.thresholds_json.get("currentBatch") if record else 0},
        "jobs": {"jobs": [j.__dict__ for j in jobs]},
        "job-returns": {"returns": []},
        "observations": {"windows": ["15m", "1h", "6h", "24h", "7d"]},
        "metrics": {"metrics": {}},
        "incidents": {"incidents": [i.__dict__ for i in incidents]},
        "rollback": {"events": []},
        "work-probes": {"probes": []},
        "secret-scan": {"findings": 0, "ok": True},
        "final-go-no-go": {"decision": "NO-GO", "status": "not_proven", "manualGate": True},
    }
    findings = sum(_secret_scan(v) for v in files.values())
    files["secret-scan"] = {
        "findings": findings,
        "ok": findings == 0,
        "status": "not_proven" if findings else "implemented",
    }
    if findings:
        files["final-go-no-go"]["blockedReason"] = "secret_scan_nonzero"
    root = Path(body.root) if body.root else Path(".")
    result = generate_bundle(
        root=root,
        rollout_id=body.rollout_id,
        git_commit=body.git_commit,
        snapshot_digest=record.snapshot_digest if record else None,
        release_id=record.version if record else None,
        config_revision=str((record.thresholds_json or {}).get("configRevision") or "") if record else None,
        files=files,
    )
    result["targetCount"] = len(targets)
    return result
