from __future__ import annotations

import asyncio
import secrets
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from core.errors import ErrorCode
from core.logging import safe_log_fields
from db.repositories.interfaces import AuditEventRecord, ControlJobRecord, RepositoryBundle
from db.unit_of_work import unit_of_work
from integrations.salt_master import SaltMaster
from services.job_service import OPERATION_TO_SALT_FUN, JobService, digest_result


class JobWorker:
    """Claims queued control jobs with independent DB sessions; Redis is wake-only."""

    def __init__(
        self,
        *,
        masters: list[SaltMaster],
        session_factory: Any | None = None,
        repos: RepositoryBundle | None = None,
        worker_id: str | None = None,
        lease_seconds: int = 60,
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
        """Redis / API wake — does not own jobs."""
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
        await self._with_repos(self._tick_once)

    async def _tick_once(self, repos: RepositoryBundle) -> None:
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
        if job is None:
            return
        await self._dispatch(repos, job)

    async def _dispatch(self, repos: RepositoryBundle, job: ControlJobRecord) -> None:
        if not self.masters:
            await self._fail(repos, job, ErrorCode.MASTER_UNAVAILABLE)
            return
        primary = self.masters[0]
        fun = OPERATION_TO_SALT_FUN.get(job.operation)
        if fun is None:
            await self._fail(repos, job, ErrorCode.VALIDATION_ERROR)
            return

        now = datetime.now(UTC)
        await repos.control_jobs.heartbeat(
            job.id,
            claim_token=job.claim_token or "",
            lease_seconds=self.lease_seconds,
            now=now,
        )

        try:
            if hasattr(primary, "local_async"):
                jid = await primary.local_async(job.minion_id, fun)  # type: ignore[attr-defined]
            else:
                # FakeSaltMaster path — synthesize a jid via operation helpers.
                ok = await self._fake_run(primary, job)
                jid = f"fake-{job.id}-{job.attempt}"
                if not ok:
                    await self._fail(repos, job, ErrorCode.INTERNAL_ERROR)
                    return
                await self._succeed(repos, job, jid, {"ok": True})
                return
        except Exception:
            self.metrics["salt_publish_error_total"] += 1
            await self._fail(repos, job, ErrorCode.INTERNAL_ERROR)
            return

        assigned_job, assigned = await repos.control_jobs.set_salt_jid(
            job.id,
            claim_token=job.claim_token or "",
            salt_jid=str(jid),
            now=datetime.now(UTC),
        )
        if not assigned:
            service = JobService(repos)
            await service.fail_jid_conflict(job, assigned_job)
            self.metrics["job_duplicate_total"] += 1
            return

        try:
            result = await primary.wait_job(str(jid), timeout_seconds=300)  # type: ignore[attr-defined]
            ok = bool(result)
            if job.operation in {"health", "ping"} and hasattr(primary, "ping"):
                ok = await primary.ping(job.minion_id)
            if not ok:
                await self._fail(repos, job, ErrorCode.INTERNAL_ERROR)
                return
            await self._succeed(repos, job, str(jid), {"ok": True, "jid": jid})
        except Exception:
            await self._fail(repos, job, ErrorCode.INTERNAL_ERROR)

    async def _fake_run(self, primary: SaltMaster, job: ControlJobRecord) -> bool:
        if job.operation == "health" and hasattr(primary, "ping"):
            return await primary.ping(job.minion_id)
        if hasattr(primary, "highstate"):
            return await primary.highstate(job.minion_id)
        return True

    async def _succeed(self, repos: RepositoryBundle, job: ControlJobRecord, jid: str, payload: dict) -> None:
        now = datetime.now(UTC)
        await repos.control_jobs.complete(
            job.id,
            claim_token=job.claim_token or "",
            status="succeeded",
            result_digest=digest_result(payload),
            error_code=None,
            now=now,
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
                occurred_at=now,
            )
        )

    async def _fail(self, repos: RepositoryBundle, job: ControlJobRecord, code: str) -> None:
        now = datetime.now(UTC)
        await repos.control_jobs.complete(
            job.id,
            claim_token=job.claim_token or "",
            status="failed",
            result_digest=None,
            error_code=code,
            now=now,
        )
        if job.operation in {"handover", "remigrate"}:
            self.metrics["handover_failure_total"] += 1

    async def _with_repos(self, fn: Callable) -> None:
        if self.session_factory is not None:
            async with unit_of_work(self.session_factory) as uow:
                await fn(uow.repos)
            return
        assert self.repos is not None
        await fn(self.repos)
