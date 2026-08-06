"""Task event/result delivery helpers (PRD FR-30–FR-32)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import DeliveryOutboxStatus
from db.models.endpoint_sync import DeliveryOutbox, TaskDeliveryRecord
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.experience_redactor import redact_payload


class TaskDeliveryService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center

    async def enqueue_event(self, assignment_id: str, event_type: str, payload: dict[str, Any]) -> str:
        event_id = str(uuid4())
        redacted = redact_payload(payload)
        await self._repo.add_delivery_record(
            TaskDeliveryRecord(
                assignment_id=assignment_id,
                event_id=event_id,
                event_type=event_type,
                payload_json=json.dumps(redacted, ensure_ascii=False),
                status="pending",
            )
        )
        await self._repo.add_outbox(
            DeliveryOutbox(
                event_id=event_id,
                channel="task_events",
                aggregate_type="remote_task",
                aggregate_id=assignment_id,
                event_type=event_type,
                payload_json=json.dumps({"eventId": event_id, **redacted}, ensure_ascii=False),
                status=DeliveryOutboxStatus.PENDING.value,
                attempt_count=0,
            )
        )
        return event_id

    async def record_event(self, assignment_id: str, event_type: str, payload: dict[str, Any]) -> str:
        return await self.enqueue_event(assignment_id, event_type, payload)

    async def list_events(self, assignment_id: str) -> list[dict[str, Any]]:
        rows = await self._repo.list_delivery_records(assignment_id)
        return [
            {
                "eventId": r.event_id,
                "eventType": r.event_type,
                "payload": json.loads(r.payload_json),
                "status": r.status,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    async def build_result_manifest(
        self,
        *,
        assignment_id: str,
        status: str,
        summary: str,
        artifacts: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return redact_payload(
            {
                "assignmentId": assignment_id,
                "status": status,
                "summary": summary,
                "artifacts": artifacts or [],
                "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            }
        )
