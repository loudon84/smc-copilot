from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class PendingKey:
    minion_id: str
    fingerprint: str


class SaltMaster(Protocol):
    name: str

    async def list_pending(self) -> list[PendingKey]: ...
    async def accept(self, minion_id: str, fingerprint: str) -> None: ...
    async def ping(self, minion_id: str) -> bool: ...
    async def sync_all(self, minion_id: str) -> bool: ...
    async def highstate(self, minion_id: str) -> bool: ...


@dataclass
class FakeSaltMaster:
    name: str
    pending: dict[str, str] = field(default_factory=dict)  # minion_id -> fingerprint
    accepted: dict[str, str] = field(default_factory=dict)
    fail_accept: bool = False
    fail_sync: bool = False
    fail_highstate: bool = False

    async def list_pending(self) -> list[PendingKey]:
        return [PendingKey(minion_id=k, fingerprint=v) for k, v in self.pending.items()]

    async def accept(self, minion_id: str, fingerprint: str) -> None:
        if self.fail_accept:
            raise RuntimeError(f"{self.name} accept failed")
        current = self.pending.get(minion_id)
        if current is None:
            raise KeyError(f"pending key missing: {minion_id}")
        if current != fingerprint:
            raise ValueError("fingerprint mismatch")
        self.accepted[minion_id] = fingerprint
        self.pending.pop(minion_id, None)

    async def ping(self, minion_id: str) -> bool:
        return minion_id in self.accepted

    async def sync_all(self, minion_id: str) -> bool:
        if self.fail_sync:
            return False
        return minion_id in self.accepted

    async def highstate(self, minion_id: str) -> bool:
        if self.fail_highstate:
            return False
        return minion_id in self.accepted

    async def delete_key(self, minion_id: str) -> None:
        self.accepted.pop(minion_id, None)
        self.pending.pop(minion_id, None)

    def add_pending(self, minion_id: str, fingerprint: str) -> None:
        self.pending[minion_id] = fingerprint
