"""Job worker with short transactions, lease renewal, and JID-first reclaim (v2.4)."""

from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime
from typing import Any

from core.errors import ErrorCode
from core.logging import safe_log_fields
from db.repositories.interfaces import AuditEventRecord, ControlJobRecord, RepositoryBundle
from db.unit_of_work import unit_of_work
from integrations.salt_master import SaltMaster
from services.invocation import build_invocation
from services.job_payload_codec import decode_job_payload
from services.job_result import parse_job_success
from services.job_service import JobService, digest_result


class JobWorker:
    def __init__(
        self,
        *,
        masters: list[SaltMaster],
        session_factory: Any | None = None,
        repos: RepositoryBundle | None = None,
        worker_id: str | None = None,
        lease_seconds: int = 60,
        heartbeat_interval: float = 20.0,
        poll_interval: float = 2.0,
        wake: asyncio.Event | None = None,
    ) -> None:
        if session_factory is None and repos is None:
            raise ValueError("JobWorker requires session_factory or repos")
        self.masters = masters
        self.session_factory = session_factory
        self.repos = repos
        self.worker_id = worker_id or f"worker_{secrets.token_urlsafe(6)}"
        self.lease_seconds = lease_seconds
        self.heartbeat_interval = heartbeat_interval
        self.poll_interval = poll_interval
        self.wake = wake or asyncio.Event()
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self.metrics: dict[str, int] = {
            "job_duplicate_total": 0,
            "job_reclaim_total": 0,
            "salt_publish_error_total": 0,
            "handover_failure_total": 0,
            "rollback_success_total": 0,
        }

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._loop(), name="control-job-worker")

    async def stop(self) -> None:
        self._stop.set()
        self.wake.set()
        if self._task is not None:
            await asyncio.wait([self._task], timeout=5)

    def notify(self) -> None:
        self.wake.set()

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception:
                pass
            self.wake.clear()
            try:
                await asyncio.wait_for(self.wake.wait(), timeout=self.poll_interval)
            except TimeoutError:
                continue

    async def tick(self) -> None:
        job = await self._claim_or_reclaim()
        if job is None:
            return
        await self._dispatch(job)

    async def _claim_or_reclaim(self) -> ControlJobRecord | None:
        async def _once(repos: RepositoryBundle) -> ControlJobRecord | None:
            now = datetime.now(UTC)
            job = await repos.control_jobs.claim_next(
                worker_id=self.worker_id,
                lease_seconds=self.lease_seconds,
                now=now,
            )
            if job is None:
                job = await repos.control_jobs.reclaim_expired(
                    worker_id=self.worker_id,
                    lease_seconds=self.lease_seconds,
                    now=now,
                )
                if job is not None:
                    self.metrics["job_reclaim_total"] += 1
            return job

        return await self._with_repos(_once)

    async def _dispatch(self, job: ControlJobRecord) -> None:
        if not self.masters:
            await self._fail(job, ErrorCode.MASTER_UNAVAILABLE)
            return
        primary = self.masters[0]

        # Reclaim with existing JID: poll only — do not re-publish.
        if job.salt_jid:
            await self._poll_existing(primary, job)
            return

        try:
            payload = decode_job_payload(job)
            invocation = build_invocation(job.operation, payload)
        except Exception:
            await self._fail(job, ErrorCode.VALIDATION_ERROR)
            return

        try:
            if hasattr(primary, "local_async"):
                jid = await primary.local_async(
                    job.minion_id,
                    invocation.function,
                    arg=invocation.arg or None,
                    kwarg=invocation.kwarg or None,
                )
            else:
                ok = await self._fake_run(primary, job)
                jid = f"fake-{job.id}-{job.attempt}"
                if not ok:
                    await self._fail(job, ErrorCode.INTERNAL_ERROR)
                    return
                await self._assign_jid(job, str(jid))
                await self._succeed(job, str(jid), {"ok": True})
                return
        except Exception:
            self.metrics["salt_publish_error_total"] += 1
            await self._fail(job, ErrorCode.INTERNAL_ERROR)
            return

        assigned = await self._assign_jid(job, str(jid))
        if not assigned:
            return
        await self._wait_with_heartbeat(primary, job, str(jid), invocation.timeout_seconds)

    async def _assign_jid(self, job: ControlJobRecord, jid: str) -> bool:
        async def _once(repos: RepositoryBundle) -> bool:
            conflict, ok = await repos.control_jobs.set_salt_jid(
                job.id,
                claim_token=job.claim_token or "",
                salt_jid=jid,
                now=datetime.now(UTC),
            )
            if not ok:
                await JobService(repos).fail_jid_conflict(job, conflict)
                self.metrics["job_duplicate_total"] += 1
                return False
            job.salt_jid = jid
            job.status = "running"
            return True

        return bool(await self._with_repos(_once))

    async def _poll_existing(self, primary: SaltMaster, job: ControlJobRecord) -> None:
        jid = job.salt_jid or ""
        await self._wait_with_heartbeat(primary, job, jid, 300.0)

    async def _wait_with_heartbeat(
        self,
        primary: SaltMaster,
        job: ControlJobRecord,
        jid: str,
        timeout_seconds: float,
    ) -> None:
        deadline = asyncio.get_event_loop().time() + timeout_seconds
        last_beat = 0.0
        while asyncio.get_event_loop().time() < deadline and not self._stop.is_set():
            now_mono = asyncio.get_event_loop().time()
            if now_mono - last_beat >= self.heartbeat_interval:
                await self._heartbeat(job)
                last_beat = now_mono
            if hasattr(primary, "get_job"):
                result = await primary.get_job(jid)  # type: ignore[attr-defined]
                if parse_job_success(result, job.minion_id) is not None:
                    ok = bool(parse_job_success(result, job.minion_id))
                    if ok:
                        await self._succeed(job, jid, {"ok": True, "jid": jid})
                    else:
                        await self._fail(job, ErrorCode.INTERNAL_ERROR)
                    return
            elif hasattr(primary, "wait_job"):
                result = await primary.wait_job(jid, timeout_seconds=min(self.heartbeat_interval, 5.0))  # type: ignore[attr-defined]
                parsed = parse_job_success(result, job.minion_id)
                if parsed is not None:
                    if parsed:
                        await self._succeed(job, jid, {"ok": True, "jid": jid})
                    else:
                        await self._fail(job, ErrorCode.INTERNAL_ERROR)
                    return
            await asyncio.sleep(1.0)
        await self._fail(job, ErrorCode.INTERNAL_ERROR)

    async def _heartbeat(self, job: ControlJobRecord) -> None:
        async def _once(repos: RepositoryBundle) -> None:
            await repos.control_jobs.heartbeat(
                job.id,
                claim_token=job.claim_token or "",
                lease_seconds=self.lease_seconds,
                now=datetime.now(UTC),
            )

        await self._with_repos(_once)

    async def _fake_run(self, primary: SaltMaster, job: ControlJobRecord) -> bool:
        if job.operation == "health" and hasattr(primary, "ping"):
            return await primary.ping(job.minion_id)
        if hasattr(primary, "highstate"):
            return await primary.highstate(job.minion_id)
        return True

    async def _succeed(self, job: ControlJobRecord, jid: str, payload: dict) -> None:
        async def _once(repos: RepositoryBundle) -> None:
            await repos.control_jobs.complete(
                job.id,
                claim_token=job.claim_token or "",
                status="succeeded",
                result_digest=digest_result(payload),
                error_code=None,
                now=datetime.now(UTC),
            )
            if job.operation == "rollback":
                self.metrics["rollback_success_total"] += 1
            await repos.audits.append(
                AuditEventRecord(
                    id=f"aud_{secrets.token_urlsafe(8)}",
                    actor_type="system",
                    actor_id=self.worker_id,
                    action="job.succeeded",
                    target_type="control_job",
                    target_id=job.id,
                    request_id=job.idempotency_key,
                    metadata_redacted=safe_log_fields(salt_jid=jid, operation=job.operation),
                    occurred_at=datetime.now(UTC),
                )
            )

        await self._with_repos(_once)

    async def _fail(self, job: ControlJobRecord, code: str) -> None:
        async def _once(repos: RepositoryBundle) -> None:
            await repos.control_jobs.complete(
                job.id,
                claim_token=job.claim_token or "",
                status="failed",
                result_digest=None,
                error_code=code,
                now=datetime.now(UTC),
            )
            if job.operation in {"handover", "remigrate"}:
                self.metrics["handover_failure_total"] += 1

        await self._with_repos(_once)

    async def _with_repos(self, fn):
        if self.session_factory is not None:
            async with unit_of_work(self.session_factory) as uow:
                return await fn(uow.repos)
        assert self.repos is not None
        return await fn(self.repos)
