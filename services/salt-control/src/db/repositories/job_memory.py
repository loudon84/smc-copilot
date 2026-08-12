from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime, timedelta

from db.repositories.interfaces import (
    TERMINAL_JOB_STATUSES,
    ControlJobRecord,
    ControlJobRepository,
    SecretScopeRecord,
    SecretScopeRepository,
)


class InMemoryControlJobRepository(ControlJobRepository):
    def __init__(self) -> None:
        self._by_id: dict[str, ControlJobRecord] = {}
        self._by_idempotency: dict[str, str] = {}
        self._by_jid: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def create(self, record: ControlJobRecord) -> ControlJobRecord:
        async with self._lock:
            existing_key = self._by_idempotency.get(record.idempotency_key)
            if existing_key:
                return self._by_id[existing_key]
            now = datetime.now(UTC)
            if record.accepted_at is None:
                record.accepted_at = now
            if record.updated_at is None:
                record.updated_at = now
            self._by_id[record.id] = record
            self._by_idempotency[record.idempotency_key] = record.id
            if record.salt_jid:
                self._by_jid[record.salt_jid] = record.id
            return record

    async def get(self, job_id: str) -> ControlJobRecord | None:
        return self._by_id.get(job_id)

    async def get_by_idempotency_key(self, key: str) -> ControlJobRecord | None:
        job_id = self._by_idempotency.get(key)
        return self._by_id.get(job_id) if job_id else None

    async def get_by_salt_jid(self, salt_jid: str) -> ControlJobRecord | None:
        job_id = self._by_jid.get(salt_jid)
        return self._by_id.get(job_id) if job_id else None

    async def update(self, record: ControlJobRecord) -> ControlJobRecord:
        record.updated_at = datetime.now(UTC)
        self._by_id[record.id] = record
        if record.salt_jid:
            self._by_jid[record.salt_jid] = record.id
        return record

    async def claim_next(
        self,
        *,
        worker_id: str,
        lease_seconds: int,
        now: datetime,
    ) -> ControlJobRecord | None:
        async with self._lock:
            candidates = sorted(
                (
                    j
                    for j in self._by_id.values()
                    if j.status == "queued"
                    and (j.lease_expires_at is None or j.lease_expires_at < now)
                ),
                key=lambda j: j.accepted_at or now,
            )
            if not candidates:
                return None
            job = candidates[0]
            job.status = "dispatching"
            job.claim_token = secrets.token_urlsafe(16)
            job.lease_owner = worker_id
            job.lease_expires_at = now + timedelta(seconds=lease_seconds)
            job.heartbeat_at = now
            job.attempt += 1
            job.updated_at = now
            return job

    async def reclaim_expired(
        self,
        *,
        worker_id: str,
        lease_seconds: int,
        now: datetime,
    ) -> ControlJobRecord | None:
        async with self._lock:
            for job in self._by_id.values():
                if job.status not in {"dispatching", "running"}:
                    continue
                if job.lease_expires_at is None or job.lease_expires_at >= now:
                    continue
                job.claim_token = secrets.token_urlsafe(16)
                job.lease_owner = worker_id
                job.lease_expires_at = now + timedelta(seconds=lease_seconds)
                job.heartbeat_at = now
                job.attempt += 1
                job.updated_at = now
                return job
            return None

    async def heartbeat(self, job_id: str, *, claim_token: str, lease_seconds: int, now: datetime) -> bool:
        job = self._by_id.get(job_id)
        if job is None or job.claim_token != claim_token:
            return False
        job.heartbeat_at = now
        job.lease_expires_at = now + timedelta(seconds=lease_seconds)
        job.updated_at = now
        return True

    async def set_salt_jid(
        self,
        job_id: str,
        *,
        claim_token: str,
        salt_jid: str,
        now: datetime,
    ) -> tuple[ControlJobRecord, bool]:
        async with self._lock:
            existing_id = self._by_jid.get(salt_jid)
            if existing_id is not None and existing_id != job_id:
                existing = self._by_id[existing_id]
                return existing, False
            job = self._by_id.get(job_id)
            if job is None or job.claim_token != claim_token:
                return job or ControlJobRecord(
                    id=job_id,
                    endpoint_id="",
                    minion_id="",
                    operation="",
                    status="failed",
                    idempotency_key="",
                    requested_by="",
                ), False
            job.salt_jid = salt_jid
            job.status = "running"
            job.updated_at = now
            self._by_jid[salt_jid] = job_id
            return job, True

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
        job = self._by_id.get(job_id)
        if job is None or job.claim_token != claim_token:
            return None
        if job.status in TERMINAL_JOB_STATUSES:
            return job
        job.status = status
        job.result_digest = result_digest
        job.error_code = error_code
        job.completed_at = now
        job.lease_owner = None
        job.lease_expires_at = None
        job.updated_at = now
        return job

    async def list_for_endpoint(self, endpoint_id: str, *, limit: int = 20) -> list[ControlJobRecord]:
        jobs = [j for j in self._by_id.values() if j.endpoint_id == endpoint_id]
        jobs.sort(key=lambda j: j.accepted_at or datetime.min.replace(tzinfo=UTC), reverse=True)
        return jobs[:limit]

    async def expire_stale_leases(self, *, now: datetime) -> int:
        count = 0
        for job in self._by_id.values():
            if job.status not in {"dispatching", "running"}:
                continue
            if job.lease_expires_at and job.lease_expires_at < now:
                job.status = "queued"
                job.claim_token = None
                job.lease_owner = None
                count += 1
        return count


class InMemorySecretScopeRepository(SecretScopeRepository):
    def __init__(self) -> None:
        self._scopes: dict[tuple[str, str, str, str], SecretScopeRecord] = {}
        self._seq = 0

    def _key(self, record: SecretScopeRecord) -> tuple[str, str, str, str]:
        return (record.tenant_id, record.endpoint_id, record.scope_type, record.scope_key)

    async def upsert(self, record: SecretScopeRecord) -> SecretScopeRecord:
        key = self._key(record)
        existing = self._scopes.get(key)
        now = datetime.now(UTC)
        if existing is not None:
            existing.secret_ref = record.secret_ref
            existing.version = record.version
            existing.checksum_redacted = record.checksum_redacted
            existing.updated_at = now
            return existing
        self._seq += 1
        record.id = self._seq
        record.created_at = now
        record.updated_at = now
        self._scopes[key] = record
        return record

    async def get(
        self, *, tenant_id: str, endpoint_id: str, scope_type: str, scope_key: str
    ) -> SecretScopeRecord | None:
        return self._scopes.get((tenant_id, endpoint_id, scope_type, scope_key))

    async def list_for_endpoint(self, endpoint_id: str) -> list[SecretScopeRecord]:
        return [s for s in self._scopes.values() if s.endpoint_id == endpoint_id]
