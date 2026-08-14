from __future__ import annotations

from db.repositories.interfaces import (
    ActionRecord,
    DiagnosticRecord,
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
        self.items[record.request_id] = record

    async def list_open(self) -> list[ActionRecord]:
        return [item for item in self.items.values() if item.status.value not in {"SUCCEEDED", "FAILED", "CANCELLED"}]


class MemoryTargetRepository:
    def __init__(self) -> None:
        self.items: list[TargetRecord] = []

    async def list_for_request(self, request_id: str) -> list[TargetRecord]:
        return [item for item in self.items if item.request_id == request_id]

    async def put(self, record: TargetRecord) -> None:
        self.items = [
            item
            for item in self.items
            if not (item.request_id == record.request_id and item.client_id == record.client_id)
        ]
        self.items.append(record)

    async def list_undispatched(self, request_id: str) -> list[TargetRecord]:
        return [item for item in self.items if item.request_id == request_id and not item.dispatched]


class MemoryResultRepository:
    def __init__(self) -> None:
        self.items: list[ResultRecord] = []

    async def list_for_request(self, request_id: str) -> list[ResultRecord]:
        return [item for item in self.items if item.request_id == request_id]

    async def put(self, record: ResultRecord) -> None:
        self.items = [
            item
            for item in self.items
            if not (item.request_id == record.request_id and item.client_id == record.client_id)
        ]
        self.items.append(record)


class MemoryDiagnosticRepository:
    def __init__(self) -> None:
        self.items: dict[str, DiagnosticRecord] = {}

    async def get(self, request_id: str) -> DiagnosticRecord | None:
        return self.items.get(request_id)

    async def put(self, record: DiagnosticRecord) -> None:
        self.items[record.request_id] = record


class MemoryAuditRepository:
    def __init__(self) -> None:
        self.items: list[tuple[str, str, str, str]] = []

    async def add(self, request_id: str, actor_id: str, event: str, detail: str = "") -> None:
        self.items.append((request_id, actor_id, event, detail))


def build_in_memory_repos() -> RepositoryBundle:
    return RepositoryBundle(
        actions=MemoryActionRepository(),
        targets=MemoryTargetRepository(),
        results=MemoryResultRepository(),
        diagnostics=MemoryDiagnosticRepository(),
        audit=MemoryAuditRepository(),
    )
