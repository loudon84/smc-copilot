"""Result reconciler — reclaim running/result_pending jobs by JID only (v2.4.1)."""

from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from db.repositories.interfaces import RepositoryBundle
from db.unit_of_work import unit_of_work
from integrations.salt_master import SaltMaster
from services.job_result import parse_job_success
from services.job_service import digest_result


class ResultReconciler:
    def __init__(
        self,
        *,
        masters: list[SaltMaster],
        session_factory: Any | None = None,
        repos: RepositoryBundle | None = None,
        interval_seconds: float = 30.0,
        worker_id: str | None = None,
    ) -> None:
        if session_factory is None and repos is None:
            raise ValueError("ResultReconciler requires session_factory or repos")
        self.masters = masters
        self.session_factory = session_factory
        self.repos = repos
        self.interval_seconds = interval_seconds
        self.worker_id = worker_id or f"reconciler_{secrets.token_urlsafe(6)}"
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self.metrics = {"reconcile_total": 0, "expired_total": 0}

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._loop(), name="result-reconciler")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await asyncio.wait([self._task], timeout=5)

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception:
                pass
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval_seconds)
            except TimeoutError:
                continue

    async def tick(self) -> None:
        if self.session_factory is not None:
            async with unit_of_work(self.session_factory) as uow:
                await self._tick_once(uow.repos)
            return
        assert self.repos is not None
        await self._tick_once(self.repos)

    async def _tick_once(self, repos: RepositoryBundle) -> None:
        now = datetime.now(UTC)
        candidates = await repos.control_jobs.list_pending_reconcile()
        for job in candidates:
            if job.status not in {"running", "result_pending"} or not job.salt_jid:
                continue
            accepted = job.accepted_at or now
            ttl = timedelta(seconds=int(job.reconcile_ttl_seconds or 3600))
            if now - accepted > ttl:
                if job.claim_token:
                    await repos.control_jobs.complete(
                        job.id,
                        claim_token=job.claim_token,
                        status="expired",
                        result_digest=None,
                        error_code="reconcile_ttl_expired",
                        now=now,
                        result_source="reconciler",
                    )
                else:
                    job.status = "expired"
                    job.error_code = "reconcile_ttl_expired"
                    await repos.control_jobs.update(job)
                self.metrics["expired_total"] += 1
                continue
            if not self.masters:
                continue
            primary = self.masters[0]
            if not hasattr(primary, "get_job"):
                continue
            result = await primary.get_job(job.salt_jid)  # type: ignore[attr-defined]
            parsed = parse_job_success(result, job.minion_id)
            if parsed is None:
                continue
            if job.claim_token:
                await repos.control_jobs.complete(
                    job.id,
                    claim_token=job.claim_token,
                    status="succeeded" if parsed else "failed",
                    result_digest=digest_result({"ok": parsed, "jid": job.salt_jid}),
                    error_code=None if parsed else "salt_job_failed",
                    now=now,
                    result_redacted={"ok": parsed},
                    result_schema_version="v1",
                    result_source="reconciler",
                )
                self.metrics["reconcile_total"] += 1
