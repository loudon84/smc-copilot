from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol


@dataclass
class EndpointRecord:
    id: str
    tenant_id: str
    machine_guid_hash: str
    hostname: str
    platform: str
    arch: str
    status: str
    device_credential_hash: str
    created_at: datetime
    last_seen_at: datetime | None = None


@dataclass
class BindingRecord:
    endpoint_id: str
    user_id: str
    windows_account: str
    windows_sid: str
    profile_dir: str
    active: bool
    revision: str
    bound_at: datetime
    revoked_at: datetime | None = None


@dataclass
class EnrollmentRecord:
    id: str
    endpoint_id: str
    token_hash: str
    state: str
    master_fingerprints: list[str]
    expires_at: datetime
    local_fingerprint: str | None = None
    completed_at: datetime | None = None
    error_code: str | None = None
    request_id: str | None = None
    created_at: datetime | None = None


@dataclass
class DesiredStateRecord:
    id: str
    endpoint_id: str
    user_id: str
    revision: str
    payload_json: dict[str, Any]
    checksum: str
    source_revision: str | None = None
    created_at: datetime | None = None


@dataclass
class JobReturnRecord:
    jid: str
    endpoint_id: str
    function: str
    success: bool
    payload_redacted: dict[str, Any]
    received_at: datetime


@dataclass
class ArtifactRecord:
    component: str
    version: str
    platform: str
    arch: str
    size: int
    sha256: str
    url: str
    manifest_signature: str
    key_id: str
    rollback_version: str | None = None
    released_at: datetime | None = None


@dataclass
class RolloutRecord:
    id: str
    component: str
    version: str
    ring: str
    state: str
    thresholds_json: dict[str, Any]
    created_by: str
    target_count: int = 0
    completed_count: int = 0
    success_rate: float = 0.0
    failure_rate: float = 0.0
    rollback_rate: float = 0.0
    p0_count: int = 0
    p1_count: int = 0
    observation_started_at: datetime | None = None
    snapshot_digest: str | None = None
    snapshot_json: list[dict[str, Any]] | None = None
    batch_index: int = 0
    created_at: datetime | None = None


@dataclass
class RolloutTargetRecord:
    rollout_id: str
    endpoint_id: str
    state: str
    attempt_count: int = 0
    last_error: str | None = None


@dataclass
class AuditEventRecord:
    id: str
    actor_type: str
    actor_id: str
    action: str
    target_type: str
    target_id: str
    request_id: str | None
    metadata_redacted: dict[str, Any]
    occurred_at: datetime


@dataclass
class PendingTokenRecord:
    token_hash: str
    tenant_id: str
    expires_at: datetime
    used: bool = False
    batch_id: str | None = None


@dataclass
class IdempotencyRecord:
    key: str
    response_json: dict[str, Any]
    request_digest: str | None = None
    created_at: datetime | None = None
    expires_at: datetime | None = None


@dataclass
class EndpointOperationRecord:
    id: str
    endpoint_id: str
    kind: str
    state: str
    enrollment_id: str | None = None
    request_id: str | None = None
    error_code: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass
class OperationStepRecord:
    operation_id: str
    step_name: str
    state: str
    salt_jid: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result_redacted: dict[str, Any] = field(default_factory=dict)
    error_code: str | None = None
    id: int | None = None


TERMINAL_JOB_STATUSES = frozenset({"succeeded", "failed", "cancelled", "expired"})


@dataclass
class ControlJobRecord:
    id: str
    endpoint_id: str
    minion_id: str
    operation: str
    status: str
    idempotency_key: str
    requested_by: str
    config_revision: str | None = None
    release_id: str | None = None
    correlation_id: str | None = None
    payload_json: dict[str, Any] | None = None
    claim_token: str | None = None
    lease_owner: str | None = None
    lease_expires_at: datetime | None = None
    heartbeat_at: datetime | None = None
    attempt: int = 0
    salt_jid: str | None = None
    result_digest: str | None = None
    error_code: str | None = None
    accepted_at: datetime | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass
class RolloutApprovalRecord:
    rollout_id: str
    role: str
    subject: str
    decision: str
    snapshot_digest: str
    reason: str | None = None
    id: int | None = None
    created_at: datetime | None = None


@dataclass
class RolloutObservationRecord:
    rollout_id: str
    window: str
    payload_json: dict[str, Any]
    id: int | None = None
    captured_at: datetime | None = None


