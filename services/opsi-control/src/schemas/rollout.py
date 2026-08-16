from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import Field, field_validator, model_validator

from domain.policy import resolve_pilot_policy, resolve_production_policy
from schemas.models import CamelModel


class CampaignMode(StrEnum):
    PILOT = "pilot"
    PRODUCTION = "production"


class CampaignStatus(StrEnum):
    DRAFT = "DRAFT"
    PREFLIGHTING = "PREFLIGHTING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    OBSERVING = "OBSERVING"
    ROLLING_BACK = "ROLLING_BACK"
    SUCCEEDED = "SUCCEEDED"
    ABORTED = "ABORTED"
    FAILED = "FAILED"


TERMINAL_CAMPAIGN = {CampaignStatus.SUCCEEDED, CampaignStatus.ABORTED, CampaignStatus.FAILED}
ACTIVE_CAMPAIGN = {
    CampaignStatus.DRAFT,
    CampaignStatus.PREFLIGHTING,
    CampaignStatus.AWAITING_APPROVAL,
    CampaignStatus.RUNNING,
    CampaignStatus.PAUSED,
    CampaignStatus.OBSERVING,
    CampaignStatus.ROLLING_BACK,
}


class BatchStatus(StrEnum):
    PENDING = "PENDING"
    READY = "READY"
    DISPATCHING = "DISPATCHING"
    VERIFYING = "VERIFYING"
    OBSERVING = "OBSERVING"
    PASSED = "PASSED"
    FAILED = "FAILED"
    PAUSED = "PAUSED"
    ROLLED_BACK = "ROLLED_BACK"


class DepotLaneStatus(StrEnum):
    UNATTESTED = "UNATTESTED"
    READY = "READY"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    OBSERVING = "OBSERVING"
    PASSED = "PASSED"
    BLOCKED = "BLOCKED"
    ROLLING_BACK = "ROLLING_BACK"
    FAILED = "FAILED"


class TargetStatus(StrEnum):
    PENDING = "PENDING"
    PREFLIGHT_READY = "PREFLIGHT_READY"
    INELIGIBLE = "INELIGIBLE"
    DISPATCHED = "DISPATCHED"
    APPLYING = "APPLYING"
    VERIFYING = "VERIFYING"
    HEALTHY = "HEALTHY"
    FAILED = "FAILED"
    ROLLBACK_QUEUED = "ROLLBACK_QUEUED"
    ROLLBACK_APPLYING = "ROLLBACK_APPLYING"
    ROLLBACK_VERIFYING = "ROLLBACK_VERIFYING"
    ROLLED_BACK = "ROLLED_BACK"
    ROLLBACK_FAILED = "ROLLBACK_FAILED"
    UNKNOWN_BLOCKED = "UNKNOWN_BLOCKED"
    SKIPPED = "SKIPPED"


class ArtifactChannel(StrEnum):
    TESTING = "testing"
    PILOT = "pilot"
    STABLE = "stable"
    QUARANTINED = "quarantined"


class RolloutRole(StrEnum):
    RELEASE_OWNER = "release_owner"
    ENDPOINT_OPS = "endpoint_ops"
    SECURITY_OWNER = "security_owner"
    SITE_OWNER = "site_owner"
    INCIDENT_COMMANDER = "incident_commander"


class RollbackScope(StrEnum):
    TARGET = "target"
    BATCH = "batch"
    DEPOT = "depot"
    RING = "ring"
    CAMPAIGN = "campaign"


class ApprovalKind(StrEnum):
    START = "start"
    NEXT_BATCH = "next_batch"
    NEXT_RING = "next_ring"
    RESUME = "resume"
    ROLLBACK_EXPAND = "rollback_expand"
    PROMOTE = "promote"
    FREEZE_CLEAR = "freeze_clear"
    DEPOT_RESUME = "depot_resume"


class CommandBase(CamelModel):
    reason: str = Field(min_length=3, max_length=256)
    change_ticket: str = Field(min_length=3, max_length=64)
    actor: str | None = None
    role: str | None = None

    @model_validator(mode="after")
    def _reject_forged_actor(self) -> CommandBase:
        if self.actor is not None or self.role is not None:
            raise ValueError("actor/role must not be supplied in the body")
        return self


