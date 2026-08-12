from __future__ import annotations

import secrets
from datetime import UTC, datetime

from core.errors import ErrorCode, SaltControlError
from core.idempotency import IdempotencyStore
from core.logging import safe_log_fields
from db.repositories.interfaces import AuditEventRecord, RepositoryBundle, RolloutRecord
from schemas.rollout import RolloutActionRequest, RolloutCreateRequest, RolloutResponse


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


class RolloutService:
    def __init__(self, repos: RepositoryBundle, idempotency: IdempotencyStore) -> None:
        self.repos = repos
        self.idempotency = idempotency

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
        )

    async def create(self, body: RolloutCreateRequest, actor_id: str) -> RolloutResponse:
        cached = self.idempotency.get(f"rollout:{body.request_id}")
        if cached is not None:
            return cached

        record = RolloutRecord(
            id=_new_id("ro"),
            component=body.component,
            version=body.version,
            ring=body.ring,
            state="created",
            thresholds_json=dict(body.thresholds),
            created_by=actor_id,
            created_at=datetime.now(UTC),
        )
        await self.repos.rollouts.create(record)
        await self._audit(actor_id, "rollout.created", record.id, body.request_id, {"ring": body.ring})
        response = self._to_response(record)
        self.idempotency.put(f"rollout:{body.request_id}", response)
        return response

    async def get(self, rollout_id: str) -> RolloutResponse:
        record = await self.repos.rollouts.get(rollout_id)
        if record is None:
            raise SaltControlError(ErrorCode.NOT_FOUND, "rollout not found", status_code=404)
        return self._to_response(record)

    async def advance(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
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

        record.state = "advancing"
        record.observation_started_at = datetime.now(UTC)
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.advanced", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def pause(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
        record.state = "paused"
        await self.repos.rollouts.update(record)
        await self._audit(actor_id, "rollout.paused", record.id, body.request_id, {"reason": body.reason})
        return self._to_response(record)

    async def rollback(self, rollout_id: str, body: RolloutActionRequest, actor_id: str) -> RolloutResponse:
        record = await self._require(rollout_id)
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
