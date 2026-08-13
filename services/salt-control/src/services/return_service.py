from __future__ import annotations

import secrets
from datetime import UTC, datetime

from core.logging import redact_mapping, safe_log_fields
from db.repositories.interfaces import (
    TERMINAL_JOB_STATUSES,
    ControlPlaneIncidentRecord,
    JobReturnRecord,
    RepositoryBundle,
)
from schemas.job_return import (
    JobReturnBatchRequest,
    JobReturnBatchResponse,
    JobReturnItemResult,
)
from services.job_service import JobService, digest_result
from services.ring0_service import Ring0Orchestrator


class ReturnService:
    def __init__(self, repos: RepositoryBundle) -> None:
        self.repos = repos

    async def batch_upsert(
        self,
        body: JobReturnBatchRequest,
        *,
        auth_endpoint_id: str | None = None,
    ) -> JobReturnBatchResponse:
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
            await self._apply_to_control_job(
                jid=item.jid,
                endpoint_id=item.endpoint_id,
                function=item.function,
                success=item.success,
                payload=redacted,
                auth_endpoint_id=auth_endpoint_id,
            )
            results.append(
                JobReturnItemResult(
                    jid=item.jid,
                    endpoint_id=item.endpoint_id,
                    function=item.function,
                    status="accepted" if created else "duplicate",
                )
            )
        return JobReturnBatchResponse(results=results)

    async def _apply_to_control_job(
        self,
        *,
        jid: str,
        endpoint_id: str,
        function: str,
        success: bool,
        payload: dict,
        auth_endpoint_id: str | None,
    ) -> None:
        job = await self.repos.control_jobs.get_by_salt_jid(jid)
        if job is None or job.status in TERMINAL_JOB_STATUSES:
            return
        if not job.claim_token:
            return

        expected = job.expected_function or function
        identity_ok = (
            endpoint_id == job.endpoint_id
            and endpoint_id == job.minion_id
            and function == expected
            and (auth_endpoint_id is None or auth_endpoint_id == endpoint_id)
        )
        if not identity_ok:
            await self.repos.control_plane_incidents.create(
                ControlPlaneIncidentRecord(
                    id=f"inc_{secrets.token_urlsafe(8)}",
                    severity="P1",
                    code="RETURN_IDENTITY_MISMATCH",
                    message="return endpoint/function does not match control job",
                    endpoint_id=job.endpoint_id,
                    metadata_redacted=safe_log_fields(
                        jid=jid,
                        return_endpoint=endpoint_id,
                        return_function=function,
                        expected_function=expected,
                        auth_endpoint=auth_endpoint_id,
                    ),
                )
            )
            return

        await self.repos.control_jobs.complete(
            job.id,
            claim_token=job.claim_token,
            status="succeeded" if success else "failed",
            result_digest=digest_result(payload),
            error_code=None if success else "salt_job_failed",
            now=datetime.now(UTC),
            result_redacted=payload,
            result_schema_version="v1",
            result_source="returner",
        )
        await Ring0Orchestrator(self.repos, JobService(self.repos)).apply_job_result(job.id)