@dataclass
class EndpointObservationRecord:
    endpoint_id: str
    window: str
    payload_json: dict[str, Any]
    id: int | None = None
    captured_at: datetime | None = None


@dataclass
class ControlPlaneIncidentRecord:
    id: str
    severity: str
    code: str
    message: str
    metadata_redacted: dict[str, Any]
    rollout_id: str | None = None
    endpoint_id: str | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None


@dataclass
class RolloutTargetJobRecord:
    rollout_id: str
    endpoint_id: str
    batch_index: int
    job_id: str | None = None
    state: str = "pending"
    id: int | None = None
    created_at: datetime | None = None


@dataclass
class SecretScopeRecord:
    tenant_id: str
    endpoint_id: str
    scope_type: str
    scope_key: str
    secret_ref: str
    version: str = "1"
    checksum_redacted: str | None = None
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class EndpointRepository(Protocol):
    async def create(self, record: EndpointRecord) -> EndpointRecord: ...
    async def get(self, endpoint_id: str) -> EndpointRecord | None: ...
    async def get_by_credential_hash(self, credential_hash: str) -> EndpointRecord | None: ...
    async def get_by_machine_guid_hash(self, machine_guid_hash: str) -> EndpointRecord | None: ...


class BindingRepository(Protocol):
    async def upsert(self, record: BindingRecord) -> BindingRecord: ...
    async def get_active(self, endpoint_id: str) -> BindingRecord | None: ...


class EnrollmentRepository(Protocol):
    async def create(self, record: EnrollmentRecord) -> EnrollmentRecord: ...
    async def get(self, enrollment_id: str) -> EnrollmentRecord | None: ...
    async def get_by_request_id(self, request_id: str) -> EnrollmentRecord | None: ...
    async def get_by_token_hash(self, token_hash: str) -> EnrollmentRecord | None: ...
    async def update(self, record: EnrollmentRecord) -> EnrollmentRecord: ...


class PendingTokenRepository(Protocol):
    async def get(self, token_hash: str) -> PendingTokenRecord | None: ...
    async def mark_used(self, token_hash: str) -> None: ...
    async def put(self, record: PendingTokenRecord) -> PendingTokenRecord: ...


class DesiredStateRepository(Protocol):
    async def get_latest(self, endpoint_id: str) -> DesiredStateRecord | None: ...
    async def put(self, record: DesiredStateRecord) -> DesiredStateRecord: ...


class JobReturnRepository(Protocol):
    async def upsert(self, record: JobReturnRecord) -> tuple[JobReturnRecord, bool]:
        """Return (record, created). created=False means duplicate."""
        ...


class ArtifactRepository(Protocol):
    async def get(
        self, component: str, version: str, platform: str = "windows", arch: str = "AMD64"
    ) -> ArtifactRecord | None: ...
    async def put(self, record: ArtifactRecord) -> ArtifactRecord: ...


class RolloutRepository(Protocol):
    async def create(self, record: RolloutRecord) -> RolloutRecord: ...
    async def get(self, rollout_id: str) -> RolloutRecord | None: ...
    async def update(self, record: RolloutRecord) -> RolloutRecord: ...
    async def add_target(self, target: RolloutTargetRecord) -> RolloutTargetRecord: ...
    async def list_targets(self, rollout_id: str) -> list[RolloutTargetRecord]: ...
    async def list_active(self) -> list[RolloutRecord]: ...


class AuditRepository(Protocol):
    async def append(self, record: AuditEventRecord) -> AuditEventRecord: ...
    async def list_for_target(self, target_type: str, target_id: str) -> list[AuditEventRecord]: ...


class IdempotencyRepository(Protocol):
    async def get(self, key: str) -> IdempotencyRecord | None: ...
    async def put(self, record: IdempotencyRecord) -> IdempotencyRecord: ...


class OperationRepository(Protocol):
    async def create(self, record: EndpointOperationRecord) -> EndpointOperationRecord: ...
    async def get(self, operation_id: str) -> EndpointOperationRecord | None: ...
    async def get_by_request_id(self, request_id: str) -> EndpointOperationRecord | None: ...
    async def update(self, record: EndpointOperationRecord) -> EndpointOperationRecord: ...
    async def list_resumable(self, *, kinds: list[str] | None = None) -> list[EndpointOperationRecord]: ...
    async def upsert_step(self, step: OperationStepRecord) -> OperationStepRecord: ...
    async def list_steps(self, operation_id: str) -> list[OperationStepRecord]: ...
    async def get_step(self, operation_id: str, step_name: str) -> OperationStepRecord | None: ...


