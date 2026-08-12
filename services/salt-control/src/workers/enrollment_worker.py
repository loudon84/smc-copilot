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
from integrations.salt_master import SaltMaster


class EnrollmentOperationWorker:
    """Runs ping → sync_all → highstate after fingerprint accept; resumable across restarts."""

    STEPS = ("ping", "sync_all", "highstate")

    def __init__(self, repos: RepositoryBundle, masters: list[SaltMaster]) -> None:
        self.repos = repos
        self.masters = masters
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
        existing = await self.repos.operations.get_by_request_id(request_id)
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
        await self.repos.operations.create(op)
        for step_name in self.STEPS:
            await self.repos.operations.upsert_step(
                OperationStepRecord(operation_id=op.id, step_name=step_name, state="pending")
            )
        return op

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception:
                # Fail soft in worker loop; individual ops record errors.
                pass
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=2.0)
            except TimeoutError:
                continue

    async def tick(self) -> None:
        ops = await self.repos.operations.list_resumable(kinds=["enrollment_post_accept"])
        for op in ops:
            await self._process(op)

    async def _process(self, op: EndpointOperationRecord) -> None:
        if not self.masters:
            return
        primary = self.masters[0]
        enrollment = None
        if op.enrollment_id:
            enrollment = await self.repos.enrollments.get(op.enrollment_id)
        op.state = "running"
        await self.repos.operations.update(op)

        for step_name in self.STEPS:
            step = await self.repos.operations.get_step(op.id, step_name)
            if step is None:
                continue
            if step.state == "completed":
                continue
            step.state = "running"
            step.started_at = datetime.now(UTC)
            await self.repos.operations.upsert_step(step)
            try:
                ok = False
                jid = None
                if hasattr(primary, "local_async"):
                    fun = {"ping": "test.ping", "sync_all": "saltutil.sync_all", "highstate": "state.highstate"}[
                        step_name
                    ]
                    jid = await primary.local_async(op.endpoint_id, fun)  # type: ignore[attr-defined]
                    step.salt_jid = jid
                    job = await primary.wait_job(jid, timeout_seconds=300)  # type: ignore[attr-defined]
                    ok = bool(job)
                    if step_name == "ping":
                        ok = await primary.ping(op.endpoint_id)
                    elif step_name == "sync_all":
                        ok = await primary.sync_all(op.endpoint_id)
                    elif step_name == "highstate":
                        ok = await primary.highstate(op.endpoint_id)
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
                    await self.repos.operations.upsert_step(step)
                    op.state = "failed"
                    op.error_code = step.error_code
                    op.completed_at = datetime.now(UTC)
                    await self.repos.operations.update(op)
                    if enrollment is not None:
                        enrollment.state = "failed"
                        enrollment.error_code = step.error_code
                        await self.repos.enrollments.update(enrollment)
                    return
                step.state = "completed"
                step.completed_at = datetime.now(UTC)
                step.result_redacted = {"ok": True, "jid": jid}
                await self.repos.operations.upsert_step(step)
                if enrollment is not None:
                    if step_name == "ping":
                        enrollment.state = "accepted"
                    elif step_name == "sync_all":
                        enrollment.state = "synced"
                    elif step_name == "highstate":
                        enrollment.state = "highstate"
                        enrollment.completed_at = datetime.now(UTC)
                    await self.repos.enrollments.update(enrollment)
            except Exception:
                step.state = "failed"
                step.error_code = ErrorCode.INTERNAL_ERROR
                step.completed_at = datetime.now(UTC)
                await self.repos.operations.upsert_step(step)
                op.state = "failed"
                op.error_code = ErrorCode.INTERNAL_ERROR
                op.completed_at = datetime.now(UTC)
                await self.repos.operations.update(op)
                return

        op.state = "completed"
        op.completed_at = datetime.now(UTC)
        await self.repos.operations.update(op)
