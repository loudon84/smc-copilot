from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime

from core.errors import ErrorCode, SaltControlError
from core.logging import safe_log_fields
from db.repositories.interfaces import AuditEventRecord, ControlJobRecord, RepositoryBundle
from schemas.job import EndpointStatusResponse, JobCreateRequest, JobResponse
from services.invocation import build_invocation
from services.job_payload_codec import payload_from_create

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
            payload_json=payload_from_create(body),
            expected_function=build_invocation(body.operation, body.payload).function if body.operation else None,
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
        desired_revision = desired.revision if desired is not None else None
        if desired is not None:
            current_revision = current_revision or desired.revision

        heartbeat = None
        if endpoint is not None and endpoint.last_seen_at is not None:
            heartbeat = endpoint.last_seen_at.isoformat()

        rollout_info = None
        desired_release = None
        owner = None
        target_state = None
        active = await self.repos.rollouts.list_active()
        for rollout in active:
            targets = await self.repos.rollouts.list_targets(rollout.id)
            match = next((t for t in targets if t.endpoint_id == endpoint_id), None)
            if match is None:
                continue
            rollout_info = {
                "rolloutId": rollout.id,
                "state": rollout.state,
                "ring": rollout.ring,
                "batchIndex": rollout.batch_index,
                "targetState": match.state,
            }
            desired_release = rollout.version
            target_state = match.state
            break

        obs = await self.repos.endpoint_observations.latest(endpoint_id, window="15m")
        gateway_health = None
        last_observed_at = None
        fact_source = None
        if obs is not None:
            gateway_health = str(obs.payload_json.get("gatewayHealth") or obs.payload_json.get("gateway_health") or "")
            owner = obs.payload_json.get("owner") or owner
            last_observed_at = obs.payload_json.get("lastObservedAt")
            fact_source = obs.payload_json.get("factSource")
        facts = await self.repos.endpoint_fact_samples.list_since(endpoint_id, since=datetime(1970, 1, 1, tzinfo=UTC))
        if facts:
            latest_fact = max(facts, key=lambda f: f.captured_at or datetime.min.replace(tzinfo=UTC))
            last_observed_at = latest_fact.captured_at.isoformat() if latest_fact.captured_at else last_observed_at
            fact_source = latest_fact.source
            owner = latest_fact.payload_json.get("owner") or owner
            gateway_health = latest_fact.payload_json.get("gatewayHealth") or gateway_health

        if owner is None:
            binding = await self.repos.bindings.get_active(endpoint_id)
            if binding is not None:
                owner = "salt" if (endpoint and endpoint.status == "active") else "runtime"

        return EndpointStatusResponse(
            endpoint_id=endpoint_id,
            heartbeat=heartbeat,
            last_job=last_job,
            rollout=rollout_info,
            deployment={"status": endpoint.status if endpoint else "unknown"},
            current_release=current_release,
            desired_release=desired_release,
            current_revision=current_revision,
            desired_revision=desired_revision,
            gateway_health=gateway_health or None,
            owner=owner,
            migration_phase=migration_phase,
            target_state=target_state,
            last_error=last_error,
            last_observed_at=last_observed_at,
            fact_source=fact_source,
        )


def digest_result(payload: dict | None) -> str:
    raw = str(sorted((payload or {}).items())).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()
