from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from schemas.models import ActionStatus, Operation, UserBinding


@dataclass
class ActionRecord:
    request_id: str
    operation: Operation
    payload_digest: str
    status: ActionStatus
    actor_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    deadline: datetime | None = None
    aggregate_version: int = 0
    payload_json: str = "{}"
    hermes_version: str | None = None
    config_revision: int | None = None
    auto_repair_level: int | None = None


@dataclass
class TargetRecord:
    request_id: str
    client_id: str
    status: ActionStatus
    error_code: str = ""
    message: str = ""
    dispatched: bool = False
    attempt: int = 0
    lease_owner: str = ""
    lease_until: datetime | None = None
    property_digest: str = ""
    opsi_action: str = ""
    opsi_modification_time: str = ""
    last_observed_at: datetime | None = None
    user_sid: str = ""
    user_account: str = ""

    @property
    def user_binding(self) -> UserBinding | None:
        if self.user_sid and self.user_account:
            return UserBinding(sid=self.user_sid, account=self.user_account)
        return None


@dataclass
class ResultRecord:
    request_id: str
    client_id: str
    status: ActionStatus
    sha256: str = ""
    body: str = ""
    redacted: bool = True
    bytes: int = 0
    error_code: str = ""
    body_digest: str = ""
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class DiagnosticRecord:
    request_id: str
    client_id: str
    issue_code: str
    severity: str
    recommended_action: str
    files_json: str = "[]"
    manifest_digest: str = ""


@dataclass
class PolicyRecord:
    revision: int
    payload_digest: str
    payload_json: str
    request_id: str = ""


@dataclass
class HeartbeatRecord:
    worker_id: str
    role: str
    last_seen: datetime = field(default_factory=lambda: datetime.now(UTC))


class ActionRepository(Protocol):
    async def get(self, request_id: str) -> ActionRecord | None: ...
    async def put(self, record: ActionRecord) -> None: ...
    async def list_open(self) -> list[ActionRecord]: ...


class TargetRepository(Protocol):
    async def list_for_request(self, request_id: str) -> list[TargetRecord]: ...
    async def put(self, record: TargetRecord) -> None: ...
    async def list_undispatched(self, request_id: str) -> list[TargetRecord]: ...
    async def claim_queued(self, worker_id: str, limit: int = 32) -> list[TargetRecord]: ...


class ResultRepository(Protocol):
    async def list_for_request(self, request_id: str) -> list[ResultRecord]: ...
    async def put(self, record: ResultRecord) -> None: ...
    async def get(self, request_id: str, client_id: str) -> ResultRecord | None: ...


class DiagnosticRepository(Protocol):
    async def get(self, request_id: str, client_id: str | None = None) -> DiagnosticRecord | None: ...
    async def put(self, record: DiagnosticRecord) -> None: ...


class AuditRepository(Protocol):
    async def add(self, request_id: str, actor_id: str, event: str, detail: str = "") -> None: ...


class PolicyRepository(Protocol):
    async def put(self, record: PolicyRecord) -> None: ...
    async def get(self, revision: int) -> PolicyRecord | None: ...


class HeartbeatRepository(Protocol):
    async def touch(self, worker_id: str, role: str) -> None: ...
    async def list_fresh(self, max_age_seconds: int = 60) -> list[HeartbeatRecord]: ...


@dataclass
class RepositoryBundle:
    actions: ActionRepository
    targets: TargetRepository
    results: ResultRepository
    diagnostics: DiagnosticRepository
    audit: AuditRepository
    policies: PolicyRepository
    heartbeats: HeartbeatRepository
