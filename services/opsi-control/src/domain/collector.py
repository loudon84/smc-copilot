from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from domain.inventory import (
    EndpointBindingRecord,
    EndpointInventorySnapshot,
    depot_for_client,
    snapshot_from_parts,
)
from integrations.opsi_jsonrpc import OpsiJsonRpc


class InventoryStore:
    async def get_snapshot(self, client_id: str) -> EndpointInventorySnapshot | None:
        raise NotImplementedError

    async def put_snapshot(self, snapshot: EndpointInventorySnapshot) -> None:
        raise NotImplementedError

    async def delete_snapshot(self, client_id: str) -> None:
        raise NotImplementedError

    async def get_binding(self, client_id: str) -> EndpointBindingRecord | None:
        raise NotImplementedError

    async def put_binding(self, binding: EndpointBindingRecord) -> None:
        raise NotImplementedError

    async def get_evidence(self, client_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    async def put_evidence(self, client_id: str, evidence: dict[str, Any]) -> None:
        raise NotImplementedError

    async def get_controller_evidence(self, client_id: str) -> dict[str, Any] | None:
        return None

    async def put_controller_evidence(self, client_id: str, evidence: dict[str, Any]) -> None:
        return None

    async def get_result_ack(self, request_id: str, client_id: str) -> str | None:
        return None

    async def put_result_ack(self, request_id: str, client_id: str, token: str) -> None:
        return None


class MemoryInventoryStore(InventoryStore):
    def __init__(self) -> None:
        self.snapshots: dict[str, EndpointInventorySnapshot] = {}
        self.bindings: dict[str, EndpointBindingRecord] = {}
        self.evidence: dict[str, dict[str, Any]] = {}
        self.controller_evidence: dict[str, dict[str, Any]] = {}
        self.result_acks: dict[tuple[str, str], str] = {}

    async def get_snapshot(self, client_id: str) -> EndpointInventorySnapshot | None:
        item = self.snapshots.get(client_id)
        if item is None or item.expired():
            return None
        return item

    async def put_snapshot(self, snapshot: EndpointInventorySnapshot) -> None:
        self.snapshots[snapshot.client_id] = snapshot

    async def delete_snapshot(self, client_id: str) -> None:
        self.snapshots.pop(client_id, None)
        self.evidence.pop(client_id, None)

    async def get_binding(self, client_id: str) -> EndpointBindingRecord | None:
        return self.bindings.get(client_id)

    async def put_binding(self, binding: EndpointBindingRecord) -> None:
        self.bindings[binding.client_id] = binding

    async def get_evidence(self, client_id: str) -> dict[str, Any] | None:
        return self.evidence.get(client_id)

    async def put_evidence(self, client_id: str, evidence: dict[str, Any]) -> None:
        self.evidence[client_id] = dict(evidence)

    async def get_controller_evidence(self, client_id: str) -> dict[str, Any] | None:
        return self.controller_evidence.get(client_id)

    async def put_controller_evidence(self, client_id: str, evidence: dict[str, Any]) -> None:
        self.controller_evidence[client_id] = dict(evidence)

    async def get_result_ack(self, request_id: str, client_id: str) -> str | None:
        return self.result_acks.get((request_id, client_id))

    async def put_result_ack(self, request_id: str, client_id: str, token: str) -> None:
        self.result_acks[(request_id, client_id)] = token


class InventoryCollector:
    def __init__(self, rpc: OpsiJsonRpc, store: InventoryStore) -> None:
        self.rpc = rpc
        self.store = store

    async def refresh(self, client_id: str, now: datetime | None = None) -> EndpointInventorySnapshot | None:
        hosts = await self.rpc.call("host_getObjects", {"id": client_id, "type": "OpsiClient"}, [])
        if not hosts:
            await self.store.delete_snapshot(client_id)
            return None
        depot_id = await depot_for_client(self.rpc, client_id)
        binding = await self.store.get_binding(client_id)
        evidence = await self.store.get_evidence(client_id)
        snapshot = snapshot_from_parts(
            client_id=client_id,
            rpc_host=hosts[0],
            depot_id=depot_id,
            binding=binding,
            evidence=evidence,
            now=now or datetime.now(UTC),
        )
        if snapshot is None:
            await self.store.delete_snapshot(client_id)
            return None
        await self.store.put_snapshot(snapshot)
        return snapshot
