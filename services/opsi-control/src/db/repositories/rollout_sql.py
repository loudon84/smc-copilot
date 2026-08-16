from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.errors import ErrorCode, OpsiControlError
from db.models import (
    ArtifactPromotionRow,
    DepotAttestationRow,
    FleetComplianceRow,
    LiveGateRow,
    ReleaseFreezeRow,
    RolloutApprovalRow,
    RolloutBatchRow,
    RolloutCampaignRow,
    RolloutDepotRow,
    RolloutEventRow,
    RolloutGateRow,
    RolloutIdempotencyRow,
    RolloutLeaseRow,
    RolloutOutboxRow,
    RolloutRingRow,
    RolloutTargetRow,
    TargetVerificationRow,
)
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

    async def list_campaigns(self, *, cursor: str | None = None, limit: int = 50) -> list[CampaignRecord]:
        async with self.factory() as session:
            stmt = select(RolloutCampaignRow).order_by(RolloutCampaignRow.campaign_id)
            if cursor:
                stmt = stmt.where(RolloutCampaignRow.campaign_id > cursor)
            stmt = stmt.limit(max(1, min(limit, 100)))
            rows = (await session.execute(stmt)).scalars()
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
                    row.observe_until = record.observe_until
                    row.observe_started_at = record.observe_started_at

    async def replace_targets(self, campaign_id: str, targets: list[RolloutTargetRecord]) -> None:
        try:
            async with self.factory() as session:
                async with session.begin():
                    await session.execute(delete(RolloutTargetRow).where(RolloutTargetRow.campaign_id == campaign_id))
                    for item in targets:
                        session.add(_target_to_row(item))
        except IntegrityError as exc:
            raise OpsiControlError(ErrorCode.CONFLICT, "client already in active campaign", status_code=409) from exc

    async def list_targets(
        self, campaign_id: str, *, cursor: str | None = None, limit: int | None = None
    ) -> list[RolloutTargetRecord]:
        async with self.factory() as session:
            stmt = (
                select(RolloutTargetRow)
                .where(RolloutTargetRow.campaign_id == campaign_id)
                .order_by(RolloutTargetRow.client_id)
            )
            if cursor:
                stmt = stmt.where(RolloutTargetRow.client_id > cursor)
            if limit is not None:
                stmt = stmt.limit(max(1, min(limit, 100)))
            rows = (await session.execute(stmt)).scalars()
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
                existing = await session.get(LiveGateRow, record.gate_id)
                if existing and existing.immutable and not getattr(existing, "revoked", False):
                    raise OpsiControlError(ErrorCode.CONFLICT, "live gate is immutable", status_code=409)
                if existing is None:
                    session.add(
                        LiveGateRow(
                            gate_id=record.gate_id,
                            decision=record.decision,
                            evidence_ref=record.evidence_ref,
                            signed_by=record.signed_by,
                            immutable=record.immutable,
                            created_at=record.created_at,
                            payload_json=record.payload_json,
                            signature=record.signature,
                            expires_at=record.expires_at,
                            revoked=record.revoked,
                            input_digest=record.input_digest,
                            key_id=record.key_id,
                        )
                    )
                else:
                    existing.decision = record.decision
                    existing.evidence_ref = record.evidence_ref
                    existing.signed_by = record.signed_by
                    existing.immutable = record.immutable
                    existing.payload_json = record.payload_json
                    existing.signature = record.signature
                    existing.expires_at = record.expires_at
                    existing.revoked = record.revoked
                    existing.input_digest = record.input_digest
                    existing.key_id = record.key_id

    async def revoke_live_gate(self, gate_id: str) -> LiveGateRecord | None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(LiveGateRow, gate_id)
                if row is None:
                    return None
                row.revoked = True
                row.decision = "NO-GO"
                return LiveGateRecord(
                    gate_id=row.gate_id,
                    decision=row.decision,
                    evidence_ref=row.evidence_ref,
                    signed_by=row.signed_by,
                    immutable=row.immutable,
                    created_at=row.created_at,
                    payload_json=getattr(row, "payload_json", "{}"),
                    signature=getattr(row, "signature", ""),
                    expires_at=getattr(row, "expires_at", None),
                    revoked=True,
                    input_digest=getattr(row, "input_digest", ""),
                    key_id=getattr(row, "key_id", ""),
                )

    async def get_live_gate(self, gate_id: str = "v1.1-live") -> LiveGateRecord | None:
        async with self.factory() as session:
            row = await session.get(LiveGateRow, gate_id)
            if row is None:
                return None
            return LiveGateRecord(
                gate_id=row.gate_id,
                decision=row.decision,
                evidence_ref=row.evidence_ref,
                signed_by=row.signed_by,
                immutable=row.immutable,
                created_at=row.created_at,
                payload_json=getattr(row, "payload_json", "{}"),
                signature=getattr(row, "signature", ""),
                expires_at=getattr(row, "expires_at", None),
                revoked=getattr(row, "revoked", False),
                input_digest=getattr(row, "input_digest", ""),
                key_id=getattr(row, "key_id", ""),
            )

    async def claim_orchestrator(
        self, worker_id: str, fencing_token: int, lease_key: str = "rollout-orchestrator"
    ) -> bool:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(RolloutLeaseRow, lease_key, with_for_update=True)
                now = datetime.now(UTC)
                if row and row.lease_until > now and row.owner and row.owner != worker_id:
                    return False
                if row is None:
                    session.add(
                        RolloutLeaseRow(
                            lease_key=lease_key,
                            owner=worker_id,
                            lease_until=now + timedelta(seconds=30),
                            fencing_token=fencing_token,
                        )
                    )
                else:
                    row.owner = worker_id
                    row.lease_until = now + timedelta(seconds=30)
                    row.fencing_token = fencing_token
                return True

    async def replace_depots(self, campaign_id: str, depots: list[DepotLaneRecord]) -> None:
        async with self.factory() as session:
            async with session.begin():
                await session.execute(delete(RolloutDepotRow).where(RolloutDepotRow.campaign_id == campaign_id))
                for item in depots:
                    session.add(
                        RolloutDepotRow(
                            campaign_id=item.campaign_id,
                            depot_id=item.depot_id,
                            status=item.status,
                            client_ids_json=json.dumps(item.client_ids),
                            mapping_digest=item.mapping_digest,
                            timezone=item.timezone,
                            attestation_digest=item.attestation_digest,
                            failure_count=item.failure_count,
                        )
                    )

    async def list_depots(self, campaign_id: str) -> list[DepotLaneRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(RolloutDepotRow).where(RolloutDepotRow.campaign_id == campaign_id))
            ).scalars()
            return [
                DepotLaneRecord(
                    campaign_id=row.campaign_id,
                    depot_id=row.depot_id,
                    status=row.status,
                    client_ids=_ids(row.client_ids_json),
                    mapping_digest=row.mapping_digest,
                    timezone=row.timezone,
                    attestation_digest=row.attestation_digest,
                    failure_count=row.failure_count,
                )
                for row in rows
            ]

    async def put_depot(self, record: DepotLaneRecord) -> None:
        existing = [item for item in await self.list_depots(record.campaign_id) if item.depot_id != record.depot_id]
        existing.append(record)
        await self.replace_depots(record.campaign_id, existing)

    async def replace_rings(self, campaign_id: str, rings: list[RingRecord]) -> None:
        async with self.factory() as session:
            async with session.begin():
                await session.execute(delete(RolloutRingRow).where(RolloutRingRow.campaign_id == campaign_id))
                for item in rings:
                    session.add(
                        RolloutRingRow(
                            campaign_id=item.campaign_id,
                            ring_index=item.ring_index,
                            status=item.status,
                            client_ids_json=json.dumps(item.client_ids),
                            observe_hours=item.observe_hours,
                            approved=item.approved,
                            observe_until=item.observe_until,
                            observe_started_at=item.observe_started_at,
                        )
                    )

    async def list_rings(self, campaign_id: str) -> list[RingRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(
                    select(RolloutRingRow)
                    .where(RolloutRingRow.campaign_id == campaign_id)
                    .order_by(RolloutRingRow.ring_index)
                )
            ).scalars()
            return [
                RingRecord(
                    campaign_id=row.campaign_id,
                    ring_index=row.ring_index,
                    status=row.status,
                    client_ids=_ids(row.client_ids_json),
                    observe_hours=row.observe_hours,
                    approved=row.approved,
                    observe_until=row.observe_until,
                    observe_started_at=getattr(row, "observe_started_at", None),
                )
                for row in rows
            ]

    async def put_ring(self, record: RingRecord) -> None:
        existing = [item for item in await self.list_rings(record.campaign_id) if item.ring_index != record.ring_index]
        existing.append(record)
        await self.replace_rings(record.campaign_id, existing)

    async def put_attestation(self, record: AttestationRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                session.add(
                    DepotAttestationRow(
                        depot_id=record.depot_id,
                        product_id=record.product_id,
                        product_version=record.product_version,
                        package_version=record.package_version,
                        artifact_digest=record.artifact_digest,
                        issuer=record.issuer,
                        generated_at=record.generated_at,
                        expires_at=record.expires_at,
                        signature=record.signature,
                        evidence_ref=record.evidence_ref,
                        revoked=record.revoked,
                        algorithm=record.algorithm,
                        key_id=record.key_id,
                        envelope_digest=record.envelope_digest,
                        signer_key_id=record.signer_key_id,
                        readback_digest=record.readback_digest,
                        readback_observed_at=record.readback_observed_at,
                    )
                )

    async def get_attestation(self, depot_id: str, artifact_digest: str) -> AttestationRecord | None:
        async with self.factory() as session:
            row = (
                await session.execute(
                    select(DepotAttestationRow).where(
                        DepotAttestationRow.depot_id == depot_id,
                        DepotAttestationRow.artifact_digest == artifact_digest,
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            return _attestation_from_row(row)

    async def list_attestations(self) -> list[AttestationRecord]:
        async with self.factory() as session:
            rows = (await session.execute(select(DepotAttestationRow))).scalars()
            return [_attestation_from_row(row) for row in rows]

    async def put_freeze(self, record: FreezeRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(ReleaseFreezeRow, record.freeze_id)
                if row is None:
                    session.add(
                        ReleaseFreezeRow(
                            freeze_id=record.freeze_id,
                            revision=record.revision,
                            active=record.active,
                            cause=record.cause,
                            actor_id=record.actor_id,
                            cleared_by=record.cleared_by,
                            created_at=record.created_at,
                        )
                    )
                else:
                    row.revision = record.revision
                    row.active = record.active
                    row.cause = record.cause
                    row.cleared_by = record.cleared_by

    async def get_active_freeze(self) -> FreezeRecord | None:
        async with self.factory() as session:
            row = (
                (await session.execute(select(ReleaseFreezeRow).where(ReleaseFreezeRow.active.is_(True))))
                .scalars()
                .first()
            )
            if row is None:
                return None
            return FreezeRecord(
                freeze_id=row.freeze_id,
                revision=row.revision,
                active=row.active,
                cause=row.cause,
                actor_id=row.actor_id,
                created_at=row.created_at,
                cleared_by=row.cleared_by,
            )

    async def get_freeze(self, freeze_id: str) -> FreezeRecord | None:
        async with self.factory() as session:
            row = await session.get(ReleaseFreezeRow, freeze_id)
            if row is None:
                return None
            return FreezeRecord(
                freeze_id=row.freeze_id,
                revision=row.revision,
                active=row.active,
                cause=row.cause,
                actor_id=row.actor_id,
                created_at=row.created_at,
                cleared_by=row.cleared_by,
            )

    async def put_compliance(self, record: ComplianceSnapshotRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                session.add(
                    FleetComplianceRow(
                        snapshot_id=record.snapshot_id,
                        campaign_id=record.campaign_id,
                        payload_json=record.payload_json,
                        digest=record.digest,
                        created_at=record.created_at,
                    )
                )

    async def list_compliance(self, *, cursor: str | None = None, limit: int = 50) -> list[ComplianceSnapshotRecord]:
        async with self.factory() as session:
            stmt = select(FleetComplianceRow).order_by(FleetComplianceRow.snapshot_id)
            if cursor:
                stmt = stmt.where(FleetComplianceRow.snapshot_id > cursor)
            stmt = stmt.limit(max(1, min(limit, 100)))
            rows = (await session.execute(stmt)).scalars()
            return [
                ComplianceSnapshotRecord(
                    snapshot_id=row.snapshot_id,
                    campaign_id=row.campaign_id,
                    payload_json=row.payload_json,
                    digest=row.digest,
                    created_at=row.created_at,
                )
                for row in rows
            ]

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

    async def add_outbox(self, record: OutboxRecord) -> OutboxRecord:
        async with self.factory() as session:
            async with session.begin():
                row = RolloutOutboxRow(
                    campaign_id=record.campaign_id,
                    kind=record.kind,
                    payload_json=record.payload_json,
                    published=record.published,
                )
                session.add(row)
                await session.flush()
                record.id = row.id
                return record

    async def put_verification(self, record: TargetVerificationStoreRecord) -> TargetVerificationStoreRecord:
        async with self.factory() as session:
            async with session.begin():
                existing = (
                    await session.execute(
                        select(TargetVerificationRow).where(
                            TargetVerificationRow.campaign_id == record.campaign_id,
                            TargetVerificationRow.client_id == record.client_id,
                            TargetVerificationRow.action_id == record.action_id,
                            TargetVerificationRow.kind == record.kind,
                        )
                    )
                ).scalar_one_or_none()
                if existing and existing.canonical_digest != record.canonical_digest:
                    raise OpsiControlError(ErrorCode.CONFLICT, "verification digest conflict", status_code=409)
                if existing is None:
                    session.add(_verification_to_row(record))
                return record

    async def get_verification(
        self, campaign_id: str, client_id: str, action_id: str, kind: str
    ) -> TargetVerificationStoreRecord | None:
        async with self.factory() as session:
            row = (
                await session.execute(
                    select(TargetVerificationRow).where(
                        TargetVerificationRow.campaign_id == campaign_id,
                        TargetVerificationRow.client_id == client_id,
                        TargetVerificationRow.action_id == action_id,
                        TargetVerificationRow.kind == kind,
                    )
                )
            ).scalar_one_or_none()
            return _verification_from_row(row) if row else None

    async def list_verifications(self, campaign_id: str) -> list[TargetVerificationStoreRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(
                    select(TargetVerificationRow).where(TargetVerificationRow.campaign_id == campaign_id)
                )
            ).scalars()
            return [_verification_from_row(row) for row in rows]


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
        mode=record.mode,
        mapping_digest=record.mapping_digest,
        freeze_revision=record.freeze_revision,
        pilot_policy_revision=record.pilot_policy_revision,
        pilot_policy_digest=record.pilot_policy_digest,
        production_policy_revision=record.production_policy_revision,
        production_policy_digest=record.production_policy_digest,
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
        mode=getattr(row, "mode", "pilot"),
        mapping_digest=getattr(row, "mapping_digest", ""),
        freeze_revision=getattr(row, "freeze_revision", 0),
        pilot_policy_revision=getattr(row, "pilot_policy_revision", "accelerated-v1.4"),
        pilot_policy_digest=getattr(row, "pilot_policy_digest", ""),
        production_policy_revision=getattr(row, "production_policy_revision", ""),
        production_policy_digest=getattr(row, "production_policy_digest", ""),
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
    row.mode = record.mode
    row.mapping_digest = record.mapping_digest
    row.freeze_revision = record.freeze_revision
    row.pilot_policy_revision = record.pilot_policy_revision
    row.pilot_policy_digest = record.pilot_policy_digest
    row.production_policy_revision = record.production_policy_revision
    row.production_policy_digest = record.production_policy_digest


def _batch_to_row(record: BatchRecord) -> RolloutBatchRow:
    return RolloutBatchRow(
        campaign_id=record.campaign_id,
        batch_index=record.batch_index,
        status=record.status,
        client_ids_json=json.dumps(record.client_ids),
        observe_hours=record.observe_hours,
        approved=record.approved,
        dispatched=record.dispatched,
        observe_until=record.observe_until,
        observe_started_at=record.observe_started_at,
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
        observe_until=getattr(row, "observe_until", None),
        observe_started_at=getattr(row, "observe_started_at", None),
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
        depot_id=record.depot_id,
        ring_index=record.ring_index,
        healthy_at=record.healthy_at,
        parent_action_id=record.parent_action_id,
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
        depot_id=getattr(row, "depot_id", ""),
        ring_index=getattr(row, "ring_index", 0),
        healthy_at=getattr(row, "healthy_at", None),
        parent_action_id=getattr(row, "parent_action_id", ""),
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
    row.depot_id = record.depot_id
    row.ring_index = record.ring_index
    row.healthy_at = record.healthy_at
    row.parent_action_id = record.parent_action_id


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


def _attestation_from_row(row: DepotAttestationRow) -> AttestationRecord:
    return AttestationRecord(
        depot_id=row.depot_id,
        product_id=row.product_id,
        product_version=row.product_version,
        package_version=row.package_version,
        artifact_digest=row.artifact_digest,
        issuer=row.issuer,
        generated_at=row.generated_at,
        expires_at=row.expires_at,
        signature=row.signature,
        evidence_ref=row.evidence_ref,
        revoked=row.revoked,
        algorithm=getattr(row, "algorithm", "Ed25519"),
        key_id=getattr(row, "key_id", ""),
        envelope_digest=getattr(row, "envelope_digest", ""),
        signer_key_id=getattr(row, "signer_key_id", ""),
        readback_digest=getattr(row, "readback_digest", ""),
        readback_observed_at=getattr(row, "readback_observed_at", None),
    )


def _verification_to_row(record: TargetVerificationStoreRecord) -> TargetVerificationRow:
    return TargetVerificationRow(
        campaign_id=record.campaign_id,
        client_id=record.client_id,
        action_id=record.action_id,
        kind=record.kind,
        action_result_digest=record.action_result_digest,
        parent_result_digest=record.parent_result_digest,
        product_readback_digest=record.product_readback_digest,
        inventory_digest=record.inventory_digest,
        gateway_evidence_ref=record.gateway_evidence_ref,
        work_evidence_ref=record.work_evidence_ref,
        desired_version=record.desired_version,
        desired_package=record.desired_package,
        desired_artifact=record.desired_artifact,
        desired_config=record.desired_config,
        desired_owner=record.desired_owner,
        observed_version=record.observed_version,
        observed_package=record.observed_package,
        observed_artifact=record.observed_artifact,
        observed_config=record.observed_config,
        observed_owner=record.observed_owner,
        observed_tasks=record.observed_tasks,
        observed_health=record.observed_health,
        decision=record.decision,
        reason=record.reason,
        observed_at=record.observed_at,
        expires_at=record.expires_at,
        canonical_digest=record.canonical_digest,
    )


def _verification_from_row(row: TargetVerificationRow) -> TargetVerificationStoreRecord:
    return TargetVerificationStoreRecord(
        campaign_id=row.campaign_id,
        client_id=row.client_id,
        action_id=row.action_id,
        kind=row.kind,
        action_result_digest=row.action_result_digest,
        parent_result_digest=row.parent_result_digest,
        product_readback_digest=row.product_readback_digest,
        inventory_digest=row.inventory_digest,
        gateway_evidence_ref=row.gateway_evidence_ref,
        work_evidence_ref=row.work_evidence_ref,
        desired_version=row.desired_version,
        desired_package=row.desired_package,
        desired_artifact=row.desired_artifact,
        desired_config=row.desired_config,
        desired_owner=row.desired_owner,
        observed_version=row.observed_version,
        observed_package=row.observed_package,
        observed_artifact=row.observed_artifact,
        observed_config=row.observed_config,
        observed_owner=row.observed_owner,
        observed_tasks=row.observed_tasks,
        observed_health=row.observed_health,
        decision=row.decision,
        reason=row.reason,
        observed_at=row.observed_at,
        expires_at=row.expires_at,
        canonical_digest=row.canonical_digest,
    )
