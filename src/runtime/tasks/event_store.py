"""Persist task events: commit → broadcast → outbox (FR-403, FR-405)."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from core.enums import DeliveryOutboxStatus
from core.config import Settings
from db.models.endpoint_sync import DeliveryOutbox
from db.models.work_tasks import TaskArtifact, TaskRunEvent
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.experience_redactor import redact_payload

INLINE_PAYLOAD_MAX_BYTES = 64 * 1024
BroadcastHook = Callable[[TaskRunEvent], None]


# @lat: [[endpoint-sync#Work Task Execution]]
class TaskEventStore:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        *,
        broadcast_hook: BroadcastHook | None = None,
    ) -> None:
        self._settings = settings
        self._session = session
        self._tasks = WorkTaskRepository(session)
        self._sync = EndpointSyncRepository(session)
        self._broadcast = broadcast_hook

    async def append(
        self,
        *,
        task_id: str,
        run_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        assignment_id: str | None = None,
    ) -> TaskRunEvent:
        sequence = await self._tasks.next_event_sequence(run_id)
        redacted = redact_payload(payload or {})
        payload_json = json.dumps(redacted, ensure_ascii=False)
        artifact_id: str | None = None
        if len(payload_json.encode("utf-8")) > INLINE_PAYLOAD_MAX_BYTES:
            artifact_id = str(uuid4())
            await self._tasks.add_artifact(
                TaskArtifact(
                    id=artifact_id,
                    task_id=task_id,
                    run_id=run_id,
                    artifact_type="event_payload",
                    local_path=None,
                    content_type="application/json",
                    size_bytes=len(payload_json.encode("utf-8")),
                    upload_status="local_only",
                )
            )
            payload_json = json.dumps({"truncated": True, "artifactId": artifact_id}, ensure_ascii=False)

        row = TaskRunEvent(
            task_id=task_id,
            run_id=run_id,
            sequence=sequence,
            event_type=event_type,
            payload_json=payload_json,
            payload_artifact_id=artifact_id,
        )
        await self._tasks.add_event(row)
        # Caller commits/flushes; avoid per-event flush to reduce ORM expire churn.

        if self._broadcast:
            self._broadcast(row)

        if assignment_id:
            event_id = str(uuid4())
            await self._sync.add_outbox(
                DeliveryOutbox(
                    event_id=event_id,
                    channel="task_events",
                    aggregate_type="work_task",
                    aggregate_id=assignment_id,
                    event_type=event_type,
                    payload_json=json.dumps(
                        {
                            "eventId": event_id,
                            "taskId": task_id,
                            "runId": run_id,
                            "sequence": sequence,
                            **redacted,
                        },
                        ensure_ascii=False,
                    ),
                    sequence=sequence,
                    status=DeliveryOutboxStatus.PENDING.value,
                    attempt_count=0,
                )
            )

        # PRD v1.6 FR-1001: auto evidence from terminal / meaningful events
        try:
            from services.experience_auto_capture import ExperienceAutoCapture

            await ExperienceAutoCapture(self._settings, self._session).on_event(
                event_type=event_type,
                task_id=task_id,
                run_id=run_id,
                sequence=sequence,
                payload=redacted,
            )
        except Exception:
            # Evidence capture must not break task event persistence
            pass

        return row
