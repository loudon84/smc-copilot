from __future__ import annotations

from core.auth import digest_payload
from domain.snapshot import GATE_POLICY_VERSION
from schemas.rollout import TargetStatus

PAUSE_CAUSES = {
    "canary_failure",
    "checksum_mismatch",
    "false_success",
    "owner_conflict",
    "artifact_conflict",
    "secret_canary",
    "redaction_failure",
    "rollback_failure",
    "p0_p1",
    "gateway_availability",
    "work_reconnect",
    "readiness",
    "timeout_unknown",
    "injected_failure",
}


def evaluate_campaign_gates(*, targets: list, batch_index: int, pause_hint: str = "") -> tuple[str, str, str]:
    """Return (decision, cause, reason). decision is PASS or PAUSE."""
    batch_targets = [item for item in targets if item.batch_index == batch_index]
    for item in batch_targets:
        if item.status == TargetStatus.FAILED.value:
            cause = pause_hint or "canary_failure" if batch_index == 0 else "target_failure"
            if cause == "target_failure":
                cause = "canary_failure" if batch_index == 0 else "injected_failure"
            return "PAUSE", cause if cause in PAUSE_CAUSES else "canary_failure", f"target {item.client_id} failed"
        if item.ineligible_reason == "owner_conflict" or "owner_opsi" in (item.ineligible_reason or ""):
            return "PAUSE", "owner_conflict", "owner conflict"
        if "secret" in (item.ineligible_reason or ""):
            return "PAUSE", "secret_canary", "secret canary"
    if pause_hint in PAUSE_CAUSES:
        return "PAUSE", pause_hint, pause_hint
    return "PASS", "", "ok"


def gate_input_digest(payload: dict) -> str:
    return digest_payload({"evaluator": GATE_POLICY_VERSION, **payload})
