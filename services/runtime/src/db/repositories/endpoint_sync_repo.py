"""CRUD for v1.5 endpoint sync tables."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.enums import DeliveryOutboxStatus, SyncAckOutboxStatus
from db.models.endpoint_sync import (
    DeliveryOutbox,
    DesiredStateResource,
    DesiredStateRevision,
    EndpointCredential,
    EndpointEnrollment,
    EndpointInventorySnapshot,
    ExperienceCandidate,
    ExperienceEvidence,
    ExperienceSubmissionRecord,
    RemoteTaskAssignment,
    ResourceConflict,
    ResourceInstallation,
    ResultArtifact,
    SyncAckOutbox,
    SyncChannel,
    SyncCursor,
    SyncInbox,
    SyncPoisonMessage,
    SyncReplayNonce,
    TaskDeliveryRecord,
    TaskLease,
)


class EndpointSyncRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    # --- enrollment / credentials ---

    async def get_latest_enrollment(self) -> EndpointEnrollment | None:
        result = await self._s.execute(
            select(EndpointEnrollment).order_by(EndpointEnrollment.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def get_enrollment(self, enrollment_id: str) -> EndpointEnrollment | None:
        return await self._s.get(EndpointEnrollment, enrollment_id)

    async def get_active_enrollment(self) -> EndpointEnrollment | None:
        result = await self._s.execute(
            select(EndpointEnrollment)
            .where(EndpointEnrollment.enrollment_status == "completed")
            .order_by(EndpointEnrollment.completed_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def add_enrollment(self, row: EndpointEnrollment) -> EndpointEnrollment:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def save_enrollment(self, row: EndpointEnrollment) -> EndpointEnrollment:
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_credential(self, endpoint_id: str | None = None) -> EndpointCredential | None:
        stmt = select(EndpointCredential).where(EndpointCredential.status == "active")
        if endpoint_id:
            stmt = stmt.where(EndpointCredential.endpoint_id == endpoint_id)
        result = await self._s.execute(stmt.order_by(EndpointCredential.created_at.desc()).limit(1))
        return result.scalar_one_or_none()

    async def add_credential(self, row: EndpointCredential) -> EndpointCredential:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def save_credential(self, row: EndpointCredential) -> EndpointCredential:
        await self._s.flush()
        await self._s.refresh(row)
        return row

    # --- sync channels / cursors / inbox ---

    async def ensure_channel(self, channel: str) -> SyncChannel:
        result = await self._s.execute(select(SyncChannel).where(SyncChannel.channel == channel))
        row = result.scalar_one_or_none()
        if row is None:
            row = SyncChannel(channel=channel, enabled=True, status="idle")
            self._s.add(row)
            await self._s.flush()
            await self._s.refresh(row)
        return row

    async def list_channels(self) -> list[SyncChannel]:
        result = await self._s.execute(select(SyncChannel).order_by(SyncChannel.channel))
        return list(result.scalars().all())

    async def get_cursor(self, channel: str) -> SyncCursor | None:
        result = await self._s.execute(select(SyncCursor).where(SyncCursor.channel == channel))
        return result.scalar_one_or_none()

    async def upsert_cursor(self, channel: str, cursor_value: str) -> SyncCursor:
        row = await self.get_cursor(channel)
        if row is None:
            row = SyncCursor(channel=channel, cursor_value=cursor_value)
            self._s.add(row)
        else:
            row.cursor_value = cursor_value
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_inbox_by_message_id(self, message_id: str) -> SyncInbox | None:
        result = await self._s.execute(select(SyncInbox).where(SyncInbox.message_id == message_id))
        return result.scalar_one_or_none()

    async def add_inbox(self, row: SyncInbox) -> SyncInbox:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_unprocessed_inbox(self, *, limit: int = 100) -> list[SyncInbox]:
        result = await self._s.execute(
            select(SyncInbox)
            .where(SyncInbox.status.in_(("received", "pending")))
            .order_by(SyncInbox.received_at)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_last_processed_sequence(self, channel: str) -> int | None:
        result = await self._s.execute(
            select(SyncInbox.sequence)
            .where(
                SyncInbox.channel == channel,
                SyncInbox.sequence.is_not(None),
                SyncInbox.status.in_(("processed", "ignored", "quarantined")),
            )
            .order_by(SyncInbox.sequence.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def has_replay_nonce(self, nonce: str) -> bool:
        result = await self._s.execute(select(SyncReplayNonce.nonce).where(SyncReplayNonce.nonce == nonce))
        return result.scalar_one_or_none() is not None

    async def add_replay_nonce(self, row: SyncReplayNonce) -> SyncReplayNonce:
        self._s.add(row)
        await self._s.flush()
        return row

    async def add_ack_outbox(self, row: SyncAckOutbox) -> SyncAckOutbox:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_ack_outbox_by_message_id(self, message_id: str) -> SyncAckOutbox | None:
        result = await self._s.execute(select(SyncAckOutbox).where(SyncAckOutbox.message_id == message_id))
        return result.scalar_one_or_none()

    async def list_due_ack_outbox(self, *, limit: int = 100) -> list[SyncAckOutbox]:
        now = datetime.now(UTC)
        result = await self._s.execute(
            select(SyncAckOutbox)
            .where(
                SyncAckOutbox.status.in_(
                    (
                        SyncAckOutboxStatus.PENDING.value,
                        SyncAckOutboxStatus.RETRY.value,
                    )
                ),
                or_(SyncAckOutbox.next_attempt_at.is_(None), SyncAckOutbox.next_attempt_at <= now),
            )
            .order_by(SyncAckOutbox.created_at)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def add_poison_message(self, row: SyncPoisonMessage) -> SyncPoisonMessage:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_poison_by_message_id(self, message_id: str) -> SyncPoisonMessage | None:
        result = await self._s.execute(select(SyncPoisonMessage).where(SyncPoisonMessage.message_id == message_id))
        return result.scalar_one_or_none()

    # --- delivery outbox ---

    async def add_outbox(self, row: DeliveryOutbox) -> DeliveryOutbox:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_due_outbox(self, *, limit: int = 100) -> list[DeliveryOutbox]:
        now = datetime.now(UTC)
        result = await self._s.execute(
            select(DeliveryOutbox)
            .where(
                DeliveryOutbox.status.in_(
                    (
                        DeliveryOutboxStatus.PENDING.value,
                        DeliveryOutboxStatus.RETRY.value,
                    )
                ),
                or_(DeliveryOutbox.next_attempt_at.is_(None), DeliveryOutbox.next_attempt_at <= now),
            )
            .order_by(DeliveryOutbox.created_at)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_dead_letters(self, *, limit: int = 100) -> list[DeliveryOutbox]:
        result = await self._s.execute(
            select(DeliveryOutbox)
            .where(DeliveryOutbox.status == DeliveryOutboxStatus.DEAD_LETTER.value)
            .order_by(DeliveryOutbox.updated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_outbox(self, outbox_id: str) -> DeliveryOutbox | None:
        return await self._s.get(DeliveryOutbox, outbox_id)

    # --- desired state / resources ---

    async def get_revision_by_number(self, revision: int) -> DesiredStateRevision | None:
        result = await self._s.execute(select(DesiredStateRevision).where(DesiredStateRevision.revision == revision))
        return result.scalar_one_or_none()

    async def get_latest_revision(self) -> DesiredStateRevision | None:
        result = await self._s.execute(
            select(DesiredStateRevision).order_by(DesiredStateRevision.revision.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def add_revision(self, row: DesiredStateRevision) -> DesiredStateRevision:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def add_desired_resource(self, row: DesiredStateResource) -> DesiredStateResource:
        self._s.add(row)
        await self._s.flush()
        return row

    async def list_desired_resources(self, revision_id: str) -> list[DesiredStateResource]:
        result = await self._s.execute(
            select(DesiredStateResource).where(DesiredStateResource.revision_id == revision_id)
        )
        return list(result.scalars().all())

    async def list_installations(self) -> list[ResourceInstallation]:
        result = await self._s.execute(select(ResourceInstallation))
        return list(result.scalars().all())

    async def get_installation(self, resource_type: str, resource_id: str) -> ResourceInstallation | None:
        result = await self._s.execute(
            select(ResourceInstallation).where(
                ResourceInstallation.resource_type == resource_type,
                ResourceInstallation.resource_id == resource_id,
            )
        )
        return result.scalar_one_or_none()

    async def upsert_installation(self, row: ResourceInstallation) -> ResourceInstallation:
        existing = await self.get_installation(row.resource_type, row.resource_id)
        if existing is None:
            self._s.add(row)
            await self._s.flush()
            await self._s.refresh(row)
            return row
        existing.installed_version = row.installed_version
        existing.desired_version = row.desired_version
        existing.status = row.status
        existing.checksum = row.checksum
        existing.local_path = row.local_path
        existing.applied_revision = row.applied_revision
        existing.installed_at = row.installed_at
        await self._s.flush()
        await self._s.refresh(existing)
        return existing

    async def delete_installation(self, resource_type: str, resource_id: str) -> None:
        row = await self.get_installation(resource_type, resource_id)
        if row is not None:
            await self._s.delete(row)
            await self._s.flush()

    async def list_conflicts(self, *, open_only: bool = True) -> list[ResourceConflict]:
        stmt = select(ResourceConflict)
        if open_only:
            stmt = stmt.where(ResourceConflict.status == "open")
        result = await self._s.execute(stmt.order_by(ResourceConflict.created_at.desc()))
        return list(result.scalars().all())

    async def get_conflict(self, conflict_id: str) -> ResourceConflict | None:
        return await self._s.get(ResourceConflict, conflict_id)

    async def add_conflict(self, row: ResourceConflict) -> ResourceConflict:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    # --- remote tasks ---

    async def get_assignment_by_version(
        self, assignment_id: str, assignment_version: int
    ) -> RemoteTaskAssignment | None:
        result = await self._s.execute(
            select(RemoteTaskAssignment).where(
                RemoteTaskAssignment.assignment_id == assignment_id,
                RemoteTaskAssignment.assignment_version == assignment_version,
            )
        )
        return result.scalar_one_or_none()

    async def get_assignment_row(self, row_id: str) -> RemoteTaskAssignment | None:
        return await self._s.get(RemoteTaskAssignment, row_id)

    async def get_assignment_by_assignment_id(self, assignment_id: str) -> RemoteTaskAssignment | None:
        result = await self._s.execute(
            select(RemoteTaskAssignment)
            .where(RemoteTaskAssignment.assignment_id == assignment_id)
            .order_by(RemoteTaskAssignment.assignment_version.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_assignments(self, *, limit: int = 100) -> list[RemoteTaskAssignment]:
        result = await self._s.execute(
            select(RemoteTaskAssignment).order_by(RemoteTaskAssignment.created_at.desc()).limit(limit)
        )
        return list(result.scalars().all())

    async def add_assignment(self, row: RemoteTaskAssignment) -> RemoteTaskAssignment:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def add_lease(self, row: TaskLease) -> TaskLease:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_active_lease(self, assignment_id: str) -> TaskLease | None:
        result = await self._s.execute(
            select(TaskLease)
            .where(TaskLease.assignment_id == assignment_id, TaskLease.status == "active")
            .order_by(TaskLease.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_active_leases(self) -> list[TaskLease]:
        result = await self._s.execute(
            select(TaskLease).where(TaskLease.status == "active").order_by(TaskLease.created_at)
        )
        return list(result.scalars().all())

    async def add_delivery_record(self, row: TaskDeliveryRecord) -> TaskDeliveryRecord:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_delivery_records(self, assignment_id: str) -> list[TaskDeliveryRecord]:
        result = await self._s.execute(
            select(TaskDeliveryRecord)
            .where(TaskDeliveryRecord.assignment_id == assignment_id)
            .order_by(TaskDeliveryRecord.created_at)
        )
        return list(result.scalars().all())

    async def add_artifact(self, row: ResultArtifact) -> ResultArtifact:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    # --- inventory ---

    async def add_inventory(self, row: EndpointInventorySnapshot) -> EndpointInventorySnapshot:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_latest_inventory(self, endpoint_id: str) -> EndpointInventorySnapshot | None:
        result = await self._s.execute(
            select(EndpointInventorySnapshot)
            .where(EndpointInventorySnapshot.endpoint_id == endpoint_id)
            .order_by(EndpointInventorySnapshot.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # --- experience ---

    async def add_evidence(self, row: ExperienceEvidence) -> ExperienceEvidence:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_evidence(self, evidence_id: str) -> ExperienceEvidence | None:
        return await self._s.get(ExperienceEvidence, evidence_id)

    async def list_evidence(self, *, limit: int = 100) -> list[ExperienceEvidence]:
        result = await self._s.execute(
            select(ExperienceEvidence).order_by(ExperienceEvidence.created_at.desc()).limit(limit)
        )
        return list(result.scalars().all())

    async def delete_evidence(self, evidence_id: str) -> bool:
        row = await self.get_evidence(evidence_id)
        if row is None:
            return False
        await self._s.delete(row)
        await self._s.flush()
        return True

    async def add_candidate(self, row: ExperienceCandidate) -> ExperienceCandidate:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_candidate(self, candidate_id: str) -> ExperienceCandidate | None:
        return await self._s.get(ExperienceCandidate, candidate_id)

    async def list_candidates(self, *, limit: int = 100) -> list[ExperienceCandidate]:
        result = await self._s.execute(
            select(ExperienceCandidate).order_by(ExperienceCandidate.created_at.desc()).limit(limit)
        )
        return list(result.scalars().all())

    async def delete_candidate(self, candidate_id: str) -> bool:
        row = await self.get_candidate(candidate_id)
        if row is None:
            return False
        await self._s.delete(row)
        await self._s.flush()
        return True

    async def add_submission(self, row: ExperienceSubmissionRecord) -> ExperienceSubmissionRecord:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_submissions_for_candidate(self, candidate_id: str) -> list[ExperienceSubmissionRecord]:
        result = await self._s.execute(
            select(ExperienceSubmissionRecord).where(ExperienceSubmissionRecord.candidate_id == candidate_id)
        )
        return list(result.scalars().all())
