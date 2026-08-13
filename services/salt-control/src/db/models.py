from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Endpoint(Base):
    __tablename__ = "endpoints"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    machine_guid_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str] = mapped_column(String(64), nullable=False, default="windows")
    arch: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="enrolling")
    device_credential_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EndpointUserBinding(Base):
    __tablename__ = "endpoint_user_bindings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    windows_account: Mapped[str] = mapped_column(String(255), nullable=False)
    windows_sid: Mapped[str] = mapped_column(String(128), nullable=False)
    profile_dir: Mapped[str] = mapped_column(String(512), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    revision: Mapped[str] = mapped_column(String(64), nullable=False)
    bound_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    local_fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    master_fingerprints: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EnrollmentToken(Base):
    """One-time enrollment tokens — store hash only (v2.3)."""

    __tablename__ = "enrollment_tokens"

    token_hash: Mapped[str] = mapped_column(String(128), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    response_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    request_digest: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EndpointOperation(Base):
    __tablename__ = "endpoint_operations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    enrollment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OperationStep(Base):
    __tablename__ = "operation_steps"
    __table_args__ = (UniqueConstraint("operation_id", "step_name", name="uq_operation_step"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    step_name: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    salt_jid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_redacted: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)


class DesiredStateRevision(Base):
    __tablename__ = "desired_state_revisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    revision: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    source_revision: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class JobReturn(Base):
    __tablename__ = "job_returns"
    __table_args__ = (UniqueConstraint("jid", "endpoint_id", "function", name="uq_job_return"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    jid: Mapped[str] = mapped_column(String(64), nullable=False)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False)
    function: Mapped[str] = mapped_column(String(255), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    payload_redacted: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ArtifactManifest(Base):
    __tablename__ = "artifact_manifests"
    __table_args__ = (UniqueConstraint("component", "version", "platform", "arch", name="uq_artifact_manifest"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    component: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    platform: Mapped[str] = mapped_column(String(64), nullable=False)
    arch: Mapped[str] = mapped_column(String(32), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(128), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    manifest_signature: Mapped[str] = mapped_column(Text, nullable=False)
    key_id: Mapped[str] = mapped_column(String(128), nullable=False)
    rollback_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Rollout(Base):
    __tablename__ = "rollouts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    component: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    ring: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="created")
    thresholds_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    observation_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    failure_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rollback_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    p0_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    p1_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    snapshot_digest: Mapped[str | None] = mapped_column(String(128), nullable=True)
    snapshot_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    batch_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    state_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    batch_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    batch_observation_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_observation_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_observation_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RolloutTarget(Base):
    __tablename__ = "rollout_targets"
    __table_args__ = (UniqueConstraint("rollout_id", "endpoint_id", name="uq_rollout_target"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rollout_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    batch_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    state_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    state_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observing_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str] = mapped_column(String(128), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_redacted: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ControlJob(Base):
    """Salt control-plane job with atomic claim/lease ownership (v2.3.1)."""

    __tablename__ = "control_jobs"
    __table_args__ = (UniqueConstraint("salt_jid", name="uq_control_job_salt_jid"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    minion_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    config_revision: Mapped[str | None] = mapped_column(String(64), nullable=True)
    release_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    requested_by: Mapped[str] = mapped_column(String(128), nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    claim_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    salt_jid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expected_function: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result_digest: Mapped[str | None] = mapped_column(String(128), nullable=True)
    result_redacted: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    result_schema_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    result_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    result_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reconcile_ttl_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=3600)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SecretScope(Base):
    """Idempotent secret scope binding — no secret values stored (v2.3.1)."""

    __tablename__ = "secret_scopes"
    __table_args__ = (UniqueConstraint("tenant_id", "endpoint_id", "scope_type", "scope_key", name="uq_secret_scope"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scope_type: Mapped[str] = mapped_column(String(64), nullable=False)
    scope_key: Mapped[str] = mapped_column(String(128), nullable=False)
    secret_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False, default="1")
    checksum_redacted: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RolloutApproval(Base):
    __tablename__ = "rollout_approvals"
    __table_args__ = (UniqueConstraint("rollout_id", "stage", "role", name="uq_rollout_approval_stage_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rollout_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    subject: Mapped[str] = mapped_column(String(128), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    snapshot_digest: Mapped[str] = mapped_column(String(128), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default="deploy")
    role_source: Mapped[str] = mapped_column(String(64), nullable=False, default="oidc")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RolloutObservation(Base):
    __tablename__ = "rollout_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rollout_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    window: Mapped[str] = mapped_column(String(16), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EndpointObservation(Base):
    __tablename__ = "endpoint_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    window: Mapped[str] = mapped_column(String(16), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ControlPlaneIncident(Base):
    __tablename__ = "control_plane_incidents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    rollout_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    endpoint_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_redacted: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RolloutTargetJob(Base):
    __tablename__ = "rollout_target_jobs"
    __table_args__ = (
        UniqueConstraint(
            "rollout_id",
            "endpoint_id",
            "batch_index",
            "operation",
            "attempt",
            name="uq_rollout_target_batch_op_attempt",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rollout_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False)
    batch_index: Mapped[int] = mapped_column(Integer, nullable=False)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    operation: Mapped[str] = mapped_column(String(64), nullable=False, default="handover")
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expected_function: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EvidenceBundle(Base):
    __tablename__ = "evidence_bundles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    rollout_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    manifest_digest: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_proven")
    signer: Mapped[str | None] = mapped_column(String(128), nullable=True)
    archive_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EndpointFactSample(Base):
    __tablename__ = "endpoint_fact_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="observer")
