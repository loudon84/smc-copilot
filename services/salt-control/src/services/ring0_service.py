"""Ring 0 orchestrator — 5-target snapshot, 1→2→2 batches, triple approval (v2.4)."""

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
from schemas.job import JobCreateRequest
from services.job_service import JobService

RING0_BATCHES = ((0, 1), (1, 2), (2, 2))  # (batch_index, size)
REQUIRED_APPROVAL_ROLES = ("release_owner", "platform_owner", "security_owner")
BATCH_OBSERVATION = timedelta(hours=24)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


def snapshot_digest(targets: list[dict[str, Any]]) -> str:
    raw = json.dumps(targets, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class Ring0Orchestrator:
    def __init__(self, repos: RepositoryBundle, job_service: JobService) -> None:
        self.repos = repos
        self.jobs = job_service

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
        if len(targets) != 5:
            raise SaltControlError(
                ErrorCode.VALIDATION_ERROR,
                "Ring 0 requires exactly 5 IT/dev endpoints",
                status_code=400,
            )
        normalized = []
        for t in targets:
            endpoint_id = t.get("endpoint_id") or t.get("endpointId")
            minion_id = t.get("minion_id") or t.get("minionId") or endpoint_id
            if not endpoint_id or not str(endpoint_id).startswith("ep_"):
                raise SaltControlError(ErrorCode.VALIDATION_ERROR, "invalid endpoint_id", status_code=400)
            normalized.append(
                {
                    "endpoint_id": endpoint_id,
                    "minion_id": minion_id,
                    "binding_revision": t.get("binding_revision") or t.get("bindingRevision") or "",
                    "release_id": release_id,
                    "config_revision": config_revision,
                }
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
            },
            created_by=actor_id,
            target_count=5,
            snapshot_digest=digest,
            snapshot_json=normalized,
            batch_index=0,
            created_at=datetime.now(UTC),
        )
        await self.repos.rollouts.create(record)
        for t in normalized:
            await self.repos.rollouts.add_target(
                RolloutTargetRecord(rollout_id=record.id, endpoint_id=t["endpoint_id"], state="pending")
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

    async def approve_role(
        self,
        rollout_id: str,
        *,
        role: str,
        subject: str,
        decision: str,
        reason: str = "",
    ) -> RolloutRecord:
        record = await self._require(rollout_id)
        digest = str(record.snapshot_digest or record.thresholds_json.get("snapshotDigest") or "")
        if role not in REQUIRED_APPROVAL_ROLES:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "invalid approval role", status_code=400)
        existing = await self.repos.rollout_approvals.list_for_rollout(rollout_id)
        if any(a.subject == subject for a in existing):
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
            )
        )
        existing = await self.repos.rollout_approvals.list_for_rollout(rollout_id)
        roles = {a.role for a in existing if a.decision == "approve" and a.snapshot_digest == digest}
        subjects = {a.subject for a in existing if a.decision == "approve" and a.snapshot_digest == digest}
        if len(roles) == 3 and len(subjects) == 3:
            record.state = "approved"
            await self.repos.rollouts.update(record)
        return record

    async def start_batch(self, rollout_id: str, *, actor_id: str) -> list[str]:
        record = await self._require(rollout_id)
        if record.state not in {"approved", "running"}:
            raise SaltControlError(ErrorCode.CONFLICT, "rollout not approved/running", status_code=409)
        batch_index = int(record.thresholds_json.get("currentBatch", record.batch_index or 0))
        if batch_index >= len(RING0_BATCHES):
            raise SaltControlError(ErrorCode.CONFLICT, "all batches completed", status_code=409)
        started_at = record.thresholds_json.get("batchStartedAt")
        if started_at and batch_index > 0:
            try:
                started = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
                if datetime.now(UTC) - started < BATCH_OBSERVATION:
                    raise SaltControlError(
                        ErrorCode.CONFLICT,
                        "batch observation window not complete (24h)",
                        status_code=409,
                    )
            except ValueError:
                pass
        _, size = RING0_BATCHES[batch_index]
        snapshot = list(record.snapshot_json or record.thresholds_json.get("snapshot") or [])
        offset = sum(s for _, s in RING0_BATCHES[:batch_index])
        batch_targets = snapshot[offset : offset + size]
        job_ids: list[str] = []
        for t in batch_targets:
            job = await self.jobs.create(
                JobCreateRequest(
                    endpoint_id=t["endpoint_id"],
                    minion_id=t["minion_id"],
                    operation="handover",
                    idempotency_key=f"{rollout_id}:{t['endpoint_id']}:batch{batch_index}",
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
                )
            )
        record.state = "running"
        record.batch_index = batch_index
        record.thresholds_json["currentBatch"] = batch_index
        record.thresholds_json["batchStartedAt"] = datetime.now(UTC).isoformat()
        await self.repos.rollouts.update(record)
        return job_ids

    async def advance_batch(self, rollout_id: str) -> RolloutRecord:
        record = await self._require(rollout_id)
        if record.state == "paused":
            raise SaltControlError(ErrorCode.CONFLICT, "paused — resume manually first", status_code=409)
        current = int(record.thresholds_json.get("currentBatch", record.batch_index or 0))
        started_at = record.thresholds_json.get("batchStartedAt")
        if started_at:
            try:
                started = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
                # Lab/test may set observationHoursPerBatch=0 to skip the gate.
                hours = float(record.thresholds_json.get("observationHoursPerBatch", 24))
                if hours > 0 and datetime.now(UTC) - started < timedelta(hours=hours):
                    raise SaltControlError(
                        ErrorCode.CONFLICT,
                        "batch observation window not complete",
                        status_code=409,
                    )
            except ValueError:
                pass
        record.batch_index = current + 1
        record.thresholds_json["currentBatch"] = current + 1
        if record.thresholds_json["currentBatch"] >= len(RING0_BATCHES):
            record.state = "completed"
            record.thresholds_json["observingUntil"] = "7d"
        await self.repos.rollouts.update(record)
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

    async def _require(self, rollout_id: str) -> RolloutRecord:
        record = await self.repos.rollouts.get(rollout_id)
        if record is None:
            raise SaltControlError(ErrorCode.NOT_FOUND, "rollout not found", status_code=404)
        return record
