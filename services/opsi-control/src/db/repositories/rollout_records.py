from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class CampaignRecord:
    campaign_id: str
    name: str
    status: str
    revision: int
    snapshot_digest: str
    client_ids: list[str]
    product_id: str
    product_version: str
    package_version: str
    artifact_digest: str
    signer_key_id: str
    config_revision: int
    gate_policy_revision: int
    evidence_policy_revision: int
    creator_id: str
    change_ticket: str
    reason: str
    window_start: datetime | None = None
    window_end: datetime | None = None
    pause_cause: str = ""
    fencing_token: int = 0
    mode: str = "pilot"
    mapping_digest: str = ""
    freeze_revision: int = 0
    pilot_policy_revision: str = "accelerated-v1.4"
    pilot_policy_digest: str = ""
    production_policy_revision: str = ""
    production_policy_digest: str = ""
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
    payload_json: str = "{}"


@dataclass
class BatchRecord:
    campaign_id: str
    batch_index: int
    status: str
    client_ids: list[str]
    observe_hours: int
    approved: bool = False
    dispatched: bool = False
    observe_until: datetime | None = None
    observe_started_at: datetime | None = None


@dataclass
class RolloutTargetRecord:
    campaign_id: str
    client_id: str
    batch_index: int
    status: str
    preflight_json: str = "[]"
    preflight_at: datetime | None = None
    action_id: str = ""
    baseline_version: str = ""
    baseline_digest: str = ""
    baseline_owner: str = ""
    ineligible_reason: str = ""
    mutated: bool = False
    active_slot: str = "active"
    depot_id: str = ""
    ring_index: int = 0
    healthy_at: datetime | None = None
    parent_action_id: str = ""


@dataclass
class ApprovalRecord:
    id: int
    campaign_id: str
    kind: str
    actor_id: str
    role: str
    campaign_revision: int
    reason: str
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class GateRecord:
    id: int
    campaign_id: str
    gate_type: str
    decision: str
    reason: str
    input_digest: str
    evaluator: str
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class EventRecord:
    id: int
    campaign_id: str
    event: str
    actor_id: str
    detail: str
    payload_json: str = "{}"
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class PromotionRecord:
    digest: str
    product_version: str
    signer_key_id: str
    channel: str
    evidence_ref: str
    actor_id: str
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class IdempotencyRecord:
    key: str
    actor_id: str
    command: str
    campaign_id: str
    body_digest: str
    response_json: str


@dataclass
class OutboxRecord:
    id: int
    campaign_id: str
    kind: str
    payload_json: str
    published: bool = False
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class LiveGateRecord:
    gate_id: str
    decision: str
    evidence_ref: str
    signed_by: str
    created_at: datetime = field(default_factory=utcnow)
    immutable: bool = True
    payload_json: str = "{}"
    signature: str = ""
    expires_at: datetime | None = None
    revoked: bool = False
    input_digest: str = ""
    key_id: str = ""


@dataclass
class DepotLaneRecord:
    campaign_id: str
    depot_id: str
    status: str
    client_ids: list[str]
    mapping_digest: str
    timezone: str = "UTC"
    attestation_digest: str = ""
    failure_count: int = 0


@dataclass
class RingRecord:
    campaign_id: str
    ring_index: int
    status: str
    client_ids: list[str]
    observe_hours: int
    approved: bool = False
    observe_until: datetime | None = None
    observe_started_at: datetime | None = None


@dataclass
class AttestationRecord:
    depot_id: str
    product_id: str
    product_version: str
    package_version: str
    artifact_digest: str
    issuer: str
    generated_at: datetime
    expires_at: datetime
    signature: str
    evidence_ref: str
    revoked: bool = False
    algorithm: str = "Ed25519"
    key_id: str = ""
    envelope_digest: str = ""
    signer_key_id: str = ""
    readback_digest: str = ""
    readback_observed_at: datetime | None = None


@dataclass
class FreezeRecord:
    freeze_id: str
    revision: int
    active: bool
    cause: str
    actor_id: str
    created_at: datetime = field(default_factory=utcnow)
    cleared_by: str = ""


@dataclass
class ComplianceSnapshotRecord:
    snapshot_id: str
    campaign_id: str
    payload_json: str
    digest: str
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class TargetVerificationStoreRecord:
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
