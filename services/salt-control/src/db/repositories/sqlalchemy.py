from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.errors import ErrorCode, SaltControlError
from db import models
from db.repositories.interfaces import (
    ArtifactRecord,
    ArtifactRepository,
    AuditEventRecord,
    AuditRepository,
    BindingRecord,
    BindingRepository,
    DesiredStateRecord,
    DesiredStateRepository,
    EndpointOperationRecord,
    EndpointRecord,
    EndpointRepository,
    EnrollmentRecord,
    EnrollmentRepository,
    IdempotencyRecord,
    IdempotencyRepository,
    JobReturnRecord,
    JobReturnRepository,
    OperationRepository,
    OperationStepRecord,
    PendingTokenRecord,
    PendingTokenRepository,
    RepositoryBundle,
    RolloutRecord,
    RolloutRepository,
    RolloutTargetRecord,
)
from db.repositories.job_sqlalchemy import SqlAlchemyControlJobRepository, SqlAlchemySecretScopeRepository
from db.repositories.v24 import (
    SqlAlchemyControlPlaneIncidentRepository,
    SqlAlchemyEndpointFactSampleRepository,
    SqlAlchemyEndpointObservationRepository,
    SqlAlchemyRolloutApprovalRepository,
    SqlAlchemyRolloutObservationRepository,
    SqlAlchemyRolloutTargetJobRepository,
)