class RolloutCreateRequest(CommandBase):
    schema_: Literal["smc.opsi.rollout-campaign.v1"] = Field(default="smc.opsi.rollout-campaign.v1", alias="schema")
    campaign_id: str = Field(min_length=12, max_length=80, pattern=r"^cmp_[A-Za-z0-9_-]{8,64}$")
    name: str = Field(min_length=3, max_length=128)
    mode: CampaignMode = CampaignMode.PILOT
    client_ids: list[str] = Field(min_length=2, max_length=500)
    product_id: str = "smc-hermes-agent"
    product_version: str = Field(min_length=1, max_length=64)
    package_version: str = Field(min_length=1, max_length=32)
    artifact_digest: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    signer_key_id: str = Field(min_length=1, max_length=64)
    config_revision: int = Field(ge=1, le=1_000_000)
    gate_policy_revision: int = Field(default=1, ge=1)
    evidence_policy_revision: int = Field(default=1, ge=1)
    pilot_policy_revision: str = "accelerated-v1.4"
    production_policy_revision: str = "controlled-reentry-v1.5"
    window_start: datetime | None = None
    window_end: datetime | None = None

    @field_validator("client_ids")
    @classmethod
    def _ids(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item.strip()]
        if len(cleaned) != len(set(cleaned)):
            raise ValueError("client_ids must be unique")
        return cleaned

    @model_validator(mode="after")
    def _mode_bounds(self) -> RolloutCreateRequest:
        count = len(self.client_ids)
        if self.mode == CampaignMode.PRODUCTION:
            policy = resolve_production_policy(self.production_policy_revision)
            if count < policy.min_targets or count > policy.max_targets:
                raise ValueError(
                    f"production policy {policy.revision} requires {policy.min_targets}-{policy.max_targets} endpoints"
                )
        if self.mode == CampaignMode.PILOT:
            policy = resolve_pilot_policy(self.pilot_policy_revision)
            if count < policy.min_targets or count > policy.max_targets:
                raise ValueError(
                    f"pilot policy {policy.revision} requires {policy.min_targets}-{policy.max_targets} endpoints"
                )
        return self


class PreflightRequest(CommandBase):
    pass


class ApproveRequest(CommandBase):
    kind: ApprovalKind = ApprovalKind.START


class StartRequest(CommandBase):
    pass


class PauseRequest(CommandBase):
    cause: str = Field(min_length=3, max_length=64)


class ResumeRequest(CommandBase):
    pass


class AbortRequest(CommandBase):
    rollback_mutated: bool = False


class RollbackRequest(CommandBase):
    scope: RollbackScope
    client_id: str | None = None
    batch_index: int | None = Field(default=None, ge=0, le=500)
    depot_id: str | None = None
    ring_index: int | None = Field(default=None, ge=0, le=4)


class ArtifactPromoteRequest(CommandBase):
    schema_: Literal["smc.opsi.artifact-promotion.v1"] = Field(default="smc.opsi.artifact-promotion.v1", alias="schema")
    product_version: str
    digest: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    signer_key_id: str
    from_channel: ArtifactChannel = ArtifactChannel.TESTING
    to_channel: ArtifactChannel = ArtifactChannel.PILOT
    evidence_ref: str = Field(min_length=3, max_length=256)


class DepotAttestationRequest(CommandBase):
    depot_id: str = Field(min_length=3, max_length=128)
    product_id: str = "smc-hermes-agent"
    product_version: str
    package_version: str
    artifact_digest: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    issuer: str = Field(min_length=3, max_length=64)
    generated_at: datetime
    expires_at: datetime
    signature: str = Field(min_length=32, max_length=4096)
    evidence_ref: str = Field(min_length=3, max_length=256)
    algorithm: str = "Ed25519"
    key_id: str = ""
    envelope_digest: str = Field(default="", pattern=r"^$|^[a-fA-F0-9]{64}$")
    signer_key_id: str = ""
    readback_digest: str = Field(default="", pattern=r"^$|^[a-fA-F0-9]{64}$")
    readback_observed_at: datetime | None = None


class ReleaseFreezeRequest(CommandBase):
    freeze_id: str = Field(min_length=8, max_length=80, pattern=r"^frz_[A-Za-z0-9_-]{4,64}$")
    cause: str = Field(min_length=3, max_length=64)


class FreezeClearRequest(CommandBase):
    root_cause_closed: bool = True


