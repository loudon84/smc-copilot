from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import RuntimeJobStatus, RuntimeJobType
from core.runtime_errors import RuntimeServiceError, runtime_lock_conflict
from runtime.cancellation_token import CancellationToken, JobCancelled
from db.models.runtime import RuntimeJob, RuntimeJobEvent
from db.repositories.runtime_repo import RuntimeJobRepository
from schemas.runtime import RuntimeJobAcceptedResponse, RuntimeJobResponse

logger = get_logger(__name__)

JobHandler = Callable[[RuntimeJob, dict[str, Any], Callable[..., Awaitable[None]]], Awaitable[dict[str, Any]]]

WRITE_JOB_TYPES = frozenset(
    {
        RuntimeJobType.INSTALL.value,
        RuntimeJobType.UPDATE.value,
        RuntimeJobType.ROLLBACK.value,
        RuntimeJobType.RESTORE.value,
        RuntimeJobType.CONFIG_MIGRATE.value,
        RuntimeJobType.RUNTIME_CLEANUP.value,
        RuntimeJobType.BOOTSTRAP.value,
    }
)


def job_to_response(job: RuntimeJob) -> RuntimeJobResponse:
    result = None
    if job.result_json:
        try:
            parsed = json.loads(job.result_json)
            if isinstance(parsed, dict):
                result = parsed
        except json.JSONDecodeError:
            result = {"raw": job.result_json}
    return RuntimeJobResponse(
        jobId=job.id,
        jobType=job.job_type,
        status=job.status,
        phase=job.phase,
        progress=job.progress or 0.0,
        errorCode=job.error_code,
        errorMessage=job.error_message,
        result=result,
        createdAt=job.created_at,
        startedAt=job.started_at,
        completedAt=job.completed_at,
    )


