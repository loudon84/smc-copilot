from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.models import (
    ActionRequestRow,
    ActionResultRow,
    ActionTargetRow,
    AuditRow,
    DiagnosticRow,
    ManagedPolicyRow,
    WorkerHeartbeatRow,
)
from db.repositories.interfaces import (
    ActionRecord,
    DiagnosticRecord,
    HeartbeatRecord,
    PolicyRecord,
    RepositoryBundle,
    ResultRecord,
    TargetRecord,
)
from schemas.models import ActionStatus, Operation


class SqlActionRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def get(self, request_id: str) -> ActionRecord | None:
        async with self.factory() as session:
            row = await session.get(ActionRequestRow, request_id)
            return _action_from_row(row) if row else None

    async def put(self, record: ActionRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(ActionRequestRow, record.request_id)
                if row is None:
                    session.add(
                        ActionRequestRow(
                            request_id=record.request_id,
                            operation=record.operation.value,
                            payload_digest=record.payload_digest,
                            status=record.status.value,
                            actor_id=record.actor_id,
                            created_at=record.created_at,
                            updated_at=record.updated_at,
                            deadline=record.deadline,
                            aggregate_version=record.aggregate_version,
                            payload_json=record.payload_json,
                            hermes_version=record.hermes_version or "",
                            config_revision=record.config_revision,
                            auto_repair_level=record.auto_repair_level,
                        )
                    )
                else:
                    row.status = record.status.value
                    row.payload_digest = record.payload_digest
                    row.updated_at = datetime.now(UTC)
                    row.deadline = record.deadline
                    row.aggregate_version = record.aggregate_version
                    row.payload_json = record.payload_json
                    row.hermes_version = record.hermes_version or ""
                    row.config_revision = record.config_revision
                    row.auto_repair_level = record.auto_repair_level

    async def list_open(self) -> list[ActionRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(
                    select(ActionRequestRow).where(
                        ActionRequestRow.status.notin_(["SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"])
                    )
                )
            ).scalars()
            return [_action_from_row(row) for row in rows]


class SqlTargetRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def list_for_request(self, request_id: str) -> list[TargetRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(ActionTargetRow).where(ActionTargetRow.request_id == request_id))
            ).scalars()
            return [_target_from_row(row) for row in rows]

    async def put(self, record: TargetRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                existing = (
                    await session.execute(
                        select(ActionTargetRow).where(
                            ActionTargetRow.request_id == record.request_id,
                            ActionTargetRow.client_id == record.client_id,
                        )
                    )
                ).scalar_one_or_none()
                if existing is None:
                    session.add(_target_to_row(record))
                else:
                    _apply_target(existing, record)

    async def list_undispatched(self, request_id: str) -> list[TargetRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(
                    select(ActionTargetRow).where(
                        ActionTargetRow.request_id == request_id,
                        ActionTargetRow.dispatched.is_(False),
                    )
                )
            ).scalars()
            return [_target_from_row(row) for row in rows]

    async def claim_queued(self, worker_id: str, limit: int = 32) -> list[TargetRecord]:
        now = datetime.now(UTC)
        async with self.factory() as session:
            async with session.begin():
                stmt = (
                    select(ActionTargetRow)
                    .where(ActionTargetRow.status.in_(("QUEUED", "WAITING_CLIENT")))
                    .where(or_(ActionTargetRow.lease_until.is_(None), ActionTargetRow.lease_until < now))
                    .order_by(ActionTargetRow.id)
                    .limit(limit)
                    .with_for_update(skip_locked=True)
                )
                rows = list((await session.execute(stmt)).scalars())
                claimed: list[TargetRecord] = []
                for row in rows:
                    row.lease_owner = worker_id
                    row.lease_until = now + timedelta(seconds=30)
                    row.attempt = (row.attempt or 0) + 1
                    claimed.append(_target_from_row(row))
                return claimed


class SqlResultRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def list_for_request(self, request_id: str) -> list[ResultRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(ActionResultRow).where(ActionResultRow.request_id == request_id))
            ).scalars()
            return [_result_from_row(row) for row in rows]

    async def get(self, request_id: str, client_id: str) -> ResultRecord | None:
        async with self.factory() as session:
            row = (
                await session.execute(
                    select(ActionResultRow).where(
                        ActionResultRow.request_id == request_id,
                        ActionResultRow.client_id == client_id,
                    )
                )
            ).scalar_one_or_none()
            return _result_from_row(row) if row else None

    async def put(self, record: ResultRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                existing = (
                    await session.execute(
                        select(ActionResultRow).where(
                            ActionResultRow.request_id == record.request_id,
                            ActionResultRow.client_id == record.client_id,
                        )
                    )
                ).scalar_one_or_none()
                if existing is None:
                    session.add(
                        ActionResultRow(
                            request_id=record.request_id,
                            client_id=record.client_id,
                            status=record.status.value,
                            sha256=record.sha256,
                            body=record.body,
                            redacted=record.redacted,
                            bytes=record.bytes,
                            error_code=record.error_code,
                            body_digest=record.body_digest,
                            updated_at=record.updated_at,
                        )
                    )
                else:
                    existing.status = record.status.value
                    existing.sha256 = record.sha256
                    existing.body = record.body
                    existing.bytes = record.bytes
                    existing.error_code = record.error_code
                    existing.body_digest = record.body_digest
                    existing.updated_at = datetime.now(UTC)


class SqlDiagnosticRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def get(self, request_id: str, client_id: str | None = None) -> DiagnosticRecord | None:
        async with self.factory() as session:
            stmt = select(DiagnosticRow).where(DiagnosticRow.request_id == request_id)
            if client_id is not None:
                stmt = stmt.where(DiagnosticRow.client_id == client_id)
            row = (await session.execute(stmt.limit(1))).scalar_one_or_none()
            if row is None:
                return None
            return DiagnosticRecord(
                request_id=row.request_id,
                client_id=row.client_id,
                issue_code=row.issue_code,
                severity=row.severity,
                recommended_action=row.recommended_action,
                files_json=row.files_json,
                manifest_digest=row.manifest_digest,
            )

    async def put(self, record: DiagnosticRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                existing = (
                    await session.execute(
                        select(DiagnosticRow).where(
                            DiagnosticRow.request_id == record.request_id,
                            DiagnosticRow.client_id == record.client_id,
                        )
                    )
                ).scalar_one_or_none()
                if existing is None:
                    session.add(
                        DiagnosticRow(
                            request_id=record.request_id,
                            client_id=record.client_id,
                            issue_code=record.issue_code,
                            severity=record.severity,
                            recommended_action=record.recommended_action,
                            files_json=record.files_json,
                            manifest_digest=record.manifest_digest,
                        )
                    )
                else:
                    existing.issue_code = record.issue_code
                    existing.severity = record.severity
                    existing.recommended_action = record.recommended_action
                    existing.files_json = record.files_json
                    existing.manifest_digest = record.manifest_digest


class SqlAuditRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def add(self, request_id: str, actor_id: str, event: str, detail: str = "") -> None:
        async with self.factory() as session:
            async with session.begin():
                session.add(AuditRow(request_id=request_id, actor_id=actor_id, event=event, detail=detail[:512]))


class SqlPolicyRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def put(self, record: PolicyRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(ManagedPolicyRow, record.revision)
                if row is None:
                    session.add(
                        ManagedPolicyRow(
                            revision=record.revision,
                            payload_digest=record.payload_digest,
                            payload_json=record.payload_json,
                            request_id=record.request_id,
                        )
                    )
                else:
                    row.payload_digest = record.payload_digest
                    row.payload_json = record.payload_json
                    row.request_id = record.request_id

    async def get(self, revision: int) -> PolicyRecord | None:
        async with self.factory() as session:
            row = await session.get(ManagedPolicyRow, revision)
            if row is None:
                return None
            return PolicyRecord(
                revision=row.revision,
                payload_digest=row.payload_digest,
                payload_json=row.payload_json,
                request_id=row.request_id,
            )


class SqlHeartbeatRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def touch(self, worker_id: str, role: str) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(WorkerHeartbeatRow, worker_id)
                if row is None:
                    session.add(WorkerHeartbeatRow(worker_id=worker_id, role=role, last_seen=datetime.now(UTC)))
                else:
                    row.role = role
                    row.last_seen = datetime.now(UTC)

    async def list_fresh(self, max_age_seconds: int = 60) -> list[HeartbeatRecord]:
        cutoff = datetime.now(UTC) - timedelta(seconds=max_age_seconds)
        async with self.factory() as session:
            rows = (
                await session.execute(select(WorkerHeartbeatRow).where(WorkerHeartbeatRow.last_seen >= cutoff))
            ).scalars()
            return [HeartbeatRecord(worker_id=row.worker_id, role=row.role, last_seen=row.last_seen) for row in rows]


def build_sqlalchemy_repos(factory: async_sessionmaker[AsyncSession]) -> RepositoryBundle:
    return RepositoryBundle(
        actions=SqlActionRepository(factory),
        targets=SqlTargetRepository(factory),
        results=SqlResultRepository(factory),
        diagnostics=SqlDiagnosticRepository(factory),
        audit=SqlAuditRepository(factory),
        policies=SqlPolicyRepository(factory),
        heartbeats=SqlHeartbeatRepository(factory),
    )


def _action_from_row(row: ActionRequestRow) -> ActionRecord:
    return ActionRecord(
        request_id=row.request_id,
        operation=Operation(row.operation),
        payload_digest=row.payload_digest,
        status=ActionStatus(row.status),
        actor_id=row.actor_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        deadline=row.deadline,
        aggregate_version=row.aggregate_version,
        payload_json=row.payload_json,
        hermes_version=row.hermes_version or None,
        config_revision=row.config_revision,
        auto_repair_level=row.auto_repair_level,
    )


def _target_from_row(row: ActionTargetRow) -> TargetRecord:
    return TargetRecord(
        request_id=row.request_id,
        client_id=row.client_id,
        status=ActionStatus(row.status),
        error_code=row.error_code,
        message=row.message,
        dispatched=row.dispatched,
        attempt=row.attempt,
        lease_owner=row.lease_owner,
        lease_until=row.lease_until,
        property_digest=row.property_digest,
        opsi_action=row.opsi_action,
        opsi_modification_time=row.opsi_modification_time,
        last_observed_at=row.last_observed_at,
        user_sid=row.user_sid,
        user_account=row.user_account,
    )


def _apply_target(row: ActionTargetRow, record: TargetRecord) -> None:
    row.status = record.status.value
    row.error_code = record.error_code
    row.message = record.message
    row.dispatched = record.dispatched
    row.attempt = record.attempt
    row.lease_owner = record.lease_owner
    row.lease_until = record.lease_until
    row.property_digest = record.property_digest
    row.opsi_action = record.opsi_action
    row.opsi_modification_time = record.opsi_modification_time
    row.last_observed_at = record.last_observed_at
    row.user_sid = record.user_sid
    row.user_account = record.user_account


def _target_to_row(record: TargetRecord) -> ActionTargetRow:
    return ActionTargetRow(
        request_id=record.request_id,
        client_id=record.client_id,
        status=record.status.value,
        error_code=record.error_code,
        message=record.message,
        dispatched=record.dispatched,
        attempt=record.attempt,
        lease_owner=record.lease_owner,
        lease_until=record.lease_until,
        property_digest=record.property_digest,
        opsi_action=record.opsi_action,
        opsi_modification_time=record.opsi_modification_time,
        last_observed_at=record.last_observed_at,
        user_sid=record.user_sid,
        user_account=record.user_account,
    )


def _result_from_row(row: ActionResultRow) -> ResultRecord:
    return ResultRecord(
        request_id=row.request_id,
        client_id=row.client_id,
        status=ActionStatus(row.status),
        sha256=row.sha256,
        body=row.body,
        redacted=row.redacted,
        bytes=row.bytes,
        error_code=row.error_code,
        body_digest=row.body_digest,
        updated_at=row.updated_at,
    )
