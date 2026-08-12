from __future__ import annotations

from datetime import UTC, datetime

from core.logging import redact_mapping
from db.repositories.interfaces import TERMINAL_JOB_STATUSES, JobReturnRecord, RepositoryBundle
from schemas.job_return import (
    JobReturnBatchRequest,
    JobReturnBatchResponse,
    JobReturnItemResult,
)
from services.job_service import digest_result


class ReturnService:
    def __init__(self, repos: RepositoryBundle) -> None:
        self.repos = repos

    async def batch_upsert(self, body: JobReturnBatchRequest) -> JobReturnBatchResponse:
        results: list[JobReturnItemResult] = []
        for item in body.items[:100]:
            redacted = redact_mapping(item.payload_redacted)
            record = JobReturnRecord(
                jid=item.jid,
                endpoint_id=item.endpoint_id,
                function=item.function,
                success=item.success,
                payload_redacted=redacted,
                received_at=datetime.now(UTC),
            )
            _, created = await self.repos.job_returns.upsert(record)
            await self._apply_to_control_job(item.jid, item.success, redacted)
            results.append(
                JobReturnItemResult(
                    jid=item.jid,
                    endpoint_id=item.endpoint_id,
                    function=item.function,
                    status="accepted" if created else "duplicate",
                )
            )
        return JobReturnBatchResponse(results=results)

    async def _apply_to_control_job(self, jid: str, success: bool, payload: dict) -> None:
        job = await self.repos.control_jobs.get_by_salt_jid(jid)
        if job is None or job.status in TERMINAL_JOB_STATUSES:
            return
        if not job.claim_token:
            return
        await self.repos.control_jobs.complete(
            job.id,
            claim_token=job.claim_token,
            status="succeeded" if success else "failed",
            result_digest=digest_result(payload),
            error_code=None if success else "salt_job_failed",
            now=datetime.now(UTC),
        )