# @lat: [[runtime-service#运行时 Job 队列]]
class RuntimeJobService:
    def __init__(
        self,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        *,
        handlers: dict[str, JobHandler] | None = None,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._handlers: dict[str, JobHandler] = handlers or {}
        self._lock = asyncio.Lock()
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._cancellation_tokens: dict[str, CancellationToken] = {}
        self._running_job_id: str | None = None

    def register_handler(self, job_type: str, handler: JobHandler) -> None:
        self._handlers[job_type] = handler

    async def start_worker(self) -> None:
        if self._worker_task is not None:
            return
        self._stop.clear()
        self._worker_task = asyncio.create_task(self._run_loop())

    async def stop_worker(self) -> None:
        self._stop.set()
        if self._worker_task is not None:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None

    async def recover_incomplete_jobs(self) -> int:
        """Mark unfinished jobs as failed after service restart (PRD §7.2)."""
        async with self._session_maker() as session:
            repo = RuntimeJobRepository(session)
            incomplete = await repo.list_incomplete()
            count = 0
            for job in incomplete:
                job.status = RuntimeJobStatus.FAILED.value
                job.error_code = "runtime_restarted"
                job.error_message = "Job interrupted by runtime service restart"
                job.completed_at = datetime.now(timezone.utc)
                await repo.add_event(
                    RuntimeJobEvent(
                        job_id=job.id,
                        sequence=await repo.next_sequence(job.id),
                        event_type="job.failed",
                        level="error",
                        message=job.error_message,
                        payload_json=json.dumps({"errorCode": job.error_code}),
                    )
                )
                count += 1
            await session.commit()
            return count

    async def create_job(
        self,
        job_type: str,
        request: dict[str, Any],
        *,
        device_id: str | None = None,
    ) -> RuntimeJobAcceptedResponse:
        if job_type not in {t.value for t in RuntimeJobType}:
            raise RuntimeServiceError(f"Unknown job type: {job_type}", code="validation_error")

        async with self._lock:
            async with self._session_maker() as session:
                repo = RuntimeJobRepository(session)
                if job_type in WRITE_JOB_TYPES:
                    active = await repo.find_active_write_job()
                    if active is not None:
                        raise runtime_lock_conflict(active.id)
                job = RuntimeJob(
                    job_type=job_type,
                    status=RuntimeJobStatus.PENDING.value,
                    phase="queued",
                    progress=0.0,
                    request_json=json.dumps(request),
                    created_by_device_id=device_id,
                )
                await repo.add(job)
                await repo.add_event(
                    RuntimeJobEvent(
                        job_id=job.id,
                        sequence=1,
                        event_type="job.started",
                        level="info",
                        message=f"Job {job_type} queued",
                    )
                )
                await session.commit()
                job_id = job.id
                status = job.status

        await self._queue.put(job_id)
        return RuntimeJobAcceptedResponse(jobId=job_id, status=status)

    async def get_job(self, job_id: str) -> RuntimeJobResponse:
        async with self._session_maker() as session:
            repo = RuntimeJobRepository(session)
            job = await repo.get(job_id)
            if job is None:
                raise RuntimeServiceError(f"Job not found: {job_id}", code="not_found")
            return job_to_response(job)

    async def list_jobs(self, *, limit: int = 50) -> list[RuntimeJobResponse]:
        async with self._session_maker() as session:
            repo = RuntimeJobRepository(session)
            jobs = await repo.list_jobs(limit=limit)
            return [job_to_response(j) for j in jobs]

    async def cancel_job(self, job_id: str) -> RuntimeJobResponse:
        async with self._lock:
            async with self._session_maker() as session:
                repo = RuntimeJobRepository(session)
                job = await repo.get(job_id)
                if job is None:
                    raise RuntimeServiceError(f"Job not found: {job_id}", code="not_found")
                if job.status in (
                    RuntimeJobStatus.SUCCEEDED.value,
                    RuntimeJobStatus.FAILED.value,
                    RuntimeJobStatus.CANCELLED.value,
                ):
                    raise RuntimeServiceError("Job already finished", code="invalid_state")

                job.cancellation_requested_at = datetime.now(timezone.utc)
                token = self._cancellation_tokens.get(job_id)
                if token is not None:
                    token.cancel()
                elif self._running_job_id == job_id:
                    token = CancellationToken()
                    token.cancel()
                    self._cancellation_tokens[job_id] = token

                if job.status == RuntimeJobStatus.PENDING.value:
                    job.status = RuntimeJobStatus.CANCELLED.value
                    job.completed_at = datetime.now(timezone.utc)
                    await repo.add_event(
                        RuntimeJobEvent(
                            job_id=job.id,
                            sequence=await repo.next_sequence(job.id),
                            event_type="job.cancelled",
                            level="warn",
                            message="Job cancelled",
                        )
                    )
                else:
                    await repo.add_event(
                        RuntimeJobEvent(
                            job_id=job.id,
                            sequence=await repo.next_sequence(job.id),
                            event_type="job.cancel_requested",
                            level="warn",
                            message="Cancellation requested",
                        )
                    )
                await session.commit()
                return job_to_response(job)

    async def iter_events(
        self, job_id: str, *, after_sequence: int = 0, poll_interval: float = 0.5
    ) -> AsyncIterator[dict[str, Any]]:
        last = after_sequence
        while True:
            async with self._session_maker() as session:
                repo = RuntimeJobRepository(session)
                job = await repo.get(job_id)
                if job is None:
                    raise RuntimeServiceError(f"Job not found: {job_id}", code="not_found")
                events = await repo.list_events(job_id, after_sequence=last)
                for ev in events:
                    last = ev.sequence
                    payload = None
                    if ev.payload_json:
                        try:
                            payload = json.loads(ev.payload_json)
                        except json.JSONDecodeError:
                            payload = {"raw": ev.payload_json}
                    yield {
                        "event": ev.event_type,
                        "sequence": ev.sequence,
                        "level": ev.level,
                        "message": ev.message,
                        "payload": payload,
                        "createdAt": ev.created_at.isoformat() if ev.created_at else None,
                    }
                if job.status in (
                    RuntimeJobStatus.SUCCEEDED.value,
                    RuntimeJobStatus.FAILED.value,
                    RuntimeJobStatus.CANCELLED.value,
                ) and not events:
                    return
            await asyncio.sleep(poll_interval)

    async def _emit(
        self,
        session: AsyncSession,
        job: RuntimeJob,
        event_type: str,
        message: str,
        *,
        level: str = "info",
        payload: dict[str, Any] | None = None,
        phase: str | None = None,
        progress: float | None = None,
    ) -> None:
        repo = RuntimeJobRepository(session)
        if phase is not None:
            job.phase = phase
        if progress is not None:
            job.progress = progress
        await repo.add_event(
            RuntimeJobEvent(
                job_id=job.id,
                sequence=await repo.next_sequence(job.id),
                event_type=event_type,
                level=level,
                message=message,
                payload_json=json.dumps(payload) if payload else None,
            )
        )
        await session.commit()

    async def _run_loop(self) -> None:
        while not self._stop.is_set():
            try:
                job_id = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            try:
                await self._execute_job(job_id)
            except Exception:
                logger.exception("runtime_job_worker_failed", job_id=job_id)

    async def _execute_job(self, job_id: str) -> None:
        token = CancellationToken()
        self._cancellation_tokens[job_id] = token
        self._running_job_id = job_id
        try:
            async with self._session_maker() as session:
                repo = RuntimeJobRepository(session)
                job = await repo.get(job_id)
                if job is None:
                    return
                if job.status == RuntimeJobStatus.CANCELLED.value:
                    return
                if job.cancellation_requested_at is not None:
                    token.cancel()
                job.status = RuntimeJobStatus.RUNNING.value
                job.started_at = datetime.now(timezone.utc)
                job.phase = "running"
                await session.commit()

                request: dict[str, Any] = {}
                if job.request_json:
                    try:
                        parsed = json.loads(job.request_json)
                        if isinstance(parsed, dict):
                            request = parsed
                    except json.JSONDecodeError:
                        request = {}

                handler = self._handlers.get(job.job_type)

                async def progress(
                    message: str,
                    *,
                    phase: str | None = None,
                    progress_value: float | None = None,
                    event_type: str = "job.progress",
                    payload: dict[str, Any] | None = None,
                ) -> None:
                    await self._emit(
                        session,
                        job,
                        event_type,
                        message,
                        phase=phase,
                        progress=progress_value,
                        payload=payload,
                    )

                try:
                    if handler is None:
                        await progress("No handler registered; completing as stub", phase="stub", progress_value=1.0)
                        result: dict[str, Any] = {"stub": True, "jobType": job.job_type}
                    else:
                        result = await handler(job, request, progress, token)

                    job = await repo.get(job_id)
                    if job is None:
                        return
                    if job.status == RuntimeJobStatus.CANCELLED.value or token.is_cancelled:
                        job.status = RuntimeJobStatus.CANCELLED.value
                        job.completed_at = datetime.now(timezone.utc)
                        await repo.add_event(
                            RuntimeJobEvent(
                                job_id=job.id,
                                sequence=await repo.next_sequence(job.id),
                                event_type="job.cancelled",
                                level="warn",
                                message="Job cancelled",
                            )
                        )
                        await session.commit()
                        return
                    # v1.3.1: install/update must never succeed without real executable verification
                    if job.job_type in ("install", "update") and isinstance(result, dict):
                        if result.get("alreadyInstalled") and result.get("realExecutableVerified") is not True:
                            raise RuntimeServiceError(
                                "alreadyInstalled without realExecutableVerified",
                                code="hermes_version_invalid",
                            )
                        if not result.get("alreadyInstalled") and result.get("realExecutableVerified") is not True:
                            raise RuntimeServiceError(
                                "Install/update result missing realExecutableVerified=true",
                                code="hermes_version_invalid",
                                details={"stub": result.get("stub")},
                            )
                        if result.get("stub") is True:
                            raise RuntimeServiceError(
                                "Install/update must not report stub=true",
                                code="hermes_version_invalid",
                            )
                    job.status = RuntimeJobStatus.SUCCEEDED.value
                    job.progress = 1.0
                    job.phase = "completed"
                    job.result_json = json.dumps(result)
                    job.completed_at = datetime.now(timezone.utc)
                    await repo.add_event(
                        RuntimeJobEvent(
                            job_id=job.id,
                            sequence=await repo.next_sequence(job.id),
                            event_type="job.completed",
                            level="info",
                            message="Job completed",
                            payload_json=json.dumps(result),
                        )
                    )
                    await session.commit()
                except JobCancelled:
                    job = await repo.get(job_id)
                    if job is None:
                        return
                    job.status = RuntimeJobStatus.CANCELLED.value
                    job.error_code = "cancelled"
                    job.error_message = "Job cancelled"
                    job.completed_at = datetime.now(timezone.utc)
                    await repo.add_event(
                        RuntimeJobEvent(
                            job_id=job.id,
                            sequence=await repo.next_sequence(job.id),
                            event_type="job.cancelled",
                            level="warn",
                            message="Job cancelled",
                        )
                    )
                    await session.commit()
                except RuntimeServiceError as exc:
                    job = await repo.get(job_id)
                    if job is None:
                        return
                    job.status = RuntimeJobStatus.FAILED.value
                    job.error_code = exc.code
                    job.error_message = exc.message
                    job.completed_at = datetime.now(timezone.utc)
                    await repo.add_event(
                        RuntimeJobEvent(
                            job_id=job.id,
                            sequence=await repo.next_sequence(job.id),
                            event_type="job.failed",
                            level="error",
                            message=exc.message,
                            payload_json=json.dumps({"errorCode": exc.code, "details": exc.details}),
                        )
                    )
                    await session.commit()
                except Exception as exc:
                    logger.exception("runtime_job_failed", job_id=job_id)
                    job = await repo.get(job_id)
                    if job is None:
                        return
                    job.status = RuntimeJobStatus.FAILED.value
                    job.error_code = "internal_error"
                    job.error_message = str(exc)
                    job.completed_at = datetime.now(timezone.utc)
                    await repo.add_event(
                        RuntimeJobEvent(
                            job_id=job.id,
                            sequence=await repo.next_sequence(job.id),
                            event_type="job.failed",
                            level="error",
                            message=str(exc),
                            payload_json=json.dumps({"errorCode": "internal_error"}),
                        )
                    )
                    await session.commit()
        finally:
            self._cancellation_tokens.pop(job_id, None)
            if self._running_job_id == job_id:
                self._running_job_id = None
