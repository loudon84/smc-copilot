from __future__ import annotations

from datetime import UTC, datetime, timedelta

from core.errors import ErrorCode, OpsiControlError
from db.repositories.interfaces import (
    ActionRecord,
    DiagnosticRecord,
    HeartbeatRecord,
    PolicyRecord,
    RepositoryBundle,
    ResultRecord,
    TargetRecord,
)


class MemoryActionRepository:
    def __init__(self) -> None:
        self.items: dict[str, ActionRecord] = {}

    async def get(self, request_id: str) -> ActionRecord | None:
        return self.items.get(request_id)

    async def put(self, record: ActionRecord) -> None:
        record.updated_at = datetime.now(UTC)
        self.items[record.request_id] = record

    async def list_open(self) -> list[ActionRecord]:
        return [
            item
            for item in self.items.values()
            if item.status.value not in {"SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"}
        ]


class MemoryTargetRepository:
    def __init__(self) -> None:
        self.items: list[TargetRecord] = []

    def _index(self, request_id: str, client_id: str) -> int | None:
        for idx, item in enumerate(self.items):
            if item.request_id == request_id and item.client_id == client_id:
                return idx
        return None

    async def list_for_request(self, request_id: str) -> list[TargetRecord]:
        return [item for item in self.items if item.request_id == request_id]

    async def put(self, record: TargetRecord) -> None:
        idx = self._index(record.request_id, record.client_id)
        if idx is None:
            self.items.append(record)
        else:
            self.items[idx] = record

    async def list_undispatched(self, request_id: str) -> list[TargetRecord]:
        return [item for item in self.items if item.request_id == request_id and not item.dispatched]

    async def claim_queued(self, worker_id: str, limit: int = 32) -> list[TargetRecord]:
        now = datetime.now(UTC)
        claimed: list[TargetRecord] = []
        for item in self.items:
            if len(claimed) >= limit:
                break
            if item.status.value not in {"QUEUED", "WAITING_CLIENT"}:
                continue
            if item.lease_until and item.lease_until > now:
                continue
            item.lease_owner = worker_id
            item.lease_until = now + timedelta(seconds=30)
            item.attempt += 1
            claimed.append(item)
        return claimed


class MemoryResultRepository:
    def __init__(self) -> None:
        self.items: dict[tuple[str, str], ResultRecord] = {}

    async def list_for_request(self, request_id: str) -> list[ResultRecord]:
        return [item for key, item in self.items.items() if key[0] == request_id]

    async def get(self, request_id: str, client_id: str) -> ResultRecord | None:
        return self.items.get((request_id, client_id))

    async def put(self, record: ResultRecord) -> None:
        self.items[(record.request_id, record.client_id)] = record


class MemoryDiagnosticRepository:
    def __init__(self) -> None:
        self.items: dict[tuple[str, str], DiagnosticRecord] = {}

    async def get(self, request_id: str, client_id: str | None = None) -> DiagnosticRecord | None:
        if client_id is not None:
            return self.items.get((request_id, client_id))
        for (rid, _), record in self.items.items():
            if rid == request_id:
                return record
        return None

    async def put(self, record: DiagnosticRecord) -> None:
        self.items[(record.request_id, record.client_id)] = record


class MemoryAuditRepository:
    def __init__(self) -> None:
        self.items: list[tuple[str, str, str, str]] = []

    async def add(self, request_id: str, actor_id: str, event: str, detail: str = "") -> None:
        self.items.append((request_id, actor_id, event, detail))


class MemoryPolicyRepository:
    def __init__(self) -> None:
        self.items: dict[int, PolicyRecord] = {}

    async def put(self, record: PolicyRecord) -> None:
        existing = self.items.get(record.revision)
        if existing and existing.payload_digest != record.payload_digest:
            raise OpsiControlError(ErrorCode.CONFLICT, "policy revision digest mismatch", status_code=409)
        self.items[record.revision] = record

    async def get(self, revision: int) -> PolicyRecord | None:
        return self.items.get(revision)


class MemoryHeartbeatRepository:
    def __init__(self) -> None:
        self.items: dict[str, HeartbeatRecord] = {}

    async def touch(self, worker_id: str, role: str) -> None:
        self.items[worker_id] = HeartbeatRecord(worker_id=worker_id, role=role, last_seen=datetime.now(UTC))

    async def list_fresh(self, max_age_seconds: int = 60) -> list[HeartbeatRecord]:
        cutoff = datetime.now(UTC) - timedelta(seconds=max_age_seconds)
        return [item for item in self.items.values() if item.last_seen >= cutoff]


def build_in_memory_repos() -> RepositoryBundle:
    return RepositoryBundle(
        actions=MemoryActionRepository(),
        targets=MemoryTargetRepository(),
        results=MemoryResultRepository(),
        diagnostics=MemoryDiagnosticRepository(),
        audit=MemoryAuditRepository(),
        policies=MemoryPolicyRepository(),
        heartbeats=MemoryHeartbeatRepository(),
    )