class ControlJobRepository(Protocol):
    async def create(self, record: ControlJobRecord) -> ControlJobRecord: ...
    async def get(self, job_id: str) -> ControlJobRecord | None: ...
    async def get_by_idempotency_key(self, key: str) -> ControlJobRecord | None: ...
    async def get_by_salt_jid(self, salt_jid: str) -> ControlJobRecord | None: ...
    async def update(self, record: ControlJobRecord) -> ControlJobRecord: ...
    async def claim_next(
        self,
        *,
        worker_id: str,
        lease_seconds: int,
        now: datetime,
    ) -> ControlJobRecord | None: ...
    async def reclaim_expired(
        self, *, worker_id: str, lease_seconds: int, now: datetime
    ) -> ControlJobRecord | None: ...
    async def heartbeat(self, job_id: str, *, claim_token: str, lease_seconds: int, now: datetime) -> bool: ...
    async def set_salt_jid(
        self, job_id: str, *, claim_token: str, salt_jid: str, now: datetime
    ) -> tuple[ControlJobRecord, bool]:
        """Return (job, assigned). assigned=False means JID conflict — job unchanged."""
        ...

    async def complete(
        self,
        job_id: str,
        *,
        claim_token: str,
        status: str,
        result_digest: str | None,
        error_code: str | None,
        now: datetime,
    ) -> ControlJobRecord | None: ...
    async def list_for_endpoint(self, endpoint_id: str, *, limit: int = 20) -> list[ControlJobRecord]: ...
    async def expire_stale_leases(self, *, now: datetime) -> int: ...


class SecretScopeRepository(Protocol):
    async def upsert(self, record: SecretScopeRecord) -> SecretScopeRecord: ...
    async def get(
        self, *, tenant_id: str, endpoint_id: str, scope_type: str, scope_key: str
    ) -> SecretScopeRecord | None: ...
    async def list_for_endpoint(self, endpoint_id: str) -> list[SecretScopeRecord]: ...


class RolloutApprovalRepository(Protocol):
    async def add(self, record: RolloutApprovalRecord) -> RolloutApprovalRecord: ...
    async def list_for_rollout(self, rollout_id: str) -> list[RolloutApprovalRecord]: ...


class RolloutObservationRepository(Protocol):
    async def append(self, record: RolloutObservationRecord) -> RolloutObservationRecord: ...
    async def list_for_rollout(
        self, rollout_id: str, *, window: str | None = None
    ) -> list[RolloutObservationRecord]: ...


class EndpointObservationRepository(Protocol):
    async def append(self, record: EndpointObservationRecord) -> EndpointObservationRecord: ...
    async def latest(self, endpoint_id: str, *, window: str | None = None) -> EndpointObservationRecord | None: ...


class ControlPlaneIncidentRepository(Protocol):
    async def create(self, record: ControlPlaneIncidentRecord) -> ControlPlaneIncidentRecord: ...
    async def list_open(self, *, rollout_id: str | None = None) -> list[ControlPlaneIncidentRecord]: ...


class RolloutTargetJobRepository(Protocol):
    async def upsert(self, record: RolloutTargetJobRecord) -> RolloutTargetJobRecord: ...
    async def list_for_rollout(
        self, rollout_id: str, *, batch_index: int | None = None
    ) -> list[RolloutTargetJobRecord]: ...


@dataclass
class RepositoryBundle:
    endpoints: EndpointRepository
    bindings: BindingRepository
    enrollments: EnrollmentRepository
    pending_tokens: PendingTokenRepository
    desired_states: DesiredStateRepository
    job_returns: JobReturnRepository
    artifacts: ArtifactRepository
    rollouts: RolloutRepository
    audits: AuditRepository
    idempotency: IdempotencyRepository
    operations: OperationRepository
    control_jobs: ControlJobRepository
    secret_scopes: SecretScopeRepository
    rollout_approvals: RolloutApprovalRepository
    rollout_observations: RolloutObservationRepository
    endpoint_observations: EndpointObservationRepository
    control_plane_incidents: ControlPlaneIncidentRepository
    rollout_target_jobs: RolloutTargetJobRepository
    # Lab/test only ephemeral cache — production must not rely on this.
    extras: dict[str, Any] = field(default_factory=dict)
