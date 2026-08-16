from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ActionRequestRow(Base):
    __tablename__ = "opsi_action_requests"

    request_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aggregate_version: Mapped[int] = mapped_column(Integer, default=0)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    hermes_version: Mapped[str] = mapped_column(String(64), default="")
    config_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_repair_level: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ActionTargetRow(Base):
    __tablename__ = "opsi_action_targets"
    __table_args__ = (UniqueConstraint("request_id", "client_id", name="uq_opsi_target_request_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("opsi_action_requests.request_id", ondelete="CASCADE"), index=True, nullable=False
    )
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_code: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    message: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    dispatched: Mapped[bool] = mapped_column(Boolean, default=False)
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    lease_owner: Mapped[str] = mapped_column(String(128), default="")
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    property_digest: Mapped[str] = mapped_column(String(64), default="")
    opsi_action: Mapped[str] = mapped_column(String(32), default="")
    opsi_modification_time: Mapped[str] = mapped_column(String(40), default="")
    last_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_sid: Mapped[str] = mapped_column(String(184), default="")
    user_account: Mapped[str] = mapped_column(String(128), default="")


class ActionResultRow(Base):
    __tablename__ = "opsi_action_results"
    __table_args__ = (UniqueConstraint("request_id", "client_id", name="uq_opsi_result_request_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("opsi_action_requests.request_id", ondelete="CASCADE"), index=True, nullable=False
    )
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    redacted: Mapped[bool] = mapped_column(Boolean, default=True)
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str] = mapped_column(String(64), default="")
    body_digest: Mapped[str] = mapped_column(String(64), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class DiagnosticRow(Base):
    __tablename__ = "opsi_diagnostics"
    __table_args__ = (UniqueConstraint("request_id", "client_id", name="uq_opsi_diag_request_client"),)

    request_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    issue_code: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    recommended_action: Mapped[str] = mapped_column(String(256), nullable=False)
    files_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    manifest_digest: Mapped[str] = mapped_column(String(64), default="")


class AuditRow(Base):
    __tablename__ = "opsi_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="")
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class PollCursorRow(Base):
    __tablename__ = "opsi_poll_cursors"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cursor: Mapped[str] = mapped_column(String(128), nullable=False, default="")


class ManagedPolicyRow(Base):
    __tablename__ = "opsi_managed_policies"

    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    request_id: Mapped[str] = mapped_column(String(80), default="")


class WorkerHeartbeatRow(Base):
    __tablename__ = "opsi_worker_heartbeats"

    worker_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RolloutCampaignRow(Base):
    __tablename__ = "opsi_rollout_campaigns"

    campaign_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    snapshot_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    client_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    product_id: Mapped[str] = mapped_column(String(64), nullable=False)
    product_version: Mapped[str] = mapped_column(String(64), nullable=False)
    package_version: Mapped[str] = mapped_column(String(32), nullable=False)
    artifact_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    signer_key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    config_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    gate_policy_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    evidence_policy_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    creator_id: Mapped[str] = mapped_column(String(128), nullable=False)
    change_ticket: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(256), nullable=False)
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pause_cause: Mapped[str] = mapped_column(String(64), default="")
    fencing_token: Mapped[int] = mapped_column(Integer, default=0)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    mode: Mapped[str] = mapped_column(String(16), default="pilot")
    mapping_digest: Mapped[str] = mapped_column(String(64), default="")
    freeze_revision: Mapped[int] = mapped_column(Integer, default=0)
    pilot_policy_revision: Mapped[str] = mapped_column(String(64), default="accelerated-v1.4")
    pilot_policy_digest: Mapped[str] = mapped_column(String(64), default="")
    production_policy_revision: Mapped[str] = mapped_column(String(64), default="")
    production_policy_digest: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RolloutBatchRow(Base):
    __tablename__ = "opsi_rollout_batches"
    __table_args__ = (UniqueConstraint("campaign_id", "batch_index", name="uq_opsi_rollout_batch"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("opsi_rollout_campaigns.campaign_id", ondelete="CASCADE"), nullable=False
    )
    batch_index: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    client_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    observe_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    dispatched: Mapped[bool] = mapped_column(Boolean, default=False)
    observe_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observe_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RolloutTargetRow(Base):
    __tablename__ = "opsi_rollout_targets"
    __table_args__ = (
        UniqueConstraint("campaign_id", "client_id", name="uq_opsi_rollout_target"),
        UniqueConstraint("client_id", "active_slot", name="uq_opsi_rollout_active_client"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("opsi_rollout_campaigns.campaign_id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    batch_index: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    preflight_json: Mapped[str] = mapped_column(Text, default="[]")
    preflight_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    action_id: Mapped[str] = mapped_column(String(80), default="")
    baseline_version: Mapped[str] = mapped_column(String(64), default="")
    baseline_digest: Mapped[str] = mapped_column(String(64), default="")
    baseline_owner: Mapped[str] = mapped_column(String(32), default="opsi")
    ineligible_reason: Mapped[str] = mapped_column(String(256), default="")
    mutated: Mapped[bool] = mapped_column(Boolean, default=False)
    active_slot: Mapped[str] = mapped_column(String(96), default="active")
    depot_id: Mapped[str] = mapped_column(String(128), default="")
    ring_index: Mapped[int] = mapped_column(Integer, default=0)
    healthy_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parent_action_id: Mapped[str] = mapped_column(String(80), default="")


class RolloutApprovalRow(Base):
    __tablename__ = "opsi_rollout_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    campaign_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RolloutGateRow(Base):
    __tablename__ = "opsi_rollout_gates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    gate_type: Mapped[str] = mapped_column(String(64), nullable=False)
    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str] = mapped_column(String(256), nullable=False)
    input_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    evaluator: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RolloutEventRow(Base):
    __tablename__ = "opsi_rollout_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    detail: Mapped[str] = mapped_column(String(512), default="")
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class ArtifactPromotionRow(Base):
    __tablename__ = "opsi_artifact_promotions"

    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    product_version: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    signer_key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    evidence_ref: Mapped[str] = mapped_column(String(256), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RolloutIdempotencyRow(Base):
    __tablename__ = "opsi_rollout_idempotency"
    __table_args__ = (UniqueConstraint("actor_id", "key", name="uq_opsi_rollout_idempotency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    command: Mapped[str] = mapped_column(String(32), nullable=False)
    campaign_id: Mapped[str] = mapped_column(String(80), nullable=False)
    body_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)


class RolloutOutboxRow(Base):
    __tablename__ = "opsi_rollout_outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class LiveGateRow(Base):
    __tablename__ = "opsi_live_gates"

    gate_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    evidence_ref: Mapped[str] = mapped_column(String(256), nullable=False)
    signed_by: Mapped[str] = mapped_column(String(128), nullable=False)
    immutable: Mapped[bool] = mapped_column(Boolean, default=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    signature: Mapped[str] = mapped_column(Text, default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    input_digest: Mapped[str] = mapped_column(String(64), default="")
    key_id: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RolloutDepotRow(Base):
    __tablename__ = "opsi_rollout_depots"
    __table_args__ = (UniqueConstraint("campaign_id", "depot_id", name="uq_opsi_rollout_depot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    depot_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    client_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    mapping_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    attestation_digest: Mapped[str] = mapped_column(String(64), default="")
    failure_count: Mapped[int] = mapped_column(Integer, default=0)


class RolloutRingRow(Base):
    __tablename__ = "opsi_rollout_rings"
    __table_args__ = (UniqueConstraint("campaign_id", "ring_index", name="uq_opsi_rollout_ring"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    ring_index: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    client_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    observe_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    observe_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observe_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DepotAttestationRow(Base):
    __tablename__ = "opsi_depot_attestations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    depot_id: Mapped[str] = mapped_column(String(128), nullable=False)
    product_id: Mapped[str] = mapped_column(String(64), nullable=False)
    product_version: Mapped[str] = mapped_column(String(64), nullable=False)
    package_version: Mapped[str] = mapped_column(String(32), nullable=False)
    artifact_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    issuer: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    signature: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_ref: Mapped[str] = mapped_column(String(256), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    algorithm: Mapped[str] = mapped_column(String(32), default="Ed25519")
    key_id: Mapped[str] = mapped_column(String(128), default="")
    envelope_digest: Mapped[str] = mapped_column(String(64), default="")
    signer_key_id: Mapped[str] = mapped_column(String(64), default="")
    readback_digest: Mapped[str] = mapped_column(String(64), default="")
    readback_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReleaseFreezeRow(Base):
    __tablename__ = "opsi_release_freezes"

    freeze_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    cause: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    cleared_by: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class FleetComplianceRow(Base):
    __tablename__ = "opsi_fleet_compliance"

    snapshot_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    digest: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RolloutLeaseRow(Base):
    __tablename__ = "opsi_rollout_leases"

    lease_key: Mapped[str] = mapped_column(String(160), primary_key=True)
    owner: Mapped[str] = mapped_column(String(128), nullable=False)
    lease_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fencing_token: Mapped[int] = mapped_column(Integer, default=0)


class EndpointBindingRow(Base):
    __tablename__ = "opsi_endpoint_bindings"

    client_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_sid: Mapped[str] = mapped_column(String(184), nullable=False)
    user_account: Mapped[str] = mapped_column(String(128), nullable=False)
    evidence_ref: Mapped[str] = mapped_column(String(256), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    approved_by: Mapped[str] = mapped_column(String(128), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(256), nullable=False)
    change_ticket: Mapped[str] = mapped_column(String(64), nullable=False)


class EndpointInventoryRow(Base):
    __tablename__ = "opsi_endpoint_inventory"

    client_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    os: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    last_seen_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    owner: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    disk_free_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    user_sid: Mapped[str] = mapped_column(String(184), nullable=False, default="")
    user_account: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    binding_source: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    binding_observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    gateway_healthy: Mapped[bool] = mapped_column(Boolean, default=False)
    previous_version: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    previous_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    depot_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    baseline_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="ABSENT")
    content_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    expiry: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cli_path: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    cli_version: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    bootstrap_task: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    gateway_task: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    trust_level: Mapped[str] = mapped_column(String(64), nullable=False, default="OPSI_AUTHENTICATED_CHECKSUM")
    evidence_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


class TargetVerificationRow(Base):
    __tablename__ = "opsi_target_verifications"
    __table_args__ = (
        UniqueConstraint("campaign_id", "client_id", "action_id", "kind", name="uq_opsi_target_verification"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    action_id: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    action_result_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    parent_result_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    product_readback_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    inventory_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    gateway_evidence_ref: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    work_evidence_ref: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    desired_version: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    desired_package: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    desired_artifact: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    desired_config: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    desired_owner: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    observed_version: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    observed_package: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    observed_artifact: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    observed_config: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    observed_owner: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    observed_tasks: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    observed_health: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    canonical_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")


class ControllerEvidenceRow(Base):
    __tablename__ = "opsi_controller_evidence"

    client_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    content_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)


class ResultAckRow(Base):
    __tablename__ = "opsi_result_acks"
    __table_args__ = (UniqueConstraint("request_id", "client_id", name="uq_opsi_result_ack"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    token: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
