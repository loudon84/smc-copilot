from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import models
from db.repositories.interfaces import (
    ControlPlaneIncidentRecord,
    ControlPlaneIncidentRepository,
    EndpointFactSampleRecord,
    EndpointFactSampleRepository,
    EndpointObservationRecord,
    EndpointObservationRepository,
    RolloutApprovalRecord,
    RolloutApprovalRepository,
    RolloutObservationRecord,
    RolloutObservationRepository,
    RolloutTargetJobRecord,
    RolloutTargetJobRepository,
)


def _dt(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


class InMemoryRolloutApprovalRepository(RolloutApprovalRepository):
    def __init__(self) -> None:
        self._items: list[RolloutApprovalRecord] = []
        self._seq = 0

    async def add(self, record: RolloutApprovalRecord) -> RolloutApprovalRecord:
        for item in self._items:
            if (
                item.rollout_id == record.rollout_id
                and item.stage == record.stage
                and item.role == record.role
                and item.revoked_at is None
            ):
                return item
        self._seq += 1
        record.id = self._seq
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        self._items.append(record)
        return record

    async def list_for_rollout(self, rollout_id: str) -> list[RolloutApprovalRecord]:
        return [i for i in self._items if i.rollout_id == rollout_id]


class InMemoryRolloutObservationRepository(RolloutObservationRepository):
    def __init__(self) -> None:
        self._items: list[RolloutObservationRecord] = []
        self._seq = 0

    async def append(self, record: RolloutObservationRecord) -> RolloutObservationRecord:
        self._seq += 1
        record.id = self._seq
        if record.captured_at is None:
            record.captured_at = datetime.now(UTC)
        self._items.append(record)
        return record

    async def list_for_rollout(self, rollout_id: str, *, window: str | None = None) -> list[RolloutObservationRecord]:
        out = [i for i in self._items if i.rollout_id == rollout_id]
        if window is not None:
            out = [i for i in out if i.window == window]
        return out


class InMemoryEndpointObservationRepository(EndpointObservationRepository):
    def __init__(self) -> None:
        self._items: list[EndpointObservationRecord] = []
        self._seq = 0

    async def append(self, record: EndpointObservationRecord) -> EndpointObservationRecord:
        self._seq += 1
        record.id = self._seq
        if record.captured_at is None:
            record.captured_at = datetime.now(UTC)
        self._items.append(record)
        return record

    async def latest(self, endpoint_id: str, *, window: str | None = None) -> EndpointObservationRecord | None:
        items = [i for i in self._items if i.endpoint_id == endpoint_id]
        if window is not None:
            items = [i for i in items if i.window == window]
        if not items:
            return None
        return max(items, key=lambda i: i.captured_at or datetime.min.replace(tzinfo=UTC))


class InMemoryControlPlaneIncidentRepository(ControlPlaneIncidentRepository):
    def __init__(self) -> None:
        self._by_id: dict[str, ControlPlaneIncidentRecord] = {}

    async def create(self, record: ControlPlaneIncidentRecord) -> ControlPlaneIncidentRecord:
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        self._by_id[record.id] = record
        return record

    async def list_open(self, *, rollout_id: str | None = None) -> list[ControlPlaneIncidentRecord]:
        out = [i for i in self._by_id.values() if i.resolved_at is None]
        if rollout_id is not None:
            out = [i for i in out if i.rollout_id == rollout_id]
        return out


class InMemoryRolloutTargetJobRepository(RolloutTargetJobRepository):
    def __init__(self) -> None:
        self._items: list[RolloutTargetJobRecord] = []
        self._seq = 0

    async def upsert(self, record: RolloutTargetJobRecord) -> RolloutTargetJobRecord:
        for item in self._items:
            if (
                item.rollout_id == record.rollout_id
                and item.endpoint_id == record.endpoint_id
                and item.batch_index == record.batch_index
                and (item.operation or "handover") == (record.operation or "handover")
                and int(item.attempt or 1) == int(record.attempt or 1)
            ):
                item.job_id = record.job_id or item.job_id
                item.state = record.state
                item.idempotency_key = record.idempotency_key or item.idempotency_key
                item.expected_function = record.expected_function or item.expected_function
                item.result_source = record.result_source or item.result_source
                return item
        self._seq += 1
        record.id = self._seq
        if record.created_at is None:
            record.created_at = datetime.now(UTC)
        self._items.append(record)
        return record

    async def list_for_rollout(
        self, rollout_id: str, *, batch_index: int | None = None
    ) -> list[RolloutTargetJobRecord]:
        out = [i for i in self._items if i.rollout_id == rollout_id]
        if batch_index is not None:
            out = [i for i in out if i.batch_index == batch_index]
        return out


class InMemoryEndpointFactSampleRepository(EndpointFactSampleRepository):
    def __init__(self) -> None:
        self._items: list[EndpointFactSampleRecord] = []
        self._seq = 0

    async def append(self, record: EndpointFactSampleRecord) -> EndpointFactSampleRecord:
        self._seq += 1
        record.id = self._seq
        if record.captured_at is None:
            record.captured_at = datetime.now(UTC)
        self._items.append(record)
        return record

    async def list_since(self, endpoint_id: str, *, since: datetime) -> list[EndpointFactSampleRecord]:
        return [
            i
            for i in self._items
            if i.endpoint_id == endpoint_id and (i.captured_at or datetime.min.replace(tzinfo=UTC)) >= since
        ]

    async def list_window(
        self, endpoint_id: str, *, since: datetime, until: datetime
    ) -> list[EndpointFactSampleRecord]:
        return [
            i
            for i in self._items
            if i.endpoint_id == endpoint_id and since <= (i.captured_at or datetime.min.replace(tzinfo=UTC)) <= until
        ]


class SqlAlchemyRolloutApprovalRepository(RolloutApprovalRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, record: RolloutApprovalRecord) -> RolloutApprovalRecord:
        existing = await self._session.execute(
            select(models.RolloutApproval).where(
                models.RolloutApproval.rollout_id == record.rollout_id,
                models.RolloutApproval.stage == (record.stage or "deploy"),
                models.RolloutApproval.role == record.role,
                models.RolloutApproval.revoked_at.is_(None),
            )
        )
        row = existing.scalar_one_or_none()
        if row is not None:
            return _approval(row)
        row = models.RolloutApproval(
            rollout_id=record.rollout_id,
            role=record.role,
            subject=record.subject,
            decision=record.decision,
            snapshot_digest=record.snapshot_digest,
            reason=record.reason,
            stage=record.stage or "deploy",
            role_source=record.role_source or "oidc",
            expires_at=record.expires_at,
            revoked_at=record.revoked_at,
        )
        self._session.add(row)
        await self._session.flush()
        return _approval(row)

    async def list_for_rollout(self, rollout_id: str) -> list[RolloutApprovalRecord]:
        result = await self._session.execute(
            select(models.RolloutApproval).where(models.RolloutApproval.rollout_id == rollout_id)
        )
        return [_approval(r) for r in result.scalars().all()]


class SqlAlchemyRolloutObservationRepository(RolloutObservationRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(self, record: RolloutObservationRecord) -> RolloutObservationRecord:
        row = models.RolloutObservation(
            rollout_id=record.rollout_id,
            window=record.window,
            payload_json=record.payload_json,
        )
        self._session.add(row)
        await self._session.flush()
        record.id = row.id
        record.captured_at = _dt(row.captured_at)
        return record

    async def list_for_rollout(self, rollout_id: str, *, window: str | None = None) -> list[RolloutObservationRecord]:
        stmt = select(models.RolloutObservation).where(models.RolloutObservation.rollout_id == rollout_id)
        if window is not None:
            stmt = stmt.where(models.RolloutObservation.window == window)
        result = await self._session.execute(stmt)
        return [_rollout_obs(r) for r in result.scalars().all()]


class SqlAlchemyEndpointObservationRepository(EndpointObservationRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(self, record: EndpointObservationRecord) -> EndpointObservationRecord:
        row = models.EndpointObservation(
            endpoint_id=record.endpoint_id,
            window=record.window,
            payload_json=record.payload_json,
        )
        self._session.add(row)
        await self._session.flush()
        record.id = row.id
        record.captured_at = _dt(row.captured_at)
        return record

    async def latest(self, endpoint_id: str, *, window: str | None = None) -> EndpointObservationRecord | None:
        stmt = select(models.EndpointObservation).where(models.EndpointObservation.endpoint_id == endpoint_id)
        if window is not None:
            stmt = stmt.where(models.EndpointObservation.window == window)
        stmt = stmt.order_by(models.EndpointObservation.captured_at.desc()).limit(1)
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        return _endpoint_obs(row) if row else None


class SqlAlchemyControlPlaneIncidentRepository(ControlPlaneIncidentRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, record: ControlPlaneIncidentRecord) -> ControlPlaneIncidentRecord:
        row = models.ControlPlaneIncident(
            id=record.id,
            severity=record.severity,
            code=record.code,
            message=record.message,
            rollout_id=record.rollout_id,
            endpoint_id=record.endpoint_id,
            metadata_redacted=record.metadata_redacted,
            resolved_at=record.resolved_at,
        )
        self._session.add(row)
        await self._session.flush()
        record.created_at = _dt(row.created_at)
        return record

    async def list_open(self, *, rollout_id: str | None = None) -> list[ControlPlaneIncidentRecord]:
        stmt = select(models.ControlPlaneIncident).where(models.ControlPlaneIncident.resolved_at.is_(None))
        if rollout_id is not None:
            stmt = stmt.where(models.ControlPlaneIncident.rollout_id == rollout_id)
        result = await self._session.execute(stmt)
        return [_incident(r) for r in result.scalars().all()]


class SqlAlchemyRolloutTargetJobRepository(RolloutTargetJobRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, record: RolloutTargetJobRecord) -> RolloutTargetJobRecord:
        result = await self._session.execute(
            select(models.RolloutTargetJob).where(
                models.RolloutTargetJob.rollout_id == record.rollout_id,
                models.RolloutTargetJob.endpoint_id == record.endpoint_id,
                models.RolloutTargetJob.batch_index == record.batch_index,
                models.RolloutTargetJob.operation == (record.operation or "handover"),
                models.RolloutTargetJob.attempt == int(record.attempt or 1),
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = models.RolloutTargetJob(
                rollout_id=record.rollout_id,
                endpoint_id=record.endpoint_id,
                batch_index=record.batch_index,
                job_id=record.job_id,
                state=record.state,
                operation=record.operation or "handover",
                attempt=int(record.attempt or 1),
                idempotency_key=record.idempotency_key,
                expected_function=record.expected_function,
                result_source=record.result_source,
            )
            self._session.add(row)
        else:
            if record.job_id:
                row.job_id = record.job_id
            row.state = record.state
            if record.idempotency_key:
                row.idempotency_key = record.idempotency_key
            if record.expected_function:
                row.expected_function = record.expected_function
            if record.result_source:
                row.result_source = record.result_source
        await self._session.flush()
        return _target_job(row)

    async def list_for_rollout(
        self, rollout_id: str, *, batch_index: int | None = None
    ) -> list[RolloutTargetJobRecord]:
        stmt = select(models.RolloutTargetJob).where(models.RolloutTargetJob.rollout_id == rollout_id)
        if batch_index is not None:
            stmt = stmt.where(models.RolloutTargetJob.batch_index == batch_index)
        result = await self._session.execute(stmt)
        return [_target_job(r) for r in result.scalars().all()]


def _approval(row: models.RolloutApproval) -> RolloutApprovalRecord:
    return RolloutApprovalRecord(
        id=row.id,
        rollout_id=row.rollout_id,
        role=row.role,
        subject=row.subject,
        decision=row.decision,
        snapshot_digest=row.snapshot_digest,
        reason=row.reason,
        created_at=_dt(row.created_at),
        stage=getattr(row, "stage", "deploy") or "deploy",
        role_source=getattr(row, "role_source", "oidc") or "oidc",
        expires_at=_dt(getattr(row, "expires_at", None)),
        revoked_at=_dt(getattr(row, "revoked_at", None)),
    )


def _rollout_obs(row: models.RolloutObservation) -> RolloutObservationRecord:
    return RolloutObservationRecord(
        id=row.id,
        rollout_id=row.rollout_id,
        window=row.window,
        payload_json=dict(row.payload_json or {}),
        captured_at=_dt(row.captured_at),
    )


def _endpoint_obs(row: models.EndpointObservation) -> EndpointObservationRecord:
    return EndpointObservationRecord(
        id=row.id,
        endpoint_id=row.endpoint_id,
        window=row.window,
        payload_json=dict(row.payload_json or {}),
        captured_at=_dt(row.captured_at),
    )


def _incident(row: models.ControlPlaneIncident) -> ControlPlaneIncidentRecord:
    return ControlPlaneIncidentRecord(
        id=row.id,
        severity=row.severity,
        code=row.code,
        message=row.message,
        rollout_id=row.rollout_id,
        endpoint_id=row.endpoint_id,
        metadata_redacted=dict(row.metadata_redacted or {}),
        created_at=_dt(row.created_at),
        resolved_at=_dt(row.resolved_at),
    )


def _target_job(row: models.RolloutTargetJob) -> RolloutTargetJobRecord:
    return RolloutTargetJobRecord(
        id=row.id,
        rollout_id=row.rollout_id,
        endpoint_id=row.endpoint_id,
        batch_index=row.batch_index,
        job_id=row.job_id,
        state=row.state,
        created_at=_dt(row.created_at),
        operation=getattr(row, "operation", "handover") or "handover",
        attempt=int(getattr(row, "attempt", 1) or 1),
        idempotency_key=getattr(row, "idempotency_key", None),
        expected_function=getattr(row, "expected_function", None),
        result_source=getattr(row, "result_source", None),
    )


class SqlAlchemyEndpointFactSampleRepository(EndpointFactSampleRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(self, record: EndpointFactSampleRecord) -> EndpointFactSampleRecord:
        row = models.EndpointFactSample(
            endpoint_id=record.endpoint_id,
            payload_json=record.payload_json,
            source=record.source,
            captured_at=record.captured_at or datetime.now(UTC),
        )
        self._session.add(row)
        await self._session.flush()
        record.id = row.id
        record.captured_at = _dt(row.captured_at)
        return record

    async def list_since(self, endpoint_id: str, *, since: datetime) -> list[EndpointFactSampleRecord]:
        result = await self._session.execute(
            select(models.EndpointFactSample).where(
                models.EndpointFactSample.endpoint_id == endpoint_id,
                models.EndpointFactSample.captured_at >= since,
            )
        )
        return [_fact(r) for r in result.scalars().all()]

    async def list_window(
        self, endpoint_id: str, *, since: datetime, until: datetime
    ) -> list[EndpointFactSampleRecord]:
        result = await self._session.execute(
            select(models.EndpointFactSample).where(
                models.EndpointFactSample.endpoint_id == endpoint_id,
                models.EndpointFactSample.captured_at >= since,
                models.EndpointFactSample.captured_at <= until,
            )
        )
        return [_fact(r) for r in result.scalars().all()]


def _fact(row: models.EndpointFactSample) -> EndpointFactSampleRecord:
    return EndpointFactSampleRecord(
        id=row.id,
        endpoint_id=row.endpoint_id,
        payload_json=dict(row.payload_json or {}),
        source=row.source,
        captured_at=_dt(row.captured_at),
    )
