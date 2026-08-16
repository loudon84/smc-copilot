from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from domain.ed25519util import canonical_json
from schemas.models import ActionStatus


class VerificationKind(StrEnum):
    APPLY = "apply"
    ROLLBACK = "rollback"


class VerificationDecision(StrEnum):
    HEALTHY = "HEALTHY"
    ROLLED_BACK = "ROLLED_BACK"
    FAILED = "FAILED"
    UNKNOWN_BLOCKED = "UNKNOWN_BLOCKED"
    CONFLICT = "CONFLICT"


@dataclass(frozen=True)
class TargetVerificationRecord:
    campaign_id: str
    client_id: str
    action_id: str
    kind: str
    action_result_digest: str
    parent_result_digest: str
    product_readback_digest: str
    inventory_digest: str
    gateway_evidence_ref: str
    work_evidence_ref: str
    desired_version: str
    desired_package: str
    desired_artifact: str
    desired_config: str
    desired_owner: str
    observed_version: str
    observed_package: str
    observed_artifact: str
    observed_config: str
    observed_owner: str
    observed_tasks: str
    observed_health: str
    decision: str
    reason: str
    observed_at: datetime
    expires_at: datetime
    canonical_digest: str


def verification_digest(payload: dict[str, str]) -> str:
    return hashlib.sha256(canonical_json(payload)).hexdigest()


def decide_verification(
    *,
    kind: str,
    result_status: ActionStatus | None,
    result_digest: str,
    inventory_expired: bool,
    inventory_digest: str,
    desired_version: str,
    desired_package: str,
    desired_artifact: str,
    desired_owner: str,
    observed_version: str,
    observed_package: str,
    observed_artifact: str,
    observed_owner: str,
    observed_tasks: str,
    gateway_healthy: bool,
    work_evidence_ref: str,
    product_installed: bool,
    product_absent: bool,
) -> tuple[str, str]:
    if inventory_expired or not inventory_digest:
        return VerificationDecision.UNKNOWN_BLOCKED.value, "stale_or_missing_inventory"
    if result_status is None or not result_digest:
        return VerificationDecision.UNKNOWN_BLOCKED.value, "missing_action_result"
    if result_status == ActionStatus.FAILED:
        return VerificationDecision.FAILED.value, "action_failed"
    if result_status != ActionStatus.SUCCEEDED:
        return VerificationDecision.UNKNOWN_BLOCKED.value, "action_not_final"
    if not work_evidence_ref:
        return VerificationDecision.UNKNOWN_BLOCKED.value, "missing_work_evidence"
    if not gateway_healthy:
        return VerificationDecision.UNKNOWN_BLOCKED.value, "gateway_unhealthy"
    if kind == VerificationKind.ROLLBACK.value:
        if product_absent and observed_owner.lower() in {"", "direct", "empty", "pending"}:
            return VerificationDecision.ROLLED_BACK.value, "absent_baseline"
        if product_installed and observed_owner == desired_owner and observed_artifact:
            return VerificationDecision.ROLLED_BACK.value, "installed_frozen_baseline"
        if not product_absent and not product_installed:
            return VerificationDecision.UNKNOWN_BLOCKED.value, "rollback_readback_incomplete"
        return VerificationDecision.FAILED.value, "rollback_mismatch"
    if observed_owner != desired_owner:
        return VerificationDecision.FAILED.value, "owner_conflict"
    if not product_installed:
        return VerificationDecision.UNKNOWN_BLOCKED.value, "product_readback_missing"
    if observed_version != desired_version or observed_package != desired_package:
        return VerificationDecision.FAILED.value, "version_mismatch"
    if observed_artifact != desired_artifact:
        return VerificationDecision.FAILED.value, "artifact_conflict"
    if not observed_tasks:
        return VerificationDecision.UNKNOWN_BLOCKED.value, "task_readback_missing"
    return VerificationDecision.HEALTHY.value, "verified"
