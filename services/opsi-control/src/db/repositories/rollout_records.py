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
    baseline_owner: str = "opsi"
    ineligible_reason: str = ""
    mutated: bool = False
    active_slot: str = "active"


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
