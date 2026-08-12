from __future__ import annotations

from schemas.job import JobCreateRequest, JobResponse
from services.job_service import JobService


class HandoverService:
    """Unified orchestration for handover / rollback / remigrate via Control Jobs."""

    def __init__(self, job_service: JobService) -> None:
        self.jobs = job_service

    async def handover(
        self,
        *,
        endpoint_id: str,
        minion_id: str,
        idempotency_key: str,
        requested_by: str,
        config_revision: str | None = None,
        release_id: str | None = None,
        correlation_id: str | None = None,
    ) -> JobResponse:
        return await self.jobs.create(
            JobCreateRequest(
                endpoint_id=endpoint_id,
                minion_id=minion_id,
                operation="handover",
                idempotency_key=idempotency_key,
                config_revision=config_revision,
                release_id=release_id,
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
        )

    async def rollback(
        self,
        *,
        endpoint_id: str,
        minion_id: str,
        idempotency_key: str,
        requested_by: str,
        config_revision: str | None = None,
        release_id: str | None = None,
        correlation_id: str | None = None,
    ) -> JobResponse:
        return await self.jobs.create(
            JobCreateRequest(
                endpoint_id=endpoint_id,
                minion_id=minion_id,
                operation="rollback",
                idempotency_key=idempotency_key,
                config_revision=config_revision,
                release_id=release_id,
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
        )

    async def remigrate(
        self,
        *,
        endpoint_id: str,
        minion_id: str,
        idempotency_key: str,
        requested_by: str,
        config_revision: str | None = None,
        release_id: str | None = None,
        correlation_id: str | None = None,
    ) -> JobResponse:
        """Re-run preflight + Salt ownership; reuses idempotency_key semantics."""
        return await self.jobs.create(
            JobCreateRequest(
                endpoint_id=endpoint_id,
                minion_id=minion_id,
                operation="remigrate",
                idempotency_key=idempotency_key,
                config_revision=config_revision,
                release_id=release_id,
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
        )
