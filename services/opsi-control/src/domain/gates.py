from __future__ import annotations

from datetime import UTC, datetime, timedelta

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
    "mapping_drift",
    "attestation_mismatch",
    "global_freeze",
    "depot_circuit",
}

CRITICAL_CAUSES = {
    "secret_canary",
    "owner_conflict",
    "artifact_conflict",
    "false_success",
    "rollback_failure",
    "p0_p1",
    "checksum_mismatch",
}


def evaluate_campaign_gates(
    *,
    targets: list,
    batch_index: int,
    pause_hint: str = "",
    ring_index: int | None = None,
    failure_window: list[datetime] | None = None,
    now: datetime | None = None,
) -> tuple[str, str, str]:
    """Return (decision, cause, reason). decision is PASS, PAUSE, or FREEZE."""
    batch_targets = [item for item in targets if item.batch_index == batch_index]
    ring = ring_index if ring_index is not None else batch_index
    failed = [item for item in batch_targets if item.status == TargetStatus.FAILED.value]
    if pause_hint in CRITICAL_CAUSES:
        return "FREEZE", pause_hint, pause_hint
    for item in batch_targets:
        reason = item.ineligible_reason or ""
        if "secret" in reason:
            return "FREEZE", "secret_canary", "secret canary"
        if item.ineligible_reason == "owner_conflict" or "owner_opsi" in reason:
            return "FREEZE", "owner_conflict", "owner conflict"
    if failed:
        if ring == 0:
            return "PAUSE", "canary_failure", f"ring0 {failed[0].client_id} failed"
        current = now or datetime.now(UTC)
        window = failure_window or []
        recent = [stamp for stamp in window if current - stamp <= timedelta(minutes=10)]
        failure_rate = len(failed) / max(1, len(batch_targets))
        if len(failed) >= 2 or len(recent) >= 3 or failure_rate > 0.02:
            return "PAUSE", "injected_failure", "depot/campaign failure budget exceeded"
        return "PAUSE", "depot_circuit", f"depot lane paused after {failed[0].client_id}"
    if pause_hint in PAUSE_CAUSES:
        decision = "FREEZE" if pause_hint in CRITICAL_CAUSES else "PAUSE"
        return decision, pause_hint, pause_hint
    return "PASS", "", "ok"


def gate_input_digest(payload: dict) -> str:
    return digest_payload({"evaluator": GATE_POLICY_VERSION, **payload})
