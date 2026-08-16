from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.errors import ErrorCode, OpsiControlError
from db.models import (
    ArtifactPromotionRow,
    LiveGateRow,
    PollCursorRow,
    RolloutApprovalRow,
    RolloutBatchRow,
    RolloutCampaignRow,
    RolloutEventRow,
    RolloutGateRow,
    RolloutIdempotencyRow,
    RolloutOutboxRow,
    RolloutTargetRow,
)
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


def _ids(raw: str) -> list[str]:
    return json.loads(raw)


class SqlRolloutStore:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def put_campaign(self, record: CampaignRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                session.add(_campaign_to_row(record))

    async def get_campaign(self, campaign_id: str) -> CampaignRecord | None:
        async with self.factory() as session:
            row = await session.get(RolloutCampaignRow, campaign_id)
            return _campaign_from_row(row) if row else None

    async def list_campaigns(self) -> list[CampaignRecord]:
        async with self.factory() as session:
            rows = (await session.execute(select(RolloutCampaignRow))).scalars()
            return [_campaign_from_row(row) for row in rows]

    async def cas_campaign(self, record: CampaignRecord, expected_revision: int) -> CampaignRecord:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(RolloutCampaignRow, record.campaign_id, with_for_update=True)
                if row is None or row.revision != expected_revision:
                    raise OpsiControlError(ErrorCode.CONFLICT, "stale campaign revision", status_code=409)
                record.revision = expected_revision + 1
                record.updated_at = datetime.now(UTC)
                _apply_campaign(row, record)
                if record.status in {item.value for item in TERMINAL_CAMPAIGN}:
                    targets = (
                        await session.execute(
                            select(RolloutTargetRow).where(RolloutTargetRow.campaign_id == record.campaign_id)
                        )
                    ).scalars()
                    for target in targets:
                        target.active_slot = f"done-{record.campaign_id}"
                return record

    async def replace_batches(self, campaign_id: str, batches: list[BatchRecord]) -> None:
        async with self.factory() as session:
            async with session.begin():
                await session.execute(delete(RolloutBatchRow).where(RolloutBatchRow.campaign_id == campaign_id))
                for item in batches:
                    session.add(_batch_to_row(item))

    async def list_batches(self, campaign_id: str) -> list[BatchRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(
                    select(RolloutBatchRow)
                    .where(RolloutBatchRow.campaign_id == campaign_id)
                    .order_by(RolloutBatchRow.batch_index)
                )
            ).scalars()
            return [_batch_from_row(row) for row in rows]

    async def put_batch(self, record: BatchRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = (
                    await session.execute(
                        select(RolloutBatchRow).where(
                            RolloutBatchRow.campaign_id == record.campaign_id,
                            RolloutBatchRow.batch_index == record.batch_index,
                        )
                    )
                ).scalar_one_or_none()
                if row is None:
                    session.add(_batch_to_row(record))
                else:
                    row.status = record.status
                    row.client_ids_json = json.dumps(record.client_ids)
                    row.observe_hours = record.observe_hours
                    row.approved = record.approved
                    row.dispatched = record.dispatched

    async def replace_targets(self, campaign_id: str, targets: list[RolloutTargetRecord]) -> None:
        try:
            async with self.factory() as session:
                async with session.begin():
                    await session.execute(delete(RolloutTargetRow).where(RolloutTargetRow.campaign_id == campaign_id))
                    for item in targets:
                        session.add(_target_to_row(item))
        except IntegrityError as exc:
            raise OpsiControlError(ErrorCode.CONFLICT, "client already in active campaign", status_code=409) from exc

    async def list_targets(self, campaign_id: str) -> list[RolloutTargetRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(RolloutTargetRow).where(RolloutTargetRow.campaign_id == campaign_id))
            ).scalars()
            return [_target_from_row(row) for row in rows]

    async def put_target(self, record: RolloutTargetRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = (
                    await session.execute(
                        select(RolloutTargetRow).where(
                            RolloutTargetRow.campaign_id == record.campaign_id,
                            RolloutTargetRow.client_id == record.client_id,
                        )
                    )
                ).scalar_one_or_none()
                if row is None:
                    session.add(_target_to_row(record))
                else:
                    _apply_target(row, record)

    async def active_client_ids(self, exclude_campaign: str | None = None) -> set[str]:
        async with self.factory() as session:
            campaigns = (await session.execute(select(RolloutCampaignRow))).scalars()
            active_ids = {
                row.campaign_id
                for row in campaigns
                if row.status in {item.value for item in ACTIVE_CAMPAIGN} and row.campaign_id != exclude_campaign
            }
            if not active_ids:
                return set()
            targets = (
                await session.execute(select(RolloutTargetRow).where(RolloutTargetRow.campaign_id.in_(active_ids)))
            ).scalars()
            return {row.client_id for row in targets}

    async def add_approval(self, record: ApprovalRecord) -> ApprovalRecord:
        async with self.factory() as session:
            async with session.begin():
                row = RolloutApprovalRow(
                    campaign_id=record.campaign_id,
                    kind=record.kind,
                    actor_id=record.actor_id,
                    role=record.role,
                    campaign_revision=record.campaign_revision,
                    reason=record.reason,
                    created_at=record.created_at,
                )
                session.add(row)
                await session.flush()
                record.id = row.id
                return record

    async def list_approvals(self, campaign_id: str, kind: str | None = None) -> list[ApprovalRecord]:
        async with self.factory() as session:
            stmt = select(RolloutApprovalRow).where(RolloutApprovalRow.campaign_id == campaign_id)
            if kind:
                stmt = stmt.where(RolloutApprovalRow.kind == kind)
            rows = (await session.execute(stmt)).scalars()
            return [
                ApprovalRecord(
                    id=row.id,
                    campaign_id=row.campaign_id,
                    kind=row.kind,
                    actor_id=row.actor_id,
                    role=row.role,
                    campaign_revision=row.campaign_revision,
                    reason=row.reason,
                    created_at=row.created_at,
                )
                for row in rows
            ]

    async def add_gate(self, record: GateRecord) -> GateRecord:
        async with self.factory() as session:
            async with session.begin():
                row = RolloutGateRow(
                    campaign_id=record.campaign_id,
                    gate_type=record.gate_type,
                    decision=record.decision,
                    reason=record.reason,
                    input_digest=record.input_digest,
                    evaluator=record.evaluator,
                    created_at=record.created_at,
                )
                session.add(row)
                await session.flush()
                record.id = row.id
                return record

    async def list_gates(self, campaign_id: str) -> list[GateRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(RolloutGateRow).where(RolloutGateRow.campaign_id == campaign_id))
            ).scalars()
            return [
                GateRecord(
                    id=row.id,
                    campaign_id=row.campaign_id,
                    gate_type=row.gate_type,
                    decision=row.decision,
                    reason=row.reason,
                    input_digest=row.input_digest,
                    evaluator=row.evaluator,
                    created_at=row.created_at,
                )
                for row in rows
            ]

    async def add_event(self, record: EventRecord) -> EventRecord:
        async with self.factory() as session:
            async with session.begin():
                row = RolloutEventRow(
                    campaign_id=record.campaign_id,
                    event=record.event,
                    actor_id=record.actor_id,
                    detail=record.detail,
                    payload_json=record.payload_json or json.dumps({"detail": record.detail}),
                    created_at=record.created_at,
                )
                session.add(row)
                session.add(
                    RolloutOutboxRow(
                        campaign_id=record.campaign_id,
                        kind=record.event,
                        payload_json=record.payload_json or json.dumps({"detail": record.detail}),
                    )
                )
                await session.flush()
                record.id = row.id
                return record

    async def list_events(self, campaign_id: str) -> list[EventRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(RolloutEventRow).where(RolloutEventRow.campaign_id == campaign_id))
            ).scalars()
            return [
                EventRecord(
                    id=row.id,
                    campaign_id=row.campaign_id,
                    event=row.event,
                    actor_id=row.actor_id,
                    detail=row.detail,
                    payload_json=row.payload_json,
                    created_at=row.created_at,
                )
                for row in rows
            ]

    async def put_promotion(self, record: PromotionRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                existing = (
                    await session.execute(
                        select(ArtifactPromotionRow).where(
                            ArtifactPromotionRow.product_version == record.product_version
                        )
                    )
                ).scalar_one_or_none()
                if existing and existing.digest != record.digest and existing.channel != "quarantined":
                    raise OpsiControlError(ErrorCode.CONFLICT, "same version different digest", status_code=409)
                row = await session.get(ArtifactPromotionRow, record.digest)
                if row is None:
                    session.add(
                        ArtifactPromotionRow(
                            digest=record.digest,
                            product_version=record.product_version,
                            signer_key_id=record.signer_key_id,
                            channel=record.channel,
                            evidence_ref=record.evidence_ref,
                            actor_id=record.actor_id,
                            created_at=record.created_at,
                        )
                    )
                else:
                    row.channel = record.channel
                    row.signer_key_id = record.signer_key_id
                    row.evidence_ref = record.evidence_ref
                    row.actor_id = record.actor_id

    async def get_promotion(self, digest: str) -> PromotionRecord | None:
        async with self.factory() as session:
            row = await session.get(ArtifactPromotionRow, digest)
            return _promotion_from_row(row) if row else None

    async def list_promotions(self) -> list[PromotionRecord]:
        async with self.factory() as session:
            rows = (await session.execute(select(ArtifactPromotionRow))).scalars()
            return [_promotion_from_row(row) for row in rows]

    async def put_idempotency(self, record: IdempotencyRecord) -> IdempotencyRecord | None:
        async with self.factory() as session:
            async with session.begin():
                existing = (
                    await session.execute(
                        select(RolloutIdempotencyRow).where(
                            RolloutIdempotencyRow.actor_id == record.actor_id,
                            RolloutIdempotencyRow.key == record.key,
                        )
                    )
                ).scalar_one_or_none()
                if existing:
                    if existing.body_digest != record.body_digest:
                        raise OpsiControlError(ErrorCode.CONFLICT, "idempotency key payload mismatch", status_code=409)
                    if record.response_json:
                        existing.response_json = record.response_json
                    if existing.response_json:
                        return IdempotencyRecord(
                            key=existing.key,
                            actor_id=existing.actor_id,
                            command=existing.command,
                            campaign_id=existing.campaign_id,
                            body_digest=existing.body_digest,
                            response_json=existing.response_json,
                        )
                    return None
                session.add(
                    RolloutIdempotencyRow(
                        key=record.key,
                        actor_id=record.actor_id,
                        command=record.command,
                        campaign_id=record.campaign_id,
                        body_digest=record.body_digest,
                        response_json=record.response_json,
                    )
                )
                return None

    async def put_live_gate(self, record: LiveGateRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                existing = (await session.execute(select(LiveGateRow))).scalars().first()
                if existing and existing.immutable:
                    raise OpsiControlError(ErrorCode.CONFLICT, "live gate is immutable", status_code=409)
                session.add(
                    LiveGateRow(
                        gate_id=record.gate_id,
                        decision=record.decision,
                        evidence_ref=record.evidence_ref,
                        signed_by=record.signed_by,
                        immutable=record.immutable,
                        created_at=record.created_at,
                    )
                )

    async def get_live_gate(self) -> LiveGateRecord | None:
        async with self.factory() as session:
            row = (await session.execute(select(LiveGateRow))).scalars().first()
            if row is None:
                return None
            return LiveGateRecord(
                gate_id=row.gate_id,
                decision=row.decision,
                evidence_ref=row.evidence_ref,
                signed_by=row.signed_by,
                immutable=row.immutable,
                created_at=row.created_at,
            )

    async def claim_orchestrator(self, worker_id: str, fencing_token: int) -> bool:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(PollCursorRow, "rollout-orchestrator", with_for_update=True)
                now = datetime.now(UTC)
                if row and row.lease_until and row.lease_until > now:
                    owner = (row.cursor or "").split("|", 1)[0]
                    if owner and owner != worker_id:
                        return False
                cursor = f"{worker_id}|{fencing_token}"
                if row is None:
                    session.add(
                        PollCursorRow(
                            name="rollout-orchestrator",
                            lease_until=now + timedelta(seconds=30),
                            cursor=cursor,
                        )
                    )
                else:
                    row.lease_until = now + timedelta(seconds=30)
                    row.cursor = cursor
                return True

    async def unpublished_outbox(self) -> list[OutboxRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(RolloutOutboxRow).where(RolloutOutboxRow.published.is_(False)))
            ).scalars()
            return [
                OutboxRecord(
                    id=row.id,
                    campaign_id=row.campaign_id,
                    kind=row.kind,
                    payload_json=row.payload_json,
                    published=row.published,
                    created_at=row.created_at,
                )
                for row in rows
            ]

    async def mark_published(self, outbox_id: int) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(RolloutOutboxRow, outbox_id)
                if row:
                    row.published = True


def _campaign_to_row(record: CampaignRecord) -> RolloutCampaignRow:
    return RolloutCampaignRow(
        campaign_id=record.campaign_id,
        name=record.name,
        status=record.status,
        revision=record.revision,
        snapshot_digest=record.snapshot_digest,
        client_ids_json=json.dumps(record.client_ids),
        product_id=record.product_id,
        product_version=record.product_version,
        package_version=record.package_version,
        artifact_digest=record.artifact_digest,
        signer_key_id=record.signer_key_id,
        config_revision=record.config_revision,
        gate_policy_revision=record.gate_policy_revision,
        evidence_policy_revision=record.evidence_policy_revision,
        creator_id=record.creator_id,
        change_ticket=record.change_ticket,
        reason=record.reason,
        window_start=record.window_start,
        window_end=record.window_end,
        pause_cause=record.pause_cause,
        fencing_token=record.fencing_token,
        payload_json=record.payload_json,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _campaign_from_row(row: RolloutCampaignRow) -> CampaignRecord:
    return CampaignRecord(
        campaign_id=row.campaign_id,
        name=row.name,
        status=row.status,
        revision=row.revision,
        snapshot_digest=row.snapshot_digest,
        client_ids=_ids(row.client_ids_json),
        product_id=row.product_id,
        product_version=row.product_version,
        package_version=row.package_version,
        artifact_digest=row.artifact_digest,
        signer_key_id=row.signer_key_id,
        config_revision=row.config_revision,
        gate_policy_revision=row.gate_policy_revision,
        evidence_policy_revision=row.evidence_policy_revision,
        creator_id=row.creator_id,
        change_ticket=row.change_ticket,
        reason=row.reason,
        window_start=row.window_start,
        window_end=row.window_end,
        pause_cause=row.pause_cause,
        fencing_token=row.fencing_token,
        payload_json=row.payload_json,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _apply_campaign(row: RolloutCampaignRow, record: CampaignRecord) -> None:
    row.name = record.name
    row.status = record.status
    row.revision = record.revision
    row.pause_cause = record.pause_cause
    row.fencing_token = record.fencing_token
    row.updated_at = record.updated_at
    row.payload_json = record.payload_json


def _batch_to_row(record: BatchRecord) -> RolloutBatchRow:
    return RolloutBatchRow(
        campaign_id=record.campaign_id,
        batch_index=record.batch_index,
        status=record.status,
        client_ids_json=json.dumps(record.client_ids),
        observe_hours=record.observe_hours,
        approved=record.approved,
        dispatched=record.dispatched,
    )


def _batch_from_row(row: RolloutBatchRow) -> BatchRecord:
    return BatchRecord(
        campaign_id=row.campaign_id,
        batch_index=row.batch_index,
        status=row.status,
        client_ids=_ids(row.client_ids_json),
        observe_hours=row.observe_hours,
        approved=row.approved,
        dispatched=row.dispatched,
    )


def _target_to_row(record: RolloutTargetRecord) -> RolloutTargetRow:
    return RolloutTargetRow(
        campaign_id=record.campaign_id,
        client_id=record.client_id,
        batch_index=record.batch_index,
        status=record.status,
        preflight_json=record.preflight_json,
        preflight_at=record.preflight_at,
        action_id=record.action_id,
        baseline_version=record.baseline_version,
        baseline_digest=record.baseline_digest,
        baseline_owner=record.baseline_owner,
        ineligible_reason=record.ineligible_reason,
        mutated=record.mutated,
        active_slot=record.active_slot,
    )


def _target_from_row(row: RolloutTargetRow) -> RolloutTargetRecord:
    return RolloutTargetRecord(
        campaign_id=row.campaign_id,
        client_id=row.client_id,
        batch_index=row.batch_index,
        status=row.status,
        preflight_json=row.preflight_json,
        preflight_at=row.preflight_at,
        action_id=row.action_id,
        baseline_version=row.baseline_version,
        baseline_digest=row.baseline_digest,
        baseline_owner=row.baseline_owner,
        ineligible_reason=row.ineligible_reason,
        mutated=row.mutated,
        active_slot=row.active_slot,
    )


def _apply_target(row: RolloutTargetRow, record: RolloutTargetRecord) -> None:
    row.status = record.status
    row.preflight_json = record.preflight_json
    row.preflight_at = record.preflight_at
    row.action_id = record.action_id
    row.baseline_version = record.baseline_version
    row.baseline_digest = record.baseline_digest
    row.baseline_owner = record.baseline_owner
    row.ineligible_reason = record.ineligible_reason
    row.mutated = record.mutated
    row.active_slot = record.active_slot


def _promotion_from_row(row: ArtifactPromotionRow) -> PromotionRecord:
    return PromotionRecord(
        digest=row.digest,
        product_version=row.product_version,
        signer_key_id=row.signer_key_id,
        channel=row.channel,
        evidence_ref=row.evidence_ref,
        actor_id=row.actor_id,
        created_at=row.created_at,
    )
