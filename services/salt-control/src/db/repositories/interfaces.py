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
    # Lab/test only ephemeral cache — production must not rely on this.
    extras: dict[str, Any] = field(default_factory=dict)