def _dt(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


class SqlAlchemyEndpointRepository(EndpointRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, record: EndpointRecord) -> EndpointRecord:
        row = models.Endpoint(
            id=record.id,
            tenant_id=record.tenant_id,
            machine_guid_hash=record.machine_guid_hash,
            hostname=record.hostname,
            platform=record.platform,
            arch=record.arch,
            status=record.status,
            device_credential_hash=record.device_credential_hash,
            created_at=record.created_at,
            last_seen_at=record.last_seen_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record

    async def get(self, endpoint_id: str) -> EndpointRecord | None:
        row = await self._session.get(models.Endpoint, endpoint_id)
        return _endpoint(row) if row else None

    async def get_by_credential_hash(self, credential_hash: str) -> EndpointRecord | None:
        result = await self._session.execute(
            select(models.Endpoint).where(models.Endpoint.device_credential_hash == credential_hash)
        )
        row = result.scalar_one_or_none()
        return _endpoint(row) if row else None

    async def get_by_machine_guid_hash(self, machine_guid_hash: str) -> EndpointRecord | None:
        result = await self._session.execute(
            select(models.Endpoint).where(models.Endpoint.machine_guid_hash == machine_guid_hash)
        )
        row = result.scalar_one_or_none()
        return _endpoint(row) if row else None


class SqlAlchemyBindingRepository(BindingRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, record: BindingRecord) -> BindingRecord:
        result = await self._session.execute(
            select(models.EndpointUserBinding).where(
                models.EndpointUserBinding.endpoint_id == record.endpoint_id,
                models.EndpointUserBinding.active.is_(True),
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = models.EndpointUserBinding(endpoint_id=record.endpoint_id)
            self._session.add(row)
        row.user_id = record.user_id
        row.windows_account = record.windows_account
        row.windows_sid = record.windows_sid
        row.profile_dir = record.profile_dir
        row.active = record.active
        row.revision = record.revision
        row.bound_at = record.bound_at
        row.revoked_at = record.revoked_at
        await self._session.flush()
        return record

    async def get_active(self, endpoint_id: str) -> BindingRecord | None:
        result = await self._session.execute(
            select(models.EndpointUserBinding).where(
                models.EndpointUserBinding.endpoint_id == endpoint_id,
                models.EndpointUserBinding.active.is_(True),
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return BindingRecord(
            endpoint_id=row.endpoint_id,
            user_id=row.user_id,
            windows_account=row.windows_account,
            windows_sid=row.windows_sid,
            profile_dir=row.profile_dir,
            active=row.active,
            revision=row.revision,
            bound_at=_dt(row.bound_at) or datetime.now(UTC),
            revoked_at=_dt(row.revoked_at),
        )


class SqlAlchemyEnrollmentRepository(EnrollmentRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, record: EnrollmentRecord) -> EnrollmentRecord:
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        row = models.Enrollment(
            id=record.id,
            endpoint_id=record.endpoint_id,
            token_hash=record.token_hash,
            state=record.state,
            local_fingerprint=record.local_fingerprint,
            master_fingerprints=list(record.master_fingerprints),
            expires_at=record.expires_at,
            completed_at=record.completed_at,
            error_code=record.error_code,
            request_id=record.request_id,
            created_at=record.created_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record

    async def get(self, enrollment_id: str) -> EnrollmentRecord | None:
        row = await self._session.get(models.Enrollment, enrollment_id)
        return _enrollment(row) if row else None

    async def get_by_request_id(self, request_id: str) -> EnrollmentRecord | None:
        result = await self._session.execute(
            select(models.Enrollment).where(models.Enrollment.request_id == request_id)
        )
        row = result.scalar_one_or_none()
        return _enrollment(row) if row else None

    async def get_by_token_hash(self, token_hash: str) -> EnrollmentRecord | None:
        result = await self._session.execute(
            select(models.Enrollment).where(models.Enrollment.token_hash == token_hash)
        )
        row = result.scalar_one_or_none()
        return _enrollment(row) if row else None

    async def update(self, record: EnrollmentRecord) -> EnrollmentRecord:
        row = await self._session.get(models.Enrollment, record.id)
        if row is None:
            raise KeyError(record.id)
        row.state = record.state
        row.local_fingerprint = record.local_fingerprint
        row.master_fingerprints = list(record.master_fingerprints)
        row.expires_at = record.expires_at
        row.completed_at = record.completed_at
        row.error_code = record.error_code
        row.request_id = record.request_id
        await self._session.flush()
        return record


class SqlAlchemyPendingTokenRepository(PendingTokenRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, token_hash: str) -> PendingTokenRecord | None:
        row = await self._session.get(models.EnrollmentToken, token_hash)
        if row is None:
            return None
        return PendingTokenRecord(
            token_hash=row.token_hash,
            tenant_id=row.tenant_id,
            expires_at=_dt(row.expires_at) or datetime.now(UTC),
            used=row.used,
            batch_id=row.batch_id,
        )

    async def mark_used(self, token_hash: str) -> None:
        row = await self._session.get(models.EnrollmentToken, token_hash)
        if row:
            row.used = True
            await self._session.flush()

    async def put(self, record: PendingTokenRecord) -> PendingTokenRecord:
        row = await self._session.get(models.EnrollmentToken, record.token_hash)
        if row is None:
            row = models.EnrollmentToken(token_hash=record.token_hash)
            self._session.add(row)
        row.tenant_id = record.tenant_id
        row.expires_at = record.expires_at
        row.used = record.used
        row.batch_id = record.batch_id
        await self._session.flush()
        return record


class SqlAlchemyDesiredStateRepository(DesiredStateRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_latest(self, endpoint_id: str) -> DesiredStateRecord | None:
        result = await self._session.execute(
            select(models.DesiredStateRevision)
            .where(models.DesiredStateRevision.endpoint_id == endpoint_id)
            .order_by(models.DesiredStateRevision.created_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return DesiredStateRecord(
            id=row.id,
            endpoint_id=row.endpoint_id,
            user_id=row.user_id,
            revision=row.revision,
            payload_json=dict(row.payload_json or {}),
            checksum=row.checksum,
            source_revision=row.source_revision,
            created_at=_dt(row.created_at),
        )

    async def put(self, record: DesiredStateRecord) -> DesiredStateRecord:
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        row = models.DesiredStateRevision(
            id=record.id,
            endpoint_id=record.endpoint_id,
            user_id=record.user_id,
            revision=record.revision,
            payload_json=record.payload_json,
            checksum=record.checksum,
            source_revision=record.source_revision,
            created_at=record.created_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record


class SqlAlchemyJobReturnRepository(JobReturnRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, record: JobReturnRecord) -> tuple[JobReturnRecord, bool]:
        result = await self._session.execute(
            select(models.JobReturn).where(
                models.JobReturn.jid == record.jid,
                models.JobReturn.endpoint_id == record.endpoint_id,
                models.JobReturn.function == record.function,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            return (
                JobReturnRecord(
                    jid=existing.jid,
                    endpoint_id=existing.endpoint_id,
                    function=existing.function,
                    success=existing.success,
                    payload_redacted=dict(existing.payload_redacted or {}),
                    received_at=_dt(existing.received_at) or record.received_at,
                ),
                False,
            )
        row = models.JobReturn(
            jid=record.jid,
            endpoint_id=record.endpoint_id,
            function=record.function,
            success=record.success,
            payload_redacted=record.payload_redacted,
            received_at=record.received_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record, True


class SqlAlchemyArtifactRepository(ArtifactRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self, component: str, version: str, platform: str = "windows", arch: str = "AMD64"
    ) -> ArtifactRecord | None:
        result = await self._session.execute(
            select(models.ArtifactManifest).where(
                models.ArtifactManifest.component == component,
                models.ArtifactManifest.version == version,
                models.ArtifactManifest.platform == platform,
                models.ArtifactManifest.arch == arch,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return ArtifactRecord(
            component=row.component,
            version=row.version,
            platform=row.platform,
            arch=row.arch,
            size=row.size,
            sha256=row.sha256,
            url=row.url,
            manifest_signature=row.manifest_signature,
            key_id=row.key_id,
            rollback_version=row.rollback_version,
            released_at=_dt(row.released_at),
        )

    async def put(self, record: ArtifactRecord) -> ArtifactRecord:
        existing = await self.get(record.component, record.version, record.platform, record.arch)
        if existing is not None:
            result = await self._session.execute(
                select(models.ArtifactManifest).where(
                    models.ArtifactManifest.component == record.component,
                    models.ArtifactManifest.version == record.version,
                    models.ArtifactManifest.platform == record.platform,
                    models.ArtifactManifest.arch == record.arch,
                )
            )
            row = result.scalar_one()
            row.size = record.size
            row.sha256 = record.sha256
            row.url = record.url
            row.manifest_signature = record.manifest_signature
            row.key_id = record.key_id
            row.rollback_version = record.rollback_version
            await self._session.flush()
            return record
        row = models.ArtifactManifest(
            component=record.component,
            version=record.version,
            platform=record.platform,
            arch=record.arch,
            size=record.size,
            sha256=record.sha256,
            url=record.url,
            manifest_signature=record.manifest_signature,
            key_id=record.key_id,
            rollback_version=record.rollback_version,
            released_at=record.released_at or datetime.now(UTC),
        )
        self._session.add(row)
        await self._session.flush()
        return record


class SqlAlchemyRolloutRepository(RolloutRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, record: RolloutRecord) -> RolloutRecord:
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        row = models.Rollout(
            id=record.id,
            component=record.component,
            version=record.version,
            ring=record.ring,
            state=record.state,
            thresholds_json=record.thresholds_json,
            observation_started_at=record.observation_started_at,
            created_by=record.created_by,
            target_count=record.target_count,
            completed_count=record.completed_count,
            success_rate=record.success_rate,
            failure_rate=record.failure_rate,
            rollback_rate=record.rollback_rate,
            p0_count=record.p0_count,
            p1_count=record.p1_count,
            snapshot_digest=record.snapshot_digest,
            snapshot_json=record.snapshot_json,
            batch_index=record.batch_index,
            state_version=record.state_version,
            batch_started_at=record.batch_started_at,
            batch_observation_due_at=record.batch_observation_due_at,
            final_observation_started_at=record.final_observation_started_at,
            final_observation_due_at=record.final_observation_due_at,
            completed_at=record.completed_at,
            created_at=record.created_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record

    async def get(self, rollout_id: str) -> RolloutRecord | None:
        row = await self._session.get(models.Rollout, rollout_id)
        return _rollout(row) if row else None

    async def update(self, record: RolloutRecord, *, expected_version: int | None = None) -> RolloutRecord:
        row = await self._session.get(models.Rollout, record.id)
        if row is None:
            raise KeyError(record.id)
        current = int(row.state_version or 0)
        if expected_version is not None and current != expected_version:
            raise SaltControlError(ErrorCode.CONFLICT, "state_version conflict", status_code=409)
        result = await self._session.execute(
            update(models.Rollout)
            .where(models.Rollout.id == record.id, models.Rollout.state_version == current)
            .values(
                state=record.state,
                thresholds_json=record.thresholds_json,
                observation_started_at=record.observation_started_at,
                target_count=record.target_count,
                completed_count=record.completed_count,
                success_rate=record.success_rate,
                failure_rate=record.failure_rate,
                rollback_rate=record.rollback_rate,
                p0_count=record.p0_count,
                p1_count=record.p1_count,
                snapshot_digest=record.snapshot_digest,
                snapshot_json=record.snapshot_json,
                batch_index=record.batch_index,
                batch_started_at=record.batch_started_at,
                batch_observation_due_at=record.batch_observation_due_at,
                final_observation_started_at=record.final_observation_started_at,
                final_observation_due_at=record.final_observation_due_at,
                completed_at=record.completed_at,
                state_version=current + 1,
            )
        )
        if int(result.rowcount or 0) == 0:  # type: ignore[attr-defined]
            raise SaltControlError(ErrorCode.CONFLICT, "state_version conflict", status_code=409)
        record.state_version = current + 1
        return record

    async def add_target(self, target: RolloutTargetRecord) -> RolloutTargetRecord:
        row = models.RolloutTarget(
            rollout_id=target.rollout_id,
            endpoint_id=target.endpoint_id,
            state=target.state,
            attempt_count=target.attempt_count,
            last_error=target.last_error,
            batch_index=target.batch_index,
            state_version=target.state_version,
            source_job_id=target.source_job_id,
            reason_code=target.reason_code,
            observed_at=target.observed_at,
            state_changed_at=target.state_changed_at,
            observing_started_at=target.observing_started_at,
            observing_due_at=target.observing_due_at,
        )
        self._session.add(row)
        await self._session.flush()
        return target

    async def update_target(self, target: RolloutTargetRecord) -> RolloutTargetRecord:
        result = await self._session.execute(
            select(models.RolloutTarget).where(
                models.RolloutTarget.rollout_id == target.rollout_id,
                models.RolloutTarget.endpoint_id == target.endpoint_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return await self.add_target(target)
        row.state = target.state
        row.attempt_count = target.attempt_count
        row.last_error = target.last_error
        row.batch_index = target.batch_index
        row.state_version = int(row.state_version or 0) + 1
        row.source_job_id = target.source_job_id
        row.reason_code = target.reason_code
        row.observed_at = target.observed_at
        row.state_changed_at = target.state_changed_at
        row.observing_started_at = target.observing_started_at
        row.observing_due_at = target.observing_due_at
        await self._session.flush()
        target.state_version = row.state_version
        return target

    async def list_targets(self, rollout_id: str) -> list[RolloutTargetRecord]:
        result = await self._session.execute(
            select(models.RolloutTarget).where(models.RolloutTarget.rollout_id == rollout_id)
        )
        return [
            RolloutTargetRecord(
                rollout_id=r.rollout_id,
                endpoint_id=r.endpoint_id,
                state=r.state,
                attempt_count=r.attempt_count,
                last_error=r.last_error,
                batch_index=r.batch_index,
                state_version=r.state_version,
                source_job_id=r.source_job_id,
                reason_code=r.reason_code,
                observed_at=_dt(r.observed_at),
                state_changed_at=_dt(getattr(r, "state_changed_at", None)),
                observing_started_at=_dt(getattr(r, "observing_started_at", None)),
                observing_due_at=_dt(getattr(r, "observing_due_at", None)),
            )
            for r in result.scalars().all()
        ]

    async def list_active(self) -> list[RolloutRecord]:
        result = await self._session.execute(
            select(models.Rollout).where(
                models.Rollout.state.in_(
                    (
                        "running",
                        "advancing",
                        "approved",
                        "waiting_approval",
                        "paused",
                        "batch_running",
                        "batch_observing",
                        "final_observing",
                        "awaiting_signoff",
                    )
                )
            )
        )
        return [_rollout(r) for r in result.scalars().all()]


class SqlAlchemyAuditRepository(AuditRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(self, record: AuditEventRecord) -> AuditEventRecord:
        row = models.AuditEvent(
            id=record.id,
            actor_type=record.actor_type,
            actor_id=record.actor_id,
            action=record.action,
            target_type=record.target_type,
            target_id=record.target_id,
            request_id=record.request_id,
            metadata_redacted=record.metadata_redacted,
            occurred_at=record.occurred_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record

    async def list_for_target(self, target_type: str, target_id: str) -> list[AuditEventRecord]:
        result = await self._session.execute(
            select(models.AuditEvent).where(
                models.AuditEvent.target_type == target_type,
                models.AuditEvent.target_id == target_id,
            )
        )
        return [
            AuditEventRecord(
                id=r.id,
                actor_type=r.actor_type,
                actor_id=r.actor_id,
                action=r.action,
                target_type=r.target_type,
                target_id=r.target_id,
                request_id=r.request_id,
                metadata_redacted=dict(r.metadata_redacted or {}),
                occurred_at=_dt(r.occurred_at) or datetime.now(UTC),
            )
            for r in result.scalars().all()
        ]


class SqlAlchemyIdempotencyRepository(IdempotencyRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, key: str) -> IdempotencyRecord | None:
        row = await self._session.get(models.IdempotencyKey, key)
        if row is None:
            return None
        return IdempotencyRecord(
            key=row.key,
            response_json=dict(row.response_json or {}),
            request_digest=row.request_digest,
            created_at=_dt(row.created_at),
            expires_at=_dt(row.expires_at),
        )

    async def put(self, record: IdempotencyRecord) -> IdempotencyRecord:
        row = await self._session.get(models.IdempotencyKey, record.key)
        if row is not None:
            return IdempotencyRecord(
                key=row.key,
                response_json=dict(row.response_json or {}),
                request_digest=row.request_digest,
                created_at=_dt(row.created_at),
                expires_at=_dt(row.expires_at),
            )
        row = models.IdempotencyKey(
            key=record.key,
            response_json=record.response_json,
            request_digest=record.request_digest,
            expires_at=record.expires_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record


class SqlAlchemyOperationRepository(OperationRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, record: EndpointOperationRecord) -> EndpointOperationRecord:
        now = datetime.now(UTC)
        if record.created_at is None:
            record.created_at = now
        if record.updated_at is None:
            record.updated_at = now
        row = models.EndpointOperation(
            id=record.id,
            endpoint_id=record.endpoint_id,
            enrollment_id=record.enrollment_id,
            kind=record.kind,
            state=record.state,
            request_id=record.request_id,
            error_code=record.error_code,
            created_at=record.created_at,
            updated_at=record.updated_at,
            completed_at=record.completed_at,
        )
        self._session.add(row)
        await self._session.flush()
        return record

    async def get(self, operation_id: str) -> EndpointOperationRecord | None:
        row = await self._session.get(models.EndpointOperation, operation_id)
        return _operation(row) if row else None

    async def get_by_request_id(self, request_id: str) -> EndpointOperationRecord | None:
        result = await self._session.execute(
            select(models.EndpointOperation).where(models.EndpointOperation.request_id == request_id)
        )
        row = result.scalar_one_or_none()
        return _operation(row) if row else None

    async def update(self, record: EndpointOperationRecord) -> EndpointOperationRecord:
        row = await self._session.get(models.EndpointOperation, record.id)
        if row is None:
            raise KeyError(record.id)
        row.state = record.state
        row.error_code = record.error_code
        row.completed_at = record.completed_at
        row.updated_at = datetime.now(UTC)
        record.updated_at = row.updated_at
        await self._session.flush()
        return record

    async def list_resumable(self, *, kinds: list[str] | None = None) -> list[EndpointOperationRecord]:
        stmt = select(models.EndpointOperation).where(
            models.EndpointOperation.state.in_(("pending", "running", "accepted", "synced"))
        )
        if kinds:
            stmt = stmt.where(models.EndpointOperation.kind.in_(kinds))
        result = await self._session.execute(stmt)
        return [_operation(r) for r in result.scalars().all()]

    async def upsert_step(self, step: OperationStepRecord) -> OperationStepRecord:
        existing = await self.get_step(step.operation_id, step.step_name)
        if existing is None:
            row = models.OperationStep(
                operation_id=step.operation_id,
                step_name=step.step_name,
                state=step.state,
                salt_jid=step.salt_jid,
                started_at=step.started_at,
                completed_at=step.completed_at,
                result_redacted=step.result_redacted,
                error_code=step.error_code,
            )
            self._session.add(row)
            await self._session.flush()
            step.id = row.id
            return step
        result = await self._session.execute(
            select(models.OperationStep).where(
                models.OperationStep.operation_id == step.operation_id,
                models.OperationStep.step_name == step.step_name,
            )
        )
        row = result.scalar_one()
        row.state = step.state
        row.salt_jid = step.salt_jid
        row.started_at = step.started_at
        row.completed_at = step.completed_at
        row.result_redacted = step.result_redacted
        row.error_code = step.error_code
        await self._session.flush()
        step.id = row.id
        return step

    async def list_steps(self, operation_id: str) -> list[OperationStepRecord]:
        result = await self._session.execute(
            select(models.OperationStep).where(models.OperationStep.operation_id == operation_id)
        )
        return [_step(r) for r in result.scalars().all()]

    async def get_step(self, operation_id: str, step_name: str) -> OperationStepRecord | None:
        result = await self._session.execute(
            select(models.OperationStep).where(
                models.OperationStep.operation_id == operation_id,
                models.OperationStep.step_name == step_name,
            )
        )
        row = result.scalar_one_or_none()
        return _step(row) if row else None


def build_sqlalchemy_repos(session: AsyncSession) -> RepositoryBundle:
    return RepositoryBundle(
        endpoints=SqlAlchemyEndpointRepository(session),
        bindings=SqlAlchemyBindingRepository(session),
        enrollments=SqlAlchemyEnrollmentRepository(session),
        pending_tokens=SqlAlchemyPendingTokenRepository(session),
        desired_states=SqlAlchemyDesiredStateRepository(session),
        job_returns=SqlAlchemyJobReturnRepository(session),
        artifacts=SqlAlchemyArtifactRepository(session),
        rollouts=SqlAlchemyRolloutRepository(session),
        audits=SqlAlchemyAuditRepository(session),
        idempotency=SqlAlchemyIdempotencyRepository(session),
        operations=SqlAlchemyOperationRepository(session),
        control_jobs=SqlAlchemyControlJobRepository(session),
        secret_scopes=SqlAlchemySecretScopeRepository(session),
        rollout_approvals=SqlAlchemyRolloutApprovalRepository(session),
        rollout_observations=SqlAlchemyRolloutObservationRepository(session),
        endpoint_observations=SqlAlchemyEndpointObservationRepository(session),
        control_plane_incidents=SqlAlchemyControlPlaneIncidentRepository(session),
        rollout_target_jobs=SqlAlchemyRolloutTargetJobRepository(session),
        endpoint_fact_samples=SqlAlchemyEndpointFactSampleRepository(session),
        extras={},
    )


def _endpoint(row: models.Endpoint) -> EndpointRecord:
    return EndpointRecord(
        id=row.id,
        tenant_id=row.tenant_id,
        machine_guid_hash=row.machine_guid_hash,
        hostname=row.hostname,
        platform=row.platform,
        arch=row.arch,
        status=row.status,
        device_credential_hash=row.device_credential_hash,
        created_at=_dt(row.created_at) or datetime.now(UTC),
        last_seen_at=_dt(row.last_seen_at),
    )


def _enrollment(row: models.Enrollment) -> EnrollmentRecord:
    return EnrollmentRecord(
        id=row.id,
        endpoint_id=row.endpoint_id,
        token_hash=row.token_hash,
        state=row.state,
        master_fingerprints=list(row.master_fingerprints or []),
        expires_at=_dt(row.expires_at) or datetime.now(UTC),
        local_fingerprint=row.local_fingerprint,
        completed_at=_dt(row.completed_at),
        error_code=row.error_code,
        request_id=row.request_id,
        created_at=_dt(row.created_at),
    )


def _rollout(row: models.Rollout) -> RolloutRecord:
    return RolloutRecord(
        id=row.id,
        component=row.component,
        version=row.version,
        ring=row.ring,
        state=row.state,
        thresholds_json=dict(row.thresholds_json or {}),
        created_by=row.created_by,
        target_count=row.target_count,
        completed_count=row.completed_count,
        success_rate=row.success_rate,
        failure_rate=row.failure_rate,
        rollback_rate=row.rollback_rate,
        p0_count=row.p0_count,
        p1_count=row.p1_count,
        observation_started_at=_dt(row.observation_started_at),
        snapshot_digest=row.snapshot_digest,
        snapshot_json=list(row.snapshot_json or []) if row.snapshot_json else None,
        batch_index=row.batch_index,
        state_version=int(getattr(row, "state_version", 0) or 0),
        batch_started_at=_dt(getattr(row, "batch_started_at", None)),
        batch_observation_due_at=_dt(getattr(row, "batch_observation_due_at", None)),
        final_observation_started_at=_dt(getattr(row, "final_observation_started_at", None)),
        final_observation_due_at=_dt(getattr(row, "final_observation_due_at", None)),
        completed_at=_dt(getattr(row, "completed_at", None)),
        created_at=_dt(row.created_at),
    )


def _operation(row: models.EndpointOperation) -> EndpointOperationRecord:
    return EndpointOperationRecord(
        id=row.id,
        endpoint_id=row.endpoint_id,
        kind=row.kind,
        state=row.state,
        enrollment_id=row.enrollment_id,
        request_id=row.request_id,
        error_code=row.error_code,
        created_at=_dt(row.created_at),
        updated_at=_dt(row.updated_at),
        completed_at=_dt(row.completed_at),
    )


def _step(row: models.OperationStep) -> OperationStepRecord:
    return OperationStepRecord(
        id=row.id,
        operation_id=row.operation_id,
        step_name=row.step_name,
        state=row.state,
        salt_jid=row.salt_jid,
        started_at=_dt(row.started_at),
        completed_at=_dt(row.completed_at),
        result_redacted=dict(row.result_redacted or {}),
        error_code=row.error_code,
    )


__all__ = ["build_sqlalchemy_repos"]
