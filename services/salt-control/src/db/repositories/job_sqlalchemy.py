from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db import models
from db.repositories.interfaces import (
    TERMINAL_JOB_STATUSES,
    ControlJobRecord,
    ControlJobRepository,
    SecretScopeRecord,
    SecretScopeRepository,
)


def _dt(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _job(row: models.ControlJob) -> ControlJobRecord:
    return ControlJobRecord(
        id=row.id,
        endpoint_id=row.endpoint_id,
        minion_id=row.minion_id,
        operation=row.operation,
        status=row.status,
        idempotency_key=row.idempotency_key,
        requested_by=row.requested_by,
        config_revision=row.config_revision,
        release_id=row.release_id,
        correlation_id=row.correlation_id,
        claim_token=row.claim_token,
        lease_owner=row.lease_owner,
        lease_expires_at=_dt(row.lease_expires_at),
        heartbeat_at=_dt(row.heartbeat_at),
        attempt=row.attempt,
        salt_jid=row.salt_jid,
        result_digest=row.result_digest,
        error_code=row.error_code,
        accepted_at=_dt(row.accepted_at),
        updated_at=_dt(row.updated_at),
        completed_at=_dt(row.completed_at),
    )


class SqlAlchemyControlJobRepository(ControlJobRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, record: ControlJobRecord) -> ControlJobRecord:
        existing = await self.get_by_idempotency_key(record.idempotency_key)
        if existing is not None:
            return existing
        now = datetime.now(UTC)
        row = models.ControlJob(
            id=record.id,
            endpoint_id=record.endpoint_id,
            minion_id=record.minion_id,
            operation=record.operation,
            status=record.status,
            idempotency_key=record.idempotency_key,
            config_revision=record.config_revision,
            release_id=record.release_id,
            requested_by=record.requested_by,
            correlation_id=record.correlation_id,
            accepted_at=record.accepted_at or now,
            updated_at=record.updated_at or now,
        )
        self._session.add(row)
        await self._session.flush()
        return _job(row)

    async def get(self, job_id: str) -> ControlJobRecord | None:
        row = await self._session.get(models.ControlJob, job_id)
        return _job(row) if row else None

    async def get_by_idempotency_key(self, key: str) -> ControlJobRecord | None:
        result = await self._session.execute(
            select(models.ControlJob).where(models.ControlJob.idempotency_key == key)
        )
        row = result.scalar_one_or_none()
        return _job(row) if row else None

    async def get_by_salt_jid(self, salt_jid: str) -> ControlJobRecord | None:
        result = await self._session.execute(
            select(models.ControlJob).where(models.ControlJob.salt_jid == salt_jid)
        )
        row = result.scalar_one_or_none()
        return _job(row) if row else None

    async def update(self, record: ControlJobRecord) -> ControlJobRecord:
        row = await self._session.get(models.ControlJob, record.id)
        if row is None:
            raise KeyError(record.id)
        row.status = record.status
        row.claim_token = record.claim_token
        row.lease_owner = record.lease_owner
        row.lease_expires_at = record.lease_expires_at
        row.heartbeat_at = record.heartbeat_at
        row.attempt = record.attempt
        row.salt_jid = record.salt_jid
        row.result_digest = record.result_digest
        row.error_code = record.error_code
        row.updated_at = datetime.now(UTC)
        row.completed_at = record.completed_at
        await self._session.flush()
        return _job(row)

    async def claim_next(
        self,
        *,
        worker_id: str,
        lease_seconds: int,
        now: datetime,
    ) -> ControlJobRecord | None:
        result = await self._session.execute(
            select(models.ControlJob)
            .where(
                models.ControlJob.status == "queued",
                or_(
                    models.ControlJob.lease_expires_at.is_(None),
                    models.ControlJob.lease_expires_at < now,
                ),
            )
            .order_by(models.ControlJob.accepted_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        row.status = "dispatching"
        row.claim_token = secrets.token_urlsafe(16)
        row.lease_owner = worker_id
        row.lease_expires_at = now + timedelta(seconds=lease_seconds)
        row.heartbeat_at = now
        row.attempt += 1
        row.updated_at = now
        await self._session.flush()
        return _job(row)

    async def reclaim_expired(
        self,
        *,
        worker_id: str,
        lease_seconds: int,
        now: datetime,
    ) -> ControlJobRecord | None:
        result = await self._session.execute(
            select(models.ControlJob)
            .where(
                models.ControlJob.status.in_(("dispatching", "running")),
                models.ControlJob.lease_expires_at.is_not(None),
                models.ControlJob.lease_expires_at < now,
            )
            .order_by(models.ControlJob.lease_expires_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        row.claim_token = secrets.token_urlsafe(16)
        row.lease_owner = worker_id
        row.lease_expires_at = now + timedelta(seconds=lease_seconds)
        row.heartbeat_at = now
        row.attempt += 1
        row.updated_at = now
        await self._session.flush()
        return _job(row)

    async def heartbeat(self, job_id: str, *, claim_token: str, lease_seconds: int, now: datetime) -> bool:
        result = await self._session.execute(
            update(models.ControlJob)
            .where(
                models.ControlJob.id == job_id,
                models.ControlJob.claim_token == claim_token,
            )
            .values(
                heartbeat_at=now,
                lease_expires_at=now + timedelta(seconds=lease_seconds),
                updated_at=now,
            )
        )
        return result.rowcount > 0  # type: ignore[attr-defined]

    async def set_salt_jid(
        self,
        job_id: str,
        *,
        claim_token: str,
        salt_jid: str,
        now: datetime,
    ) -> tuple[ControlJobRecord, bool]:
        conflict = await self.get_by_salt_jid(salt_jid)
        if conflict is not None and conflict.id != job_id:
            return conflict, False
        row = await self._session.get(models.ControlJob, job_id)
        if row is None or row.claim_token != claim_token:
            return _job(row) if row else conflict or ControlJobRecord(
                id=job_id,
                endpoint_id="",
                minion_id="",
                operation="",
                status="failed",
                idempotency_key="",
                requested_by="",
            ), False
        row.salt_jid = salt_jid
        row.status = "running"
        row.updated_at = now
        await self._session.flush()
        return _job(row), True

    async def complete(
        self,
        job_id: str,
        *,
        claim_token: str,
        status: str,
        result_digest: str | None,
        error_code: str | None,
        now: datetime,
    ) -> ControlJobRecord | None:
        row = await self._session.get(models.ControlJob, job_id)
        if row is None or row.claim_token != claim_token:
            return None
        if row.status in TERMINAL_JOB_STATUSES:
            return _job(row)
        row.status = status
        row.result_digest = result_digest
        row.error_code = error_code
        row.completed_at = now
        row.lease_owner = None
        row.lease_expires_at = None
        row.updated_at = now
        await self._session.flush()
        return _job(row)

    async def list_for_endpoint(self, endpoint_id: str, *, limit: int = 20) -> list[ControlJobRecord]:
        result = await self._session.execute(
            select(models.ControlJob)
            .where(models.ControlJob.endpoint_id == endpoint_id)
            .order_by(models.ControlJob.accepted_at.desc())
            .limit(limit)
        )
        return [_job(r) for r in result.scalars().all()]

    async def expire_stale_leases(self, *, now: datetime) -> int:
        result = await self._session.execute(
            update(models.ControlJob)
            .where(
                models.ControlJob.status.in_(("dispatching", "running")),
                models.ControlJob.lease_expires_at.is_not(None),
                models.ControlJob.lease_expires_at < now,
            )
            .values(status="queued", claim_token=None, lease_owner=None, updated_at=now)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]


class SqlAlchemySecretScopeRepository(SecretScopeRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, record: SecretScopeRecord) -> SecretScopeRecord:
        result = await self._session.execute(
            select(models.SecretScope).where(
                models.SecretScope.tenant_id == record.tenant_id,
                models.SecretScope.endpoint_id == record.endpoint_id,
                models.SecretScope.scope_type == record.scope_type,
                models.SecretScope.scope_key == record.scope_key,
            )
        )
        row = result.scalar_one_or_none()
        now = datetime.now(UTC)
        if row is None:
            row = models.SecretScope(
                tenant_id=record.tenant_id,
                endpoint_id=record.endpoint_id,
                scope_type=record.scope_type,
                scope_key=record.scope_key,
                secret_ref=record.secret_ref,
                version=record.version,
                checksum_redacted=record.checksum_redacted,
            )
            self._session.add(row)
        else:
            row.secret_ref = record.secret_ref
            row.version = record.version
            row.checksum_redacted = record.checksum_redacted
            row.updated_at = now
        await self._session.flush()
        return SecretScopeRecord(
            id=row.id,
            tenant_id=row.tenant_id,
            endpoint_id=row.endpoint_id,
            scope_type=row.scope_type,
            scope_key=row.scope_key,
            secret_ref=row.secret_ref,
            version=row.version,
            checksum_redacted=row.checksum_redacted,
            created_at=_dt(row.created_at),
            updated_at=_dt(row.updated_at),
        )

    async def get(
        self, *, tenant_id: str, endpoint_id: str, scope_type: str, scope_key: str
    ) -> SecretScopeRecord | None:
        result = await self._session.execute(
            select(models.SecretScope).where(
                models.SecretScope.tenant_id == tenant_id,
                models.SecretScope.endpoint_id == endpoint_id,
                models.SecretScope.scope_type == scope_type,
                models.SecretScope.scope_key == scope_key,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return SecretScopeRecord(
            id=row.id,
            tenant_id=row.tenant_id,
            endpoint_id=row.endpoint_id,
            scope_type=row.scope_type,
            scope_key=row.scope_key,
            secret_ref=row.secret_ref,
            version=row.version,
            checksum_redacted=row.checksum_redacted,
            created_at=_dt(row.created_at),
            updated_at=_dt(row.updated_at),
        )

    async def list_for_endpoint(self, endpoint_id: str) -> list[SecretScopeRecord]:
        result = await self._session.execute(
            select(models.SecretScope).where(models.SecretScope.endpoint_id == endpoint_id)
        )
        return [
            SecretScopeRecord(
                id=r.id,
                tenant_id=r.tenant_id,
                endpoint_id=r.endpoint_id,
                scope_type=r.scope_type,
                scope_key=r.scope_key,
                secret_ref=r.secret_ref,
                version=r.version,
                checksum_redacted=r.checksum_redacted,
                created_at=_dt(r.created_at),
                updated_at=_dt(r.updated_at),
            )
            for r in result.scalars().all()
        ]
