from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from core.errors import ErrorCode, OpsiControlError
from db.repositories.rollout_records import (
    ApprovalRecord,
    AttestationRecord,
    BatchRecord,
    CampaignRecord,
    ComplianceSnapshotRecord,
    DepotLaneRecord,
    EventRecord,
    FreezeRecord,
    GateRecord,
    IdempotencyRecord,
    LiveGateRecord,
    OutboxRecord,
    PromotionRecord,
    RingRecord,
    RolloutTargetRecord,
    TargetVerificationStoreRecord,
)
from schemas.rollout import ACTIVE_CAMPAIGN, TERMINAL_CAMPAIGN


class MemoryRolloutStore:
    def __init__(self) -> None:
        self.campaigns: dict[str, CampaignRecord] = {}
        self.batches: list[BatchRecord] = []
        self.targets: list[RolloutTargetRecord] = []
        self.approvals: list[ApprovalRecord] = []
        self.gates: list[GateRecord] = []
        self.events: list[EventRecord] = []
        self.promotions: dict[str, PromotionRecord] = {}
        self.idempotency: dict[tuple[str, str], IdempotencyRecord] = {}
        self.outbox: list[OutboxRecord] = []
        self.live_gates: dict[str, LiveGateRecord] = {}
        self.live_gate: LiveGateRecord | None = None
        self.depots: list[DepotLaneRecord] = []
        self.rings: list[RingRecord] = []
        self.attestations: dict[str, AttestationRecord] = {}
        self.freezes: dict[str, FreezeRecord] = {}
        self.compliance: list[ComplianceSnapshotRecord] = []
        self.leases: dict[str, tuple[str, datetime, int]] = {}
        self.verifications: dict[tuple[str, str, str, str], TargetVerificationStoreRecord] = {}
        self._seq = 0
        self.lease_owner = ""
        self.lease_until: datetime | None = None
        self.lease_token = 0

    def _next(self) -> int:
        self._seq += 1
        return self._seq

    async def put_campaign(self, record: CampaignRecord) -> None:
        self.campaigns[record.campaign_id] = record

    async def get_campaign(self, campaign_id: str) -> CampaignRecord | None:
        return self.campaigns.get(campaign_id)

    async def list_campaigns(self, *, cursor: str | None = None, limit: int = 50) -> list[CampaignRecord]:
        items = sorted(self.campaigns.values(), key=lambda item: item.campaign_id)
        if cursor:
            items = [item for item in items if item.campaign_id > cursor]
        return items[: max(1, min(limit, 100))]

    async def cas_campaign(self, record: CampaignRecord, expected_revision: int) -> CampaignRecord:
        current = self.campaigns.get(record.campaign_id)
        if current is None or current.revision != expected_revision:
            raise OpsiControlError(ErrorCode.CONFLICT, "stale campaign revision", status_code=409)
        record.revision = expected_revision + 1
        record.updated_at = datetime.now(UTC)
        self.campaigns[record.campaign_id] = record
        if record.status in {item.value for item in TERMINAL_CAMPAIGN}:
            for target in self.targets:
                if target.campaign_id == record.campaign_id:
                    target.active_slot = f"done-{record.campaign_id}"
        return record

    async def replace_batches(self, campaign_id: str, batches: list[BatchRecord]) -> None:
        self.batches = [item for item in self.batches if item.campaign_id != campaign_id]
        self.batches.extend(batches)

    async def list_batches(self, campaign_id: str) -> list[BatchRecord]:
        return sorted(
            [item for item in self.batches if item.campaign_id == campaign_id],
            key=lambda item: item.batch_index,
        )

    async def put_batch(self, record: BatchRecord) -> None:
        self.batches = [
            item
            for item in self.batches
            if not (item.campaign_id == record.campaign_id and item.batch_index == record.batch_index)
        ]
        self.batches.append(record)

    async def replace_targets(self, campaign_id: str, targets: list[RolloutTargetRecord]) -> None:
        self.targets = [item for item in self.targets if item.campaign_id != campaign_id]
        self.targets.extend(targets)

    async def list_targets(
        self, campaign_id: str, *, cursor: str | None = None, limit: int | None = None
    ) -> list[RolloutTargetRecord]:
        items = sorted(
            [item for item in self.targets if item.campaign_id == campaign_id],
            key=lambda item: item.client_id,
        )
        if cursor:
            items = [item for item in items if item.client_id > cursor]
        if limit is not None:
            return items[: max(1, min(limit, 100))]
        return items

    async def put_target(self, record: RolloutTargetRecord) -> None:
        self.targets = [
            item
            for item in self.targets
            if not (item.campaign_id == record.campaign_id and item.client_id == record.client_id)
        ]
        self.targets.append(record)

    async def active_client_ids(self, exclude_campaign: str | None = None) -> set[str]:
        active: set[str] = set()
        for campaign in self.campaigns.values():
            if exclude_campaign and campaign.campaign_id == exclude_campaign:
                continue
            if campaign.status not in {item.value for item in ACTIVE_CAMPAIGN}:
                continue
            for target in self.targets:
                if target.campaign_id == campaign.campaign_id:
                    active.add(target.client_id)
        return active

    async def add_approval(self, record: ApprovalRecord) -> ApprovalRecord:
        record.id = self._next()
        self.approvals.append(record)
        return record

    async def list_approvals(self, campaign_id: str, kind: str | None = None) -> list[ApprovalRecord]:
        items = [item for item in self.approvals if item.campaign_id == campaign_id]
        if kind:
            items = [item for item in items if item.kind == kind]
        return items

    async def add_gate(self, record: GateRecord) -> GateRecord:
        record.id = self._next()
        self.gates.append(record)
        return record

    async def list_gates(self, campaign_id: str) -> list[GateRecord]:
        return [item for item in self.gates if item.campaign_id == campaign_id]

    async def add_event(self, record: EventRecord) -> EventRecord:
        record.id = self._next()
        self.events.append(record)
        out = OutboxRecord(
            id=self._next(),
            campaign_id=record.campaign_id,
            kind=record.event,
            payload_json=record.payload_json or json.dumps({"detail": record.detail}),
        )
        self.outbox.append(out)
        return record

    async def list_events(self, campaign_id: str) -> list[EventRecord]:
        return [item for item in self.events if item.campaign_id == campaign_id]

    async def put_promotion(self, record: PromotionRecord) -> None:
        existing = self.promotions.get(record.product_version)
        if existing and existing.digest != record.digest and existing.channel != "quarantined":
            raise OpsiControlError(ErrorCode.CONFLICT, "same version different digest", status_code=409)
        self.promotions[record.digest] = record
        self.promotions[record.product_version] = record

    async def get_promotion(self, digest: str) -> PromotionRecord | None:
        return self.promotions.get(digest)

    async def list_promotions(self) -> list[PromotionRecord]:
        seen: set[str] = set()
        out: list[PromotionRecord] = []
        for item in self.promotions.values():
            if item.digest in seen:
                continue
            seen.add(item.digest)
            out.append(item)
        return out

    async def put_idempotency(self, record: IdempotencyRecord) -> IdempotencyRecord | None:
        key = (record.actor_id, record.key)
        existing = self.idempotency.get(key)
        if existing:
            if existing.body_digest != record.body_digest:
                raise OpsiControlError(ErrorCode.CONFLICT, "idempotency key payload mismatch", status_code=409)
            if record.response_json:
                existing.response_json = record.response_json
            return existing if existing.response_json else None
        self.idempotency[key] = record
        return None

    async def put_live_gate(self, record: LiveGateRecord) -> None:
        existing = self.live_gates.get(record.gate_id)
        if existing and existing.immutable and not existing.revoked:
            raise OpsiControlError(ErrorCode.CONFLICT, "live gate is immutable", status_code=409)
        self.live_gates[record.gate_id] = record
        self.live_gate = record

    async def revoke_live_gate(self, gate_id: str) -> LiveGateRecord | None:
        record = self.live_gates.get(gate_id) or (
            self.live_gate if self.live_gate and self.live_gate.gate_id == gate_id else None
        )
        if record is None:
            return None
        record.revoked = True
        record.decision = "NO-GO"
        self.live_gates[gate_id] = record
        return record

    async def get_live_gate(self, gate_id: str = "v1.1-live") -> LiveGateRecord | None:
        if gate_id in self.live_gates:
            return self.live_gates[gate_id]
        if self.live_gate and self.live_gate.gate_id == gate_id:
            return self.live_gate
        return None

    async def claim_orchestrator(
        self, worker_id: str, fencing_token: int, lease_key: str = "rollout-orchestrator"
    ) -> bool:
        now = datetime.now(UTC)
        if lease_key == "rollout-orchestrator":
            if self.lease_until and self.lease_until > now and self.lease_owner and self.lease_owner != worker_id:
                return False
        else:
            current = self.leases.get(lease_key)
            if current is not None:
                owner, until, _token = current
                if until > now and owner and owner != worker_id:
                    return False
        self.leases[lease_key] = (worker_id, now + timedelta(seconds=30), fencing_token)
        if lease_key == "rollout-orchestrator":
            self.lease_owner = worker_id
            self.lease_until = now + timedelta(seconds=30)
            self.lease_token = fencing_token
        return True

    async def replace_depots(self, campaign_id: str, depots: list[DepotLaneRecord]) -> None:
        self.depots = [item for item in self.depots if item.campaign_id != campaign_id]
        self.depots.extend(depots)

    async def list_depots(self, campaign_id: str) -> list[DepotLaneRecord]:
        return [item for item in self.depots if item.campaign_id == campaign_id]

    async def put_depot(self, record: DepotLaneRecord) -> None:
        self.depots = [
            item
            for item in self.depots
            if not (item.campaign_id == record.campaign_id and item.depot_id == record.depot_id)
        ]
        self.depots.append(record)

    async def replace_rings(self, campaign_id: str, rings: list[RingRecord]) -> None:
        self.rings = [item for item in self.rings if item.campaign_id != campaign_id]
        self.rings.extend(rings)

    async def list_rings(self, campaign_id: str) -> list[RingRecord]:
        return sorted(
            [item for item in self.rings if item.campaign_id == campaign_id],
            key=lambda item: item.ring_index,
        )

    async def put_ring(self, record: RingRecord) -> None:
        self.rings = [
            item
            for item in self.rings
            if not (item.campaign_id == record.campaign_id and item.ring_index == record.ring_index)
        ]
        self.rings.append(record)

    async def put_attestation(self, record: AttestationRecord) -> None:
        self.attestations[f"{record.depot_id}:{record.artifact_digest}"] = record

    async def get_attestation(self, depot_id: str, artifact_digest: str) -> AttestationRecord | None:
        return self.attestations.get(f"{depot_id}:{artifact_digest}")

    async def list_attestations(self) -> list[AttestationRecord]:
        return list(self.attestations.values())

    async def put_freeze(self, record: FreezeRecord) -> None:
        self.freezes[record.freeze_id] = record

    async def get_active_freeze(self) -> FreezeRecord | None:
        actives = [item for item in self.freezes.values() if item.active]
        return actives[-1] if actives else None

    async def get_freeze(self, freeze_id: str) -> FreezeRecord | None:
        return self.freezes.get(freeze_id)

    async def put_compliance(self, record: ComplianceSnapshotRecord) -> None:
        self.compliance.append(record)

    async def list_compliance(self, *, cursor: str | None = None, limit: int = 50) -> list[ComplianceSnapshotRecord]:
        items = sorted(self.compliance, key=lambda item: item.snapshot_id)
        if cursor:
            items = [item for item in items if item.snapshot_id > cursor]
        return items[: max(1, min(limit, 100))]

    async def unpublished_outbox(self) -> list[OutboxRecord]:
        return [item for item in self.outbox if not item.published]

    async def mark_published(self, outbox_id: int) -> None:
        for item in self.outbox:
            if item.id == outbox_id:
                item.published = True

    async def add_outbox(self, record: OutboxRecord) -> OutboxRecord:
        record.id = self._next()
        self.outbox.append(record)
        return record

    async def put_verification(self, record: TargetVerificationStoreRecord) -> TargetVerificationStoreRecord:
        key = (record.campaign_id, record.client_id, record.action_id, record.kind)
        existing = self.verifications.get(key)
        if existing and existing.canonical_digest != record.canonical_digest:
            raise OpsiControlError(ErrorCode.CONFLICT, "verification digest conflict", status_code=409)
        self.verifications[key] = record
        return record

    async def get_verification(
        self, campaign_id: str, client_id: str, action_id: str, kind: str
    ) -> TargetVerificationStoreRecord | None:
        return self.verifications.get((campaign_id, client_id, action_id, kind))

    async def list_verifications(self, campaign_id: str) -> list[TargetVerificationStoreRecord]:
        return [item for item in self.verifications.values() if item.campaign_id == campaign_id]
