"""Ring 0 aggregate — trusted snapshot, batch gates, signoff (v2.4.1)."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from core.errors import ErrorCode, SaltControlError
from core.logging import safe_log_fields
from db.repositories.interfaces import (
    AuditEventRecord,
    RepositoryBundle,
    RolloutApprovalRecord,
    RolloutRecord,
    RolloutTargetJobRecord,
    RolloutTargetRecord,
)
from integrations.management_backend import ManagementBackend
from schemas.job import JobCreateRequest
from services.gate_evaluator import evaluate_rollout
from services.invocation import build_invocation
from services.job_service import JobService
from services.target_resolver import resolve_ring0_snapshot

RING0_BATCHES = ((0, 1), (1, 2), (2, 2))
REQUIRED_APPROVAL_ROLES = ("release_owner", "platform_owner", "security_owner")
BATCH_OBSERVATION = timedelta(hours=24)
FINAL_OBSERVATION = timedelta(days=7)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


def snapshot_digest(targets: list[dict[str, Any]]) -> str:
    raw = json.dumps(targets, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class Ring0Orchestrator:
    def __init__(
        self,
        repos: RepositoryBundle,
        job_service: JobService,
        backend: ManagementBackend | None = None,
    ) -> None:
        self.repos = repos
        self.jobs = job_service
        self.backend = backend

    async def create_ring0(
        self,
        *,
        component: str,
        version: str,
        targets: list[dict[str, Any]],
        actor_id: str,
        request_id: str,
        release_id: str,
        config_revision: str,
    ) -> RolloutRecord:
        normalized = await resolve_ring0_snapshot(
            targets,
            repos=self.repos,
            backend=self.backend,
            release_id=release_id,
            config_revision=config_revision,
        )
        digest = snapshot_digest(normalized)
        record = RolloutRecord(
            id=_new_id("ro"),
            component=component,
            version=version,
            ring="ring0",
            state="waiting_approval",
            thresholds_json={
                "approvalRequired": True,
                "batchSize": 1,
                "minSuccessRate": 0.99,
                "observationHoursPerBatch": 24,
                "observationDaysFinal": 7,
                "requiredRoles": list(REQUIRED_APPROVAL_ROLES),
                "snapshotDigest": digest,
                "snapshot": normalized,
                "currentBatch": 0,
                "batchStarted": False,
                "ring0Aggregate": True,
            },
            created_by=actor_id,
            target_count=5,
            snapshot_digest=digest,
            snapshot_json=normalized,
            batch_index=0,
            created_at=datetime.now(UTC),
        )
        await self.repos.rollouts.create(record)
        for idx, t in enumerate(normalized):
            await self.repos.rollouts.add_target(
                RolloutTargetRecord(
                    rollout_id=record.id,
                    endpoint_id=t["endpoint_id"],
                    state="pending",
                    batch_index=self._batch_for_offset(idx),
                )
            )
        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="operator",
                actor_id=actor_id,
                action="ring0.created",
                target_type="rollout",
                target_id=record.id,
                request_id=request_id,
                metadata_redacted=safe_log_fields(snapshot_digest=digest, target_count=5),
                occurred_at=datetime.now(UTC),
            )
        )
        return record

    def _batch_for_offset(self, offset: int) -> int:
        cursor = 0
        for batch_index, size in RING0_BATCHES:
            cursor += size
            if offset < cursor:
                return batch_index
        return len(RING0_BATCHES) - 1

    async def approve_role(
        self,
        rollout_id: str,
        *,
        role: str,
        subject: str,
        decision: str,
        reason: str = "",
        role_source: str = "oidc",
        claimed_roles: frozenset[str] | None = None,
    ) -> RolloutRecord:
        record = await self._require(rollout_id)
        digest = str(record.snapshot_digest or record.thresholds_json.get("snapshotDigest") or "")
        if role not in REQUIRED_APPROVAL_ROLES:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "invalid approval role", status_code=400)
        # Role must come from auth claims — request body cannot self-assign.
        if claimed_roles is None or role not in claimed_roles:
            raise SaltControlError(ErrorCode.FORBIDDEN, "approval role not granted to subject", status_code=403)
        existing = await self.repos.rollout_approvals.list_for_rollout(rollout_id)
        if any(a.subject == subject and a.revoked_at is None for a in existing):
            raise SaltControlError(ErrorCode.CONFLICT, "subject already approved", status_code=409)
        if decision != "approve":
            record.state = "aborted"
            await self.repos.rollouts.update(record)
            await self.repos.rollout_approvals.add(
                RolloutApprovalRecord(
                    rollout_id=rollout_id,
                    role=role,
                    subject=subject,
                    decision=decision,
                    snapshot_digest=digest,
                    reason=reason,
                    role_source=role_source,
                    stage="deploy",
                )
            )
            return record
        await self.repos.rollout_approvals.add(
            RolloutApprovalRecord(
                rollout_id=rollout_id,
                role=role,
                subject=subject,
                decision="approve",
                snapshot_digest=digest,
                reason=reason,
                role_source=role_source,
                stage="deploy",
            )
        )
        existing = await self.repos.rollout_approvals.list_for_rollout(rollout_id)
        roles = {
            a.role
            for a in existing
            if a.decision == "approve" and a.snapshot_digest == digest and a.revoked_at is None and a.stage == "deploy"
        }
        subjects = {
            a.subject
            for a in existing
            if a.decision == "approve" and a.snapshot_digest == digest and a.revoked_at is None and a.stage == "deploy"
        }
        if len(roles) == 3 and len(subjects) == 3:
            record.state = "approved"
            await self.repos.rollouts.update(record)
        return record

    async def start_batch(self, rollout_id: str, *, actor_id: str) -> list[str]:
        record = await self._require(rollout_id)
        if record.state not in {"approved", "batch_running", "running"}:
            raise SaltControlError(ErrorCode.CONFLICT, "rollout not approved/running", status_code=409)
        batch_index = int(record.thresholds_json.get("currentBatch", record.batch_index or 0))
        if batch_index >= len(RING0_BATCHES):
            raise SaltControlError(ErrorCode.CONFLICT, "all batches completed", status_code=409)
        if record.thresholds_json.get("batchStarted") and record.state in {"batch_running", "running"}:
            raise SaltControlError(ErrorCode.CONFLICT, "current batch already started", status_code=409)
        _, size = RING0_BATCHES[batch_index]
        snapshot = list(record.snapshot_json or record.thresholds_json.get("snapshot") or [])
        offset = sum(s for _, s in RING0_BATCHES[:batch_index])
        batch_targets = snapshot[offset : offset + size]
        job_ids: list[str] = []
        for t in batch_targets:
            invocation = build_invocation("handover")
            job = await self.jobs.create(
                JobCreateRequest(
                    endpoint_id=t["endpoint_id"],
                    minion_id=t["minion_id"],
                    operation="handover",
                    idempotency_key=f"{rollout_id}:{t['endpoint_id']}:batch{batch_index}:handover:1",
                    requested_by=actor_id,
                    release_id=t.get("release_id"),
                    config_revision=t.get("config_revision"),
                    correlation_id=rollout_id,
                )
            )
            job_ids.append(job.job_id)
            await self.repos.rollout_target_jobs.upsert(
                RolloutTargetJobRecord(
                    rollout_id=rollout_id,
                    endpoint_id=t["endpoint_id"],
                    batch_index=batch_index,
                    job_id=job.job_id,
                    state="dispatched",
                    operation="handover",
                    attempt=1,
                    idempotency_key=f"{rollout_id}:{t['endpoint_id']}:batch{batch_index}:handover:1",
                    expected_function=invocation.function,
                )
            )
            targets = await self.repos.rollouts.list_targets(rollout_id)
            for target in targets:
                if target.endpoint_id == t["endpoint_id"]:
                    target.state = "dispatching"
                    target.source_job_id = job.job_id
                    target.batch_index = batch_index
                    target.reason_code = "batch_started"
                    target.state_changed_at = datetime.now(UTC)
                    await self.repos.rollouts.update_target(target)
        now = datetime.now(UTC)
        hours = float(record.thresholds_json.get("observationHoursPerBatch", 24))
        record.state = "batch_running"
        record.batch_index = batch_index
        record.thresholds_json["currentBatch"] = batch_index
        record.thresholds_json["batchStarted"] = True
        record.thresholds_json["batchStartedAt"] = now.isoformat()
        record.batch_started_at = now
        record.batch_observation_due_at = now + timedelta(hours=hours) if hours > 0 else now
        await self.repos.rollouts.update(record, expected_version=record.state_version)
        return job_ids

    async def advance_batch(
        self,
        rollout_id: str,
        *,
        actor_id: str | None = None,
        expected_version: int | None = None,
        gate_digest_submitted: str | None = None,
    ) -> RolloutRecord:
        record = await self._require(rollout_id)
        if record.state == "paused":
            raise SaltControlError(ErrorCode.CONFLICT, "paused — resume manually first", status_code=409)
        if not record.thresholds_json.get("batchStarted"):
            raise SaltControlError(ErrorCode.CONFLICT, "current batch not started", status_code=409)
        current = int(record.thresholds_json.get("currentBatch", record.batch_index or 0))
        _, size = RING0_BATCHES[current]
        target_jobs = await self.repos.rollout_target_jobs.list_for_rollout(rollout_id, batch_index=current)
        handover_jobs = [j for j in target_jobs if (j.operation or "handover") == "handover"]
        if len(handover_jobs) < size:
            raise SaltControlError(ErrorCode.CONFLICT, "batch jobs incomplete", status_code=409)
        for tj in handover_jobs:
            if not tj.job_id:
                raise SaltControlError(ErrorCode.CONFLICT, "batch job missing", status_code=409)
            job = await self.repos.control_jobs.get(tj.job_id)
            if job is None or job.status != "succeeded":
                raise SaltControlError(ErrorCode.CONFLICT, "batch jobs not succeeded", status_code=409)

        targets = await self.repos.rollouts.list_targets(rollout_id)
        snapshot = list(record.snapshot_json or record.thresholds_json.get("snapshot") or [])
        offset = sum(s for _, s in RING0_BATCHES[:current])
        batch_endpoint_ids = {t["endpoint_id"] for t in snapshot[offset : offset + size]}
        for target in targets:
            if target.endpoint_id not in batch_endpoint_ids:
                continue
            # Until verifier writes observing_passed, require job success + explicit pass or lab override.
            if target.state not in {"observing_passed", "completed", "succeeded"}:
                # Auto-mark observing_passed only when observation window is zero (lab) AND jobs succeeded.
                hours = float(record.thresholds_json.get("observationHoursPerBatch", 24))
                if hours > 0:
                    raise SaltControlError(ErrorCode.CONFLICT, "targets not observing_passed", status_code=409)

        started_at = record.batch_started_at
        if started_at is None and record.thresholds_json.get("batchStartedAt"):
            try:
                started_at = datetime.fromisoformat(
                    str(record.thresholds_json["batchStartedAt"]).replace("Z", "+00:00")
                )
            except ValueError:
                started_at = None
        hours = float(record.thresholds_json.get("observationHoursPerBatch", 24))
        if hours > 0:
            if started_at is None or datetime.now(UTC) - started_at < timedelta(hours=hours):
                raise SaltControlError(ErrorCode.CONFLICT, "batch observation window not complete", status_code=409)

        open_incidents = await self.repos.control_plane_incidents.list_open(rollout_id=rollout_id)
        if any(i.severity in {"P0", "P1"} for i in open_incidents):
            record.state = "paused"
            record.thresholds_json["pausedFrom"] = "batch_observing"
            await self.repos.rollouts.update(record, expected_version=expected_version)
            raise SaltControlError(ErrorCode.CONFLICT, "open P0/P1 incidents", status_code=409)

        evaluation = await evaluate_rollout(self.repos, rollout_id)
        if not evaluation.get("ok"):
            previous = record.state
            record.state = "paused"
            record.thresholds_json["pausedFrom"] = previous
            await self.repos.rollouts.update(record, expected_version=expected_version)
            raise SaltControlError(ErrorCode.CONFLICT, "gate evaluation failed", status_code=409)
        if gate_digest_submitted and gate_digest_submitted != evaluation.get("digest"):
            raise SaltControlError(ErrorCode.CONFLICT, "stale gate digest", status_code=409)
        record.thresholds_json["lastGateDigest"] = evaluation.get("digest")

        next_batch = current + 1
        record.batch_index = next_batch
        record.thresholds_json["currentBatch"] = next_batch
        record.thresholds_json["batchStarted"] = False
        record.thresholds_json.pop("batchStartedAt", None)
        if next_batch >= len(RING0_BATCHES):
            days = float(record.thresholds_json.get("observationDaysFinal", 7))
            now = datetime.now(UTC)
            record.state = "final_observing"
            record.final_observation_started_at = now
            record.final_observation_due_at = now + timedelta(days=days) if days > 0 else now
            record.thresholds_json["observingUntil"] = f"{days}d"
        else:
            record.state = "batch_observing"
        await self.repos.rollouts.update(record, expected_version=expected_version)
        return record

    async def complete_signoff(
        self,
        rollout_id: str,
        *,
        actor_id: str,
        roles_ready: bool,
    ) -> RolloutRecord:
        record = await self._require(rollout_id)
        if record.state not in {"final_observing", "awaiting_signoff"}:
            raise SaltControlError(ErrorCode.CONFLICT, "rollout not in final observation/signoff", status_code=409)
        days = float(record.thresholds_json.get("observationDaysFinal", 7))
        started = record.final_observation_started_at
        if days > 0:
            if started is None or datetime.now(UTC) - started < timedelta(days=days):
                raise SaltControlError(ErrorCode.CONFLICT, "final 7-day observation incomplete", status_code=409)
        if not roles_ready:
            record.state = "awaiting_signoff"
            await self.repos.rollouts.update(record, expected_version=record.state_version)
            raise SaltControlError(ErrorCode.CONFLICT, "final signoff roles incomplete", status_code=409)
        record.state = "completed"
        record.completed_at = datetime.now(UTC)
        await self.repos.rollouts.update(record, expected_version=record.state_version)
        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="operator",
                actor_id=actor_id,
                action="ring0.completed",
                target_type="rollout",
                target_id=rollout_id,
                request_id=None,
                metadata_redacted=safe_log_fields(roles_ready=roles_ready),
                occurred_at=datetime.now(UTC),
            )
        )
        return record

    async def rollback_scope(
        self,
        rollout_id: str,
        *,
        scope: str,
        endpoint_id: str | None,
        actor_id: str,
    ) -> list[str]:
        record = await self._require(rollout_id)
        snapshot = list(record.snapshot_json or record.thresholds_json.get("snapshot") or [])
        if scope == "target":
            if not endpoint_id:
                raise SaltControlError(ErrorCode.VALIDATION_ERROR, "endpoint_id required", status_code=400)
            targets = [t for t in snapshot if t["endpoint_id"] == endpoint_id]
        elif scope == "batch":
            batch_index = int(record.thresholds_json.get("currentBatch", record.batch_index or 0))
            _, size = RING0_BATCHES[min(batch_index, len(RING0_BATCHES) - 1)]
            offset = sum(s for _, s in RING0_BATCHES[:batch_index])
            targets = snapshot[offset : offset + size]
        else:
            targets = snapshot
        job_ids: list[str] = []
        for t in targets:
            job = await self.jobs.create(
                JobCreateRequest(
                    endpoint_id=t["endpoint_id"],
                    minion_id=t["minion_id"],
                    operation="rollback",
                    idempotency_key=f"{rollout_id}:{t['endpoint_id']}:rollback:{scope}:{secrets.token_urlsafe(4)}",
                    requested_by=actor_id,
                    correlation_id=rollout_id,
                )
            )
            job_ids.append(job.job_id)
        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="operator",
                actor_id=actor_id,
                action=f"ring0.{scope}_rollback",
                target_type="rollout",
                target_id=rollout_id,
                request_id=None,
                metadata_redacted=safe_log_fields(endpoint_id=endpoint_id, jobs=len(job_ids)),
                occurred_at=datetime.now(UTC),
            )
        )
        return job_ids

    async def apply_job_result(self, job_id: str) -> None:
        job = await self.repos.control_jobs.get(job_id)
        if job is None or not job.correlation_id:
            return
        record = await self.repos.rollouts.get(job.correlation_id)
        if record is None or not record.thresholds_json.get("ring0Aggregate"):
            return
        hours = float(record.thresholds_json.get("observationHoursPerBatch", 24))
        now = datetime.now(UTC)
        for target in await self.repos.rollouts.list_targets(record.id):
            if target.endpoint_id != job.endpoint_id:
                continue
            target.source_job_id = job.id
            target.observed_at = now
            target.state_changed_at = now
            if job.status == "succeeded" and job.operation in {"handover", "remigrate", "health"}:
                target.state = "observing_passed" if hours <= 0 else "observing"
                target.reason_code = "job_succeeded"
                if hours > 0:
                    target.observing_started_at = now
                    target.observing_due_at = now + timedelta(hours=hours)
            elif job.status in {"failed", "expired"}:
                target.state = "failed"
                target.reason_code = job.error_code or "job_failed"
                record.state = "paused"
                record.thresholds_json["pausedFrom"] = "batch_running"
                await self.repos.rollouts.update(record)
            await self.repos.rollouts.update_target(target)

    async def pause(self, rollout_id: str, *, actor_id: str, reason: str) -> RolloutRecord:
        record = await self._require(rollout_id)
        record.thresholds_json["pausedFrom"] = record.state
        record.state = "paused"
        await self.repos.rollouts.update(record, expected_version=record.state_version)
        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="operator",
                actor_id=actor_id,
                action="ring0.paused",
                target_type="rollout",
                target_id=rollout_id,
                request_id=None,
                metadata_redacted=safe_log_fields(reason=reason),
                occurred_at=datetime.now(UTC),
            )
        )
        return record

    async def resume(
        self, rollout_id: str, *, actor_id: str, reason: str, gate_digest_submitted: str | None
    ) -> RolloutRecord:
        record = await self._require(rollout_id)
        if record.state != "paused":
            raise SaltControlError(ErrorCode.CONFLICT, "rollout is not paused", status_code=409)
        evaluation = await evaluate_rollout(self.repos, rollout_id)
        if not evaluation.get("ok"):
            raise SaltControlError(ErrorCode.CONFLICT, "gates still failing", status_code=409)
        if gate_digest_submitted and gate_digest_submitted != evaluation.get("digest"):
            raise SaltControlError(ErrorCode.CONFLICT, "stale gate digest", status_code=409)
        previous = str(record.thresholds_json.get("pausedFrom") or "batch_observing")
        record.state = previous if previous != "paused" else "batch_observing"
        record.thresholds_json["lastGateDigest"] = evaluation.get("digest")
        await self.repos.rollouts.update(record, expected_version=record.state_version)
        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="operator",
                actor_id=actor_id,
                action="ring0.resumed",
                target_type="rollout",
                target_id=rollout_id,
                request_id=None,
                metadata_redacted=safe_log_fields(reason=reason, digest=evaluation.get("digest")),
                occurred_at=datetime.now(UTC),
            )
        )
        return record

    async def _require(self, rollout_id: str) -> RolloutRecord:
        record = await self.repos.rollouts.get(rollout_id)
        if record is None:
            raise SaltControlError(ErrorCode.NOT_FOUND, "rollout not found", status_code=404)
        return record
