from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime

from core.errors import ErrorCode
from db.repositories.interfaces import (
    EndpointOperationRecord,
    OperationStepRecord,
    RepositoryBundle,
)
from db.unit_of_work import unit_of_work
from integrations.salt_master import SaltMaster
from services.job_result import parse_job_success


class EnrollmentOperationWorker:
    """Runs ping → sync_all → highstate after fingerprint accept; one JID per step."""

    STEPS = ("ping", "sync_all", "highstate")
    FUNS = {"ping": "test.ping", "sync_all": "saltutil.sync_all", "highstate": "state.highstate"}

    def __init__(
        self,
        repos: RepositoryBundle | None = None,
        masters: list[SaltMaster] | None = None,
        *,
        session_factory=None,
    ) -> None:
        self.repos = repos
        self.masters = masters or []
        self.session_factory = session_factory
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._loop(), name="enrollment-operation-worker")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await asyncio.wait([self._task], timeout=5)

    async def enqueue(
        self,
        *,
        endpoint_id: str,
        enrollment_id: str,
        request_id: str,
    ) -> EndpointOperationRecord:
        async def _once(repos: RepositoryBundle) -> EndpointOperationRecord:
            existing = await repos.operations.get_by_request_id(request_id)
            if existing is not None:
                return existing
            op = EndpointOperationRecord(
                id=f"op_{secrets.token_urlsafe(10)}",
                endpoint_id=endpoint_id,
                enrollment_id=enrollment_id,
                kind="enrollment_post_accept",
                state="pending",
                request_id=request_id,
                created_at=datetime.now(UTC),
            )
            await repos.operations.create(op)
            for step_name in self.STEPS:
                await repos.operations.upsert_step(
                    OperationStepRecord(operation_id=op.id, step_name=step_name, state="pending")
                )
            return op

        return await self._with_repos(_once)

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception:
                pass
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=2.0)
            except TimeoutError:
                continue

    async def tick(self) -> None:
        async def _once(repos: RepositoryBundle) -> None:
            ops = await repos.operations.list_resumable(kinds=["enrollment_post_accept"])
            for op in ops:
                await self._process(repos, op)

        await self._with_repos(_once)

    async def _process(self, repos: RepositoryBundle, op: EndpointOperationRecord) -> None:
        if not self.masters:
            return
        primary = self.masters[0]
        enrollment = None
        if op.enrollment_id:
            enrollment = await repos.enrollments.get(op.enrollment_id)
        op.state = "running"
        await repos.operations.update(op)

        for step_name in self.STEPS:
            step = await repos.operations.get_step(op.id, step_name)
            if step is None or step.state == "completed":
                continue
            step.state = "running"
            step.started_at = datetime.now(UTC)
            await repos.operations.upsert_step(step)
            try:
                fun = self.FUNS[step_name]
                ok = False
                jid = step.salt_jid
                if jid and hasattr(primary, "wait_job"):
                    job = await primary.wait_job(jid, timeout_seconds=300)  # type: ignore[attr-defined]
                    parsed = parse_job_success(job, op.endpoint_id)
                    ok = bool(parsed) if parsed is not None else False
                elif hasattr(primary, "local_async"):
                    jid = await primary.local_async(op.endpoint_id, fun)  # type: ignore[attr-defined]
                    step.salt_jid = jid
                    await repos.operations.upsert_step(step)
                    job = await primary.wait_job(jid, timeout_seconds=300)  # type: ignore[attr-defined]
                    parsed = parse_job_success(job, op.endpoint_id)
                    if parsed is None and step_name == "ping":
                        # Fallback only when wait_job returns empty structure.
                        ok = bool(job)
                    else:
                        ok = bool(parsed) if parsed is not None else bool(job)
                else:
                    if step_name == "ping":
                        ok = await primary.ping(op.endpoint_id)
                    elif step_name == "sync_all":
                        ok = await primary.sync_all(op.endpoint_id)
                    elif step_name == "highstate":
                        ok = await primary.highstate(op.endpoint_id)

                if not ok:
                    step.state = "failed"
                    step.error_code = {
                        "ping": ErrorCode.MASTER_ACCEPT_FAILED,
                        "sync_all": ErrorCode.SYNC_ALL_FAILED,
                        "highstate": ErrorCode.HIGHSTATE_FAILED,
                    }[step_name]
                    step.completed_at = datetime.now(UTC)
                    step.result_redacted = {"ok": False}
                    await repos.operations.upsert_step(step)
                    op.state = "failed"
                    op.error_code = step.error_code
                    op.completed_at = datetime.now(UTC)
                    await repos.operations.update(op)
                    if enrollment is not None:
                        enrollment.state = "failed"
                        enrollment.error_code = step.error_code
                        await repos.enrollments.update(enrollment)
                    return
                step.state = "completed"
                step.completed_at = datetime.now(UTC)
                step.result_redacted = {"ok": True, "jid": jid}
                await repos.operations.upsert_step(step)
                if enrollment is not None:
                    if step_name == "ping":
                        enrollment.state = "accepted"
                    elif step_name == "sync_all":
                        enrollment.state = "synced"
                    elif step_name == "highstate":
                        enrollment.state = "highstate"
                        enrollment.completed_at = datetime.now(UTC)
                    await repos.enrollments.update(enrollment)
            except Exception:
                step.state = "failed"
                step.error_code = ErrorCode.INTERNAL_ERROR
                step.completed_at = datetime.now(UTC)
                await repos.operations.upsert_step(step)
                op.state = "failed"
                op.error_code = ErrorCode.INTERNAL_ERROR
                op.completed_at = datetime.now(UTC)
                await repos.operations.update(op)
                return

        op.state = "completed"
        op.completed_at = datetime.now(UTC)
        await repos.operations.update(op)

    async def _with_repos(self, fn):
        if self.session_factory is not None:
            async with unit_of_work(self.session_factory) as uow:
                return await fn(uow.repos)
        assert self.repos is not None
        return await fn(self.repos)