class DepotPauseRequest(CommandBase):
    cause: str = Field(min_length=3, max_length=64)


class PreflightCheckView(CamelModel):
    code: str
    passed: bool
    detail: str = ""


class RolloutTargetView(CamelModel):
    client_id: str
    status: TargetStatus
    batch_index: int
    depot_id: str | None = None
    ring_index: int | None = None
    preflight: list[PreflightCheckView] = Field(default_factory=list)
    action_id: str | None = None
    baseline_version: str | None = None
    baseline_digest: str | None = None
    ineligible_reason: str | None = None


class RolloutBatchView(CamelModel):
    batch_index: int
    status: BatchStatus
    client_ids: list[str]
    observe_hours: int
    approved: bool = False
    observe_until: datetime | None = None
    observe_started_at: datetime | None = None


class DepotLaneView(CamelModel):
    depot_id: str
    status: DepotLaneStatus
    client_count: int
    mapping_digest: str
    timezone: str = "UTC"


class RingView(CamelModel):
    ring_index: int
    status: BatchStatus
    client_ids: list[str]
    observe_hours: int
    approved: bool = False
    observe_until: datetime | None = None
    observe_started_at: datetime | None = None


class RolloutApprovalView(CamelModel):
    kind: ApprovalKind
    actor_id: str
    role: RolloutRole
    campaign_revision: int
    reason: str
    created_at: datetime


class RolloutCampaignView(CamelModel):
    campaign_id: str
    name: str
    status: CampaignStatus
    mode: CampaignMode = CampaignMode.PILOT
    revision: int
    snapshot_digest: str
    mapping_digest: str | None = None
    client_count: int
    product_version: str
    artifact_digest: str
    pause_cause: str | None = None
    batches: list[RolloutBatchView]
    created_at: datetime
    updated_at: datetime


class EvidenceManifestView(CamelModel):
    schema_: Literal[
        "smc.opsi.evidence-manifest.v1", "smc.opsi.evidence-manifest.v2", "smc.opsi.evidence-manifest.v3"
    ] = Field(default="smc.opsi.evidence-manifest.v3", alias="schema")
    campaign_id: str
    snapshot_digest: str
    artifact_digest: str
    gate_policy_revision: int
    verification: Literal["implemented", "verified", "proven"] = "implemented"
    decision: Literal["GO", "NO-GO"] = "NO-GO"
    sha256: str
    producer: str = "opsi-control"
    timestamp: datetime
    events: int
    redacted: bool = True
    mapping_digest: str | None = None
    freeze_revision: int = 0
    verification_count: int = 0
    production_policy_revision: str | None = None
    live_gate_id: str | None = None


class MetricsView(CamelModel):
    campaigns_by_status: dict[str, int]
    batches_by_status: dict[str, int]
    targets_by_status: dict[str, int]
    pause_causes: dict[str, int]
    dispatch_success: int
    dispatch_failure: int
    rollback_success: int
    rollback_failure: int
    unpublished_outbox: int = 0
    freeze_active: bool = False


class CursorPage(CamelModel):
    items: list[dict]
    next_cursor: str | None = None


class FreezeView(CamelModel):
    freeze_id: str
    revision: int
    active: bool
    cause: str
    actor_id: str


class ComplianceView(CamelModel):
    client_id: str
    depot_id: str
    status: str
    observed_at: datetime
    digest: str
    critical: bool = False
    source_digest: str | None = None


class LiveGateApproval(CamelModel):
    role: str
    key_id: str
    signature: str


class LiveGateImportRequest(CamelModel):
    schema_: Literal["smc.opsi.live-gate.v1"] = Field(default="smc.opsi.live-gate.v1", alias="schema")
    gate_id: str = Field(min_length=8, max_length=80)
    decision: Literal["GO", "NO-GO"] = "NO-GO"
    evidence_ref: str = Field(min_length=3, max_length=256)
    expires_at: datetime
    input_digest: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    payload: dict
    approvals: list[LiveGateApproval]


class LiveGateRevokeRequest(CamelModel):
    reason: str = Field(min_length=3, max_length=256)
    change_ticket: str = Field(min_length=3, max_length=64)


class LiveGateView(CamelModel):
    gate_id: str
    decision: str
    evidence_ref: str
    signed_by: str
    expires_at: datetime | None = None
    revoked: bool = False
    input_digest: str = ""
    immutable: bool = True
