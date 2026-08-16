from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from core.errors import ErrorCode, OpsiControlError
from db.repositories.rollout_records import (
    ApprovalRecord,
    BatchRecord,
    CampaignRecord,
    EventRecord,
    GateRecord,
    IdempotencyRecord,
    LiveGateRecord,
    OutboxRecord,
    PromotionRecord,
    RolloutTargetRecord,
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
        self.live_gate: LiveGateRecord | None = None
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

    async def list_campaigns(self) -> list[CampaignRecord]:
        return list(self.campaigns.values())

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

    async def list_targets(self, campaign_id: str) -> list[RolloutTargetRecord]:
        return [item for item in self.targets if item.campaign_id == campaign_id]

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
        if self.live_gate and self.live_gate.immutable:
            raise OpsiControlError(ErrorCode.CONFLICT, "live gate is immutable", status_code=409)
        self.live_gate = record

    async def get_live_gate(self) -> LiveGateRecord | None:
        return self.live_gate

    async def claim_orchestrator(self, worker_id: str, fencing_token: int) -> bool:
        now = datetime.now(UTC)
        if self.lease_until and self.lease_until > now and self.lease_owner and self.lease_owner != worker_id:
            return False
        self.lease_owner = worker_id
        self.lease_until = now + timedelta(seconds=30)
        self.lease_token = fencing_token
        return True

    async def unpublished_outbox(self) -> list[OutboxRecord]:
        return [item for item in self.outbox if not item.published]

    async def mark_published(self, outbox_id: int) -> None:
        for item in self.outbox:
            if item.id == outbox_id:
                item.published = True
