from __future__ import annotations

import secrets
from datetime import UTC, datetime

from core.errors import ErrorCode, SaltControlError
from core.logging import safe_log_fields
from db.repositories.interfaces import AuditEventRecord, RepositoryBundle, RolloutRecord
from schemas.rollout import (
    RolloutActionRequest,
    RolloutApprovalRequest,
    RolloutCreateRequest,
    RolloutResponse,
)
from services.idempotency_helper import get_cached_response, request_digest, store_response
from services.job_service import JobService
from services.ring0_service import Ring0Orchestrator

# v2.3.1 rollout states
ROLLOUT_STATES = frozenset(
    {
        "draft",
        "waiting_approval",
        "approved",
        "running",
        "paused",
        "aborting",
        "aborted",
        "completed",
        "failed",
        # legacy aliases kept for existing tests
        "created",
        "advancing",
        "rolled_back",
    }
)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


class RolloutService:
    def __init__(self, repos: RepositoryBundle) -> None:
        self.repos = repos

    def _to_response(self, record: RolloutRecord) -> RolloutResponse:
        return RolloutResponse(
            rollout_id=record.id,
            component=record.component,
            version=record.version,
            ring=record.ring,
            state=record.state,
            target_count=record.target_count,
            completed_count=record.completed_count,
            success_rate=record.success_rate,
            failure_rate=record.failure_rate,
            rollback_rate=record.rollback_rate,
            p0_count=record.p0_count,
            p1_count=record.p1_count,
            thresholds=dict(record.thresholds_json),
            batch_size=int(record.thresholds_json.get("batchSize", 0) or 0),
            approval_required=bool(record.thresholds_json.get("approvalRequired", True)),
        )

    async def create(self, body: RolloutCreateRequest, actor_id: str) -> RolloutResponse:
        digest = request_digest(body)
        cached = await get_cached_response(self.repos, f"rollout:{body.request_id}", digest)
        if cached is not None:
            return RolloutResponse.model_validate(cached)

        thresholds = dict(body.thresholds)
        thresholds.setdefault("approvalRequired", True)
        thresholds.setdefault("batchSize", 1)
        initial = "waiting_approval" if thresholds.get("approvalRequired", True) else "draft"
        record = RolloutRecord(
            id=_new_id("ro"),
            component=body.component,
            version=body.version,
            ring=body.ring,
            state=initial,
            thresholds_json=thresholds,
            created_by=actor_id,
            created_at=datetime.now(UTC),
        )
        await self.repos.rollouts.create(record)
        await self._audit(actor_id, "rollout.created", record.id, body.request_id, {"ring": body.ring})
        response = self._to_response(record)
        await store_response(
            self.repos, f"rollout:{body.request_id}", digest, response.model_dump(mode="json", by_alias=True)
        )
        return response

    async def get(self, rollout_id: str) -> RolloutResponse:
        record = await self.repos.rollouts.get(rollout_id)
        if record is None:
            raise SaltControlError(ErrorCode.NOT_FOUND, "rollout not found", status_code=404)
        return self._to_response(record)

    def _ring0_aggregate(self, record: RolloutRecord) -> bool:
        return bool(record.thresholds_json.get("ring0Aggregate") or record.snapshot_json)

    def _ring0(self) -> Ring0Orchestrator:
        return Ring0Orchestrator(self.repos, JobService(self.repos))

    async def approve(self, rollout_id: str, body: RolloutApprovalRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
        if self._ring0_aggregate(record):
            raise SaltControlError(
                ErrorCode.CONFLICT,
                "Ring 0 approvals must use /salt/v1/ring0/rollouts/{id}:approve",
                status_code=409,
            )
        if body.decision == "reject":
            record.state = "aborted"
            await self.repos.rollouts.update(record)
            await self._audit(actor_id, "rollout.rejected", record.id, body.request_id, {"reason": body.reason})
            return self._to_response(record)
        if record.state not in {"waiting_approval", "draft", "created"}:
            raise SaltControlError(ErrorCode.CONFLICT, "rollout not awaiting approval", status_code=409)
        record.state = "approved"
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.approved", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def advance(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
        if self._ring0_aggregate(record):
            updated = await self._ring0().advance_batch(rollout_id, actor_id=actor_id)
            return self._to_response(updated)
        if record.state not in {"approved", "created", "paused"}:
            raise SaltControlError(ErrorCode.CONFLICT, "rollout cannot advance", status_code=409)
        min_success = float(record.thresholds_json.get("minSuccessRate", 0.95))
        gate_failed = (
            record.p0_count > 0
            or record.p1_count > 0
            or (record.target_count > 0 and record.success_rate < min_success)
        )
        if gate_failed:
            record.state = "paused"
            await self.repos.rollouts.update(record)
            await self._audit(actor_id, "rollout.paused", record.id, body.request_id, {"reason": "gate_failed"})
            raise SaltControlError(ErrorCode.ROLLOUT_GATE_FAILED, "rollout gate failed", status_code=409)

        record.state = "running"
        record.observation_started_at = datetime.now(UTC)
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.advanced", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def pause(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
        if self._ring0_aggregate(record):
            updated = await self._ring0().pause(rollout_id, actor_id=actor_id, reason=body.reason)
            return self._to_response(updated)
        record.state = "paused"
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.paused", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def resume(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        """Manual resume after Master recovery — never auto-resume."""
        record = await self._require(rollout_id)
        if self._ring0_aggregate(record):
            updated = await self._ring0().resume(
                rollout_id, actor_id=actor_id, reason=body.reason, gate_digest_submitted=None
            )
            return self._to_response(updated)
        if record.state != "paused":
            raise SaltControlError(ErrorCode.CONFLICT, "rollout is not paused", status_code=409)
        record.state = "running"
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.resumed", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def abort(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
        record.state = "aborting"
        await self.repos.rollouts.update(record)
        record.state = "aborted"
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.aborted", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def rollback(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
        if self._ring0_aggregate(record):
            await self._ring0().rollback_scope(rollout_id, scope="rollout", endpoint_id=None, actor_id=actor_id)
            record = await self._require(rollout_id)
            return self._to_response(record)
        record.state = "rolled_back"
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.rolled_back", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def _require(self, rollout_id: str) -> RolloutRecord:
        record = await self.repos.rollouts.get(rollout_id)
        if record is None:
            raise SaltControlError(ErrorCode.NOT_FOUND, "rollout not found", status_code=404)
        return record

    async def _audit(self, actor_id: str, action: str, target_id: str, request_id: str, metadata: dict) -> None:
        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="operator",
                actor_id=actor_id,
                action=action,
                target_type="rollout",
                target_id=target_id,
                request_id=request_id,
                metadata_redacted=safe_log_fields(**metadata),
                occurred_at=datetime.now(UTC),
            )
        )
