"""Experience fingerprinting and quality scoring (PRD v1.6 FR-1003 / FR-1004)."""

from __future__ import annotations

import hashlib
import json
from typing import Any


AUTO_EVIDENCE_EVENTS = frozenset(
    {
        "task.completed",
        "task.failed",
        "approval.resolved",
        "user.correction",
        "artifact.created",
        "tool.failed",
        "runtime.recovery.completed",
    }
)

EVENT_TO_EVIDENCE_TYPE = {
    "task.completed": "workflow_trace",
    "task.failed": "failure_lesson",
    "approval.resolved": "approval_pattern",
    "user.correction": "correction",
    "artifact.created": "tool_recipe",
    "tool.failed": "failure_lesson",
    "runtime.recovery.completed": "workflow_trace",
}

CANDIDATE_QUALITY_THRESHOLD = 0.55


def evidence_fingerprint(
    *,
    evidence_type: str,
    steps: list[str] | None = None,
    tool_sequence: list[str] | None = None,
    approval_decisions: list[str] | None = None,
    error_code: str | None = None,
    repair_result: str | None = None,
) -> str:
    payload = {
        "type": evidence_type,
        "steps": steps or [],
        "tools": tool_sequence or [],
        "approvals": approval_decisions or [],
        "error": error_code or "",
        "repair": repair_result or "",
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def quality_score(
    *,
    repeat_count: int = 1,
    successful_reuse_count: int = 0,
    user_confirmation: int = 0,
    result_quality: float = 0.5,
    policy_compliance: float = 1.0,
    failure_rate: float = 0.0,
) -> float:
    # Weighted heuristic — only high enough scores suggest Candidates
    score = (
        0.15 * min(1.0, repeat_count / 5)
        + 0.2 * min(1.0, successful_reuse_count / 3)
        + 0.2 * min(1.0, user_confirmation / 2)
        + 0.25 * max(0.0, min(1.0, result_quality))
        + 0.15 * max(0.0, min(1.0, policy_compliance))
        + 0.05 * (1.0 - max(0.0, min(1.0, failure_rate)))
    )
    return round(score, 4)


def should_suggest_candidate(score: float, *, threshold: float = CANDIDATE_QUALITY_THRESHOLD) -> bool:
    return score >= threshold


def provenance_payload(
    *,
    task_id: str | None,
    run_id: str | None,
    sequence_start: int | None,
    sequence_end: int | None,
    artifact_ids: list[str] | None = None,
    profile_version: str | None = None,
    skill_versions: list[str] | None = None,
    tool_names: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "runId": run_id,
        "eventSequenceRange": [sequence_start, sequence_end],
        "artifactIds": artifact_ids or [],
        "profileVersion": profile_version,
        "skillVersions": skill_versions or [],
        "toolNames": tool_names or [],
    }
