from __future__ import annotations

from datetime import UTC, datetime

from db.repositories.interfaces import (
    ArtifactRecord,
    ArtifactRepository,
    AuditEventRecord,
    AuditRepository,
    BindingRecord,
    BindingRepository,
    DesiredStateRecord,
    DesiredStateRepository,
    EndpointRecord,
    EndpointRepository,
    EnrollmentRecord,
    EnrollmentRepository,
    JobReturnRecord,
    JobReturnRepository,
    PendingTokenRecord,
    PendingTokenRepository,
    RepositoryBundle,
    RolloutRecord,
    RolloutRepository,
    RolloutTargetRecord,
)


class InMemoryEndpointRepository(EndpointRepository):
    def __init__(self) -> None:
        self._by_id: dict[str, EndpointRecord] = {}
        self._by_cred: dict[str, str] = {}
        self._by_guid: dict[str, str] = {}

    async def create(self, record: EndpointRecord) -> EndpointRecord:
        self._by_id[record.id] = record
        self._by_cred[record.device_credential_hash] = record.id
        self._by_guid[record.machine_guid_hash] = record.id
        return record

    async def get(self, endpoint_id: str) -> EndpointRecord | None:
        return self._by_id.get(endpoint_id)

    async def get_by_credential_hash(self, credential_hash: str) -> EndpointRecord | None:
        eid = self._by_cred.get(credential_hash)
        return self._by_id.get(eid) if eid else None

    async def get_by_machine_guid_hash(self, machine_guid_hash: str) -> EndpointRecord | None:
        eid = self._by_guid.get(machine_guid_hash)
        return self._by_id.get(eid) if eid else None


class InMemoryBindingRepository(BindingRepository):
    def __init__(self) -> None:
        self._by_endpoint: dict[str, BindingRecord] = {}

    async def upsert(self, record: BindingRecord) -> BindingRecord:
        self._by_endpoint[record.endpoint_id] = record
        return record

    async def get_active(self, endpoint_id: str) -> BindingRecord | None:
        record = self._by_endpoint.get(endpoint_id)
        if record is None or not record.active:
            return None
        return record


class InMemoryEnrollmentRepository(EnrollmentRepository):
    def __init__(self) -> None:
        self._by_id: dict[str, EnrollmentRecord] = {}
        self._by_request: dict[str, str] = {}
        self._by_token: dict[str, str] = {}

    async def create(self, record: EnrollmentRecord) -> EnrollmentRecord:
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        self._by_id[record.id] = record
        self._by_token[record.token_hash] = record.id
        if record.request_id:
            self._by_request[record.request_id] = record.id
        return record

    async def get(self, enrollment_id: str) -> EnrollmentRecord | None:
        return self._by_id.get(enrollment_id)

    async def get_by_request_id(self, request_id: str) -> EnrollmentRecord | None:
        eid = self._by_request.get(request_id)
        return self._by_id.get(eid) if eid else None

    async def get_by_token_hash(self, token_hash: str) -> EnrollmentRecord | None:
        eid = self._by_token.get(token_hash)
        return self._by_id.get(eid) if eid else None

    async def update(self, record: EnrollmentRecord) -> EnrollmentRecord:
        self._by_id[record.id] = record
        return record


class InMemoryPendingTokenRepository(PendingTokenRepository):
    def __init__(self) -> None:
        self._by_hash: dict[str, PendingTokenRecord] = {}

    async def get(self, token_hash: str) -> PendingTokenRecord | None:
        return self._by_hash.get(token_hash)

    async def mark_used(self, token_hash: str) -> None:
        record = self._by_hash.get(token_hash)
        if record:
            record.used = True

    async def put(self, record: PendingTokenRecord) -> PendingTokenRecord:
        self._by_hash[record.token_hash] = record
        return record


class InMemoryDesiredStateRepository(DesiredStateRepository):
    def __init__(self) -> None:
        self._latest: dict[str, DesiredStateRecord] = {}

    async def get_latest(self, endpoint_id: str) -> DesiredStateRecord | None:
        return self._latest.get(endpoint_id)

    async def put(self, record: DesiredStateRecord) -> DesiredStateRecord:
        self._latest[record.endpoint_id] = record
        return record


class InMemoryJobReturnRepository(JobReturnRepository):
    def __init__(self) -> None:
        self._by_key: dict[tuple[str, str, str], JobReturnRecord] = {}

    async def upsert(self, record: JobReturnRecord) -> tuple[JobReturnRecord, bool]:
        key = (record.jid, record.endpoint_id, record.function)
        if key in self._by_key:
            return self._by_key[key], False
        self._by_key[key] = record
        return record, True


class InMemoryArtifactRepository(ArtifactRepository):
    def __init__(self) -> None:
        self._items: dict[tuple[str, str, str, str], ArtifactRecord] = {}

    async def get(
        self, component: str, version: str, platform: str = "windows", arch: str = "AMD64"
    ) -> ArtifactRecord | None:
        return self._items.get((component, version, platform, arch))

    async def put(self, record: ArtifactRecord) -> ArtifactRecord:
        self._items[(record.component, record.version, record.platform, record.arch)] = record
        return record


class InMemoryRolloutRepository(RolloutRepository):
    def __init__(self) -> None:
        self._by_id: dict[str, RolloutRecord] = {}
        self._targets: dict[str, list[RolloutTargetRecord]] = {}

    async def create(self, record: RolloutRecord) -> RolloutRecord:
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        self._by_id[record.id] = record
        self._targets.setdefault(record.id, [])
        return record

    async def get(self, rollout_id: str) -> RolloutRecord | None:
        return self._by_id.get(rollout_id)

    async def update(self, record: RolloutRecord) -> RolloutRecord:
        self._by_id[record.id] = record
        return record

    async def add_target(self, target: RolloutTargetRecord) -> RolloutTargetRecord:
        self._targets.setdefault(target.rollout_id, []).append(target)
        return target

    async def list_targets(self, rollout_id: str) -> list[RolloutTargetRecord]:
        return list(self._targets.get(rollout_id, []))


class InMemoryAuditRepository(AuditRepository):
    def __init__(self) -> None:
        self._events: list[AuditEventRecord] = []

    async def append(self, record: AuditEventRecord) -> AuditEventRecord:
        self._events.append(record)
        return record

    async def list_for_target(self, target_type: str, target_id: str) -> list[AuditEventRecord]:
        return [e for e in self._events if e.target_type == target_type and e.target_id == target_id]


def build_in_memory_repos() -> RepositoryBundle:
    return RepositoryBundle(
        endpoints=InMemoryEndpointRepository(),
        bindings=InMemoryBindingRepository(),
        enrollments=InMemoryEnrollmentRepository(),
        pending_tokens=InMemoryPendingTokenRepository(),
        desired_states=InMemoryDesiredStateRepository(),
        job_returns=InMemoryJobReturnRepository(),
        artifacts=InMemoryArtifactRepository(),
        rollouts=InMemoryRolloutRepository(),
        audits=InMemoryAuditRepository(),
    )


__all__ = [
    "InMemoryArtifactRepository",
    "InMemoryAuditRepository",
    "InMemoryBindingRepository",
    "InMemoryDesiredStateRepository",
    "InMemoryEndpointRepository",
    "InMemoryEnrollmentRepository",
    "InMemoryJobReturnRepository",
    "InMemoryPendingTokenRepository",
    "InMemoryRolloutRepository",
    "build_in_memory_repos",
]
