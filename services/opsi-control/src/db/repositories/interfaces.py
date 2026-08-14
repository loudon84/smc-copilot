from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from schemas.models import ActionStatus, Operation


@dataclass
class ActionRecord:
    request_id: str
    operation: Operation
    payload_digest: str
    status: ActionStatus
    actor_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class TargetRecord:
    request_id: str
    client_id: str
    status: ActionStatus
    error_code: str = ""
    message: str = ""
    dispatched: bool = False


@dataclass
class ResultRecord:
    request_id: str
    client_id: str
    status: ActionStatus
    sha256: str = ""
    body: str = ""
    redacted: bool = True
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class DiagnosticRecord:
    request_id: str
    client_id: str
    issue_code: str
    severity: str
    recommended_action: str
    files_json: str = "[]"


class ActionRepository(Protocol):
    async def get(self, request_id: str) -> ActionRecord | None: ...
    async def put(self, record: ActionRecord) -> None: ...
    async def list_open(self) -> list[ActionRecord]: ...


class TargetRepository(Protocol):
    async def list_for_request(self, request_id: str) -> list[TargetRecord]: ...
    async def put(self, record: TargetRecord) -> None: ...
    async def list_undispatched(self, request_id: str) -> list[TargetRecord]: ...


class ResultRepository(Protocol):
    async def list_for_request(self, request_id: str) -> list[ResultRecord]: ...
    async def put(self, record: ResultRecord) -> None: ...


class DiagnosticRepository(Protocol):
    async def get(self, request_id: str) -> DiagnosticRecord | None: ...
    async def put(self, record: DiagnosticRecord) -> None: ...


class AuditRepository(Protocol):
    async def add(self, request_id: str, actor_id: str, event: str, detail: str = "") -> None: ...


@dataclass
class RepositoryBundle:
    actions: ActionRepository
    targets: TargetRepository
    results: ResultRepository
    diagnostics: DiagnosticRepository
    audit: AuditRepository
