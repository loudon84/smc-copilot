from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime

from core.errors import ErrorCode, SaltControlError
from core.logging import safe_log_fields
from db.repositories.interfaces import AuditEventRecord, ControlJobRecord, RepositoryBundle
from schemas.job import EndpointStatusResponse, JobCreateRequest, JobResponse

ALLOWED_OPERATIONS = frozenset(
    {
        "install",
        "configure",
        "start",
        "stop",
        "restart",
        "health",
        "diagnose",
        "rollback",
        "handover",
        "remigrate",
    }
)

OPERATION_TO_SALT_FUN = {
    "install": "smc_hermes.install",
    "configure": "smc_hermes.doctor",
    "start": "smc_hermes.health",
    "stop": "smc_hermes.health",
    "restart": "smc_hermes.health",
    "health": "smc_hermes.health",
    "diagnose": "smc_hermes.doctor",
    "rollback": "smc_handover.rollback",
    "handover": "smc_handover.commit",
    "remigrate": "smc_handover.commit",
}


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


class JobService:
    def __init__(self, repos: RepositoryBundle) -> None:
        self.repos = repos

    def _to_response(self, record: ControlJobRecord, *, duplicate: bool = False) -> JobResponse:
        accepted = record.accepted_at or datetime.now(UTC)
        return JobResponse(
            job_id=record.id,
            salt_jid=record.salt_jid,
            status=record.status,  # type: ignore[arg-type]
            accepted_at=accepted.isoformat(),
            duplicate=duplicate,
            endpoint_id=record.endpoint_id,
            minion_id=record.minion_id,
            operation=record.operation,
            error_code=record.error_code,
            correlation_id=record.correlation_id,
        )

    async def create(self, body: JobCreateRequest) -> JobResponse:
        if body.operation not in ALLOWED_OPERATIONS:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "unsupported operation", status_code=400)

        existing = await self.repos.control_jobs.get_by_idempotency_key(body.idempotency_key)
        if existing is not None:
            return self._to_response(existing, duplicate=True)

        record = ControlJobRecord(
            id=_new_id("job"),
            endpoint_id=body.endpoint_id,
            minion_id=body.minion_id,
            operation=body.operation,
            status="queued",
            idempotency_key=body.idempotency_key,
            config_revision=body.config_revision,
            release_id=body.release_id,
            requested_by=body.requested_by,
            correlation_id=body.correlation_id,
            accepted_at=datetime.now(UTC),
        )
        created = await self.repos.control_jobs.create(record)
        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="operator",
                actor_id=body.requested_by,
                action="job.created",
                target_type="control_job",
                target_id=created.id,
                request_id=body.idempotency_key,
                metadata_redacted=safe_log_fields(
                    operation=body.operation,
                    endpoint_id=body.endpoint_id,
                    minion_id=body.minion_id,
                    correlation_id=body.correlation_id,
                ),
                occurred_at=datetime.now(UTC),
            )
        )
        return self._to_response(created, duplicate=created.id != record.id)

    async def get(self, job_id: str) -> JobResponse:
        record = await self.repos.control_jobs.get(job_id)
        if record is None:
            raise SaltControlError(ErrorCode.JOB_NOT_FOUND, "job not found", status_code=404)
        return self._to_response(record)

    async def fail_jid_conflict(self, job: ControlJobRecord, conflict: ControlJobRecord) -> JobResponse:
        """Mark new job failed without mutating the original JID owner."""
        now = datetime.now(UTC)
        if job.claim_token:
            await self.repos.control_jobs.complete(
                job.id,
                claim_token=job.claim_token,
                status="failed",
                result_digest=None,
                error_code=ErrorCode.SALT_JID_CONFLICT,
                now=now,
            )
        else:
            job.status = "failed"
            job.error_code = ErrorCode.SALT_JID_CONFLICT
            job.completed_at = now
            await self.repos.control_jobs.update(job)

        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="system",
                actor_id="job-worker",
                action="salt_jid_conflict",
                target_type="control_job",
                target_id=job.id,
                request_id=job.idempotency_key,
                metadata_redacted=safe_log_fields(
                    conflict_job_id=conflict.id,
                    salt_jid=conflict.salt_jid,
                ),
                occurred_at=now,
            )
        )
        response = self._to_response(job)
        response.error_code = ErrorCode.SALT_JID_CONFLICT
        response.conflict_job_id = conflict.id
        response.status = "failed"
        return response

    async def endpoint_status(self, endpoint_id: str) -> EndpointStatusResponse:
        endpoint = await self.repos.endpoints.get(endpoint_id)
        jobs = await self.repos.control_jobs.list_for_endpoint(endpoint_id, limit=1)
        last_job = None
        last_error = None
        migration_phase = None
        current_release = None
        current_revision = None
        if jobs:
            j = jobs[0]
            last_job = {
                "jobId": j.id,
                "operation": j.operation,
                "status": j.status,
                "saltJid": j.salt_jid,
                "correlationId": j.correlation_id,
            }
            last_error = j.error_code
            if j.operation in {"handover", "remigrate", "rollback"}:
                migration_phase = j.status if j.status != "succeeded" else f"{j.operation}_completed"
            current_release = j.release_id
            current_revision = j.config_revision

        desired = await self.repos.desired_states.get_latest(endpoint_id)
        if desired is not None:
            current_revision = current_revision or desired.revision

        heartbeat = None
        if endpoint is not None and endpoint.last_seen_at is not None:
            heartbeat = endpoint.last_seen_at.isoformat()

        return EndpointStatusResponse(
            endpoint_id=endpoint_id,
            heartbeat=heartbeat,
            last_job=last_job,
            rollout=None,
            deployment={"status": endpoint.status if endpoint else "unknown"},
            current_release=current_release,
            current_revision=current_revision,
            gateway_health=None,
            migration_phase=migration_phase,
            last_error=last_error,
        )


def digest_result(payload: dict | None) -> str:
    raw = str(sorted((payload or {}).items())).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()
