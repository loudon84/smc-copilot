from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.models import ActionRequestRow, ActionResultRow, ActionTargetRow, AuditRow, DiagnosticRow
from db.repositories.interfaces import (
    ActionRecord,
    DiagnosticRecord,
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
                    )
                )
            else:
                row.status = record.status.value
                row.payload_digest = record.payload_digest
            await session.commit()

    async def list_open(self) -> list[ActionRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(
                    select(ActionRequestRow).where(ActionRequestRow.status.notin_(["SUCCEEDED", "FAILED", "CANCELLED"]))
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
            existing = (
                await session.execute(
                    select(ActionTargetRow).where(
                        ActionTargetRow.request_id == record.request_id,
                        ActionTargetRow.client_id == record.client_id,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                session.add(
                    ActionTargetRow(
                        request_id=record.request_id,
                        client_id=record.client_id,
                        status=record.status.value,
                        error_code=record.error_code,
                        message=record.message,
                        dispatched=record.dispatched,
                    )
                )
            else:
                existing.status = record.status.value
                existing.error_code = record.error_code
                existing.message = record.message
                existing.dispatched = record.dispatched
            await session.commit()

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


class SqlResultRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def list_for_request(self, request_id: str) -> list[ResultRecord]:
        async with self.factory() as session:
            rows = (
                await session.execute(select(ActionResultRow).where(ActionResultRow.request_id == request_id))
            ).scalars()
            return [_result_from_row(row) for row in rows]

    async def put(self, record: ResultRecord) -> None:
        async with self.factory() as session:
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
                        updated_at=record.updated_at,
                    )
                )
            else:
                existing.status = record.status.value
                existing.sha256 = record.sha256
                existing.body = record.body
                existing.updated_at = datetime.now(UTC)
            await session.commit()


class SqlDiagnosticRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def get(self, request_id: str) -> DiagnosticRecord | None:
        async with self.factory() as session:
            row = await session.get(DiagnosticRow, request_id)
            if row is None:
                return None
            return DiagnosticRecord(
                request_id=row.request_id,
                client_id=row.client_id,
                issue_code=row.issue_code,
                severity=row.severity,
                recommended_action=row.recommended_action,
                files_json=row.files_json,
            )

    async def put(self, record: DiagnosticRecord) -> None:
        async with self.factory() as session:
            row = await session.get(DiagnosticRow, record.request_id)
            if row is None:
                session.add(
                    DiagnosticRow(
                        request_id=record.request_id,
                        client_id=record.client_id,
                        issue_code=record.issue_code,
                        severity=record.severity,
                        recommended_action=record.recommended_action,
                        files_json=record.files_json,
                    )
                )
            else:
                row.issue_code = record.issue_code
                row.severity = record.severity
                row.recommended_action = record.recommended_action
                row.files_json = record.files_json
            await session.commit()


class SqlAuditRepository:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def add(self, request_id: str, actor_id: str, event: str, detail: str = "") -> None:
        async with self.factory() as session:
            session.add(AuditRow(request_id=request_id, actor_id=actor_id, event=event, detail=detail[:512]))
            await session.commit()


def build_sqlalchemy_repos(factory: async_sessionmaker[AsyncSession]) -> RepositoryBundle:
    return RepositoryBundle(
        actions=SqlActionRepository(factory),
        targets=SqlTargetRepository(factory),
        results=SqlResultRepository(factory),
        diagnostics=SqlDiagnosticRepository(factory),
        audit=SqlAuditRepository(factory),
    )


def _action_from_row(row: ActionRequestRow) -> ActionRecord:
    return ActionRecord(
        request_id=row.request_id,
        operation=Operation(row.operation),
        payload_digest=row.payload_digest,
        status=ActionStatus(row.status),
        actor_id=row.actor_id,
        created_at=row.created_at,
    )


def _target_from_row(row: ActionTargetRow) -> TargetRecord:
    return TargetRecord(
        request_id=row.request_id,
        client_id=row.client_id,
        status=ActionStatus(row.status),
        error_code=row.error_code,
        message=row.message,
        dispatched=row.dispatched,
    )


def _result_from_row(row: ActionResultRow) -> ResultRecord:
    return ResultRecord(
        request_id=row.request_id,
        client_id=row.client_id,
        status=ActionStatus(row.status),
        sha256=row.sha256,
        body=row.body,
        redacted=row.redacted,
        updated_at=row.updated_at,
    )
