from __future__ import annotations

from datetime import UTC, datetime

from core.logging import redact_mapping
from db.repositories.interfaces import JobReturnRecord, RepositoryBundle
from schemas.job_return import (
    JobReturnBatchRequest,
    JobReturnBatchResponse,
    JobReturnItemResult,
)


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
            results.append(
                JobReturnItemResult(
                    jid=item.jid,
                    endpoint_id=item.endpoint_id,
                    function=item.function,
                    status="accepted" if created else "duplicate",
                )
            )
        return JobReturnBatchResponse(results=results)
