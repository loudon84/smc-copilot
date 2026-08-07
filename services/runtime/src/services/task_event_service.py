"""Task event listing and SSE replay (FR-403, FR-406)."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.errors import NotFoundError
from db.models.work_tasks import TaskRunEvent
from db.repositories.work_task_repo import WorkTaskRepository
from services.sse_helpers import format_ping, format_sse

POLL_INTERVAL_SEC = 0.5
PING_INTERVAL_SEC = 10.0


class TaskEventService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = WorkTaskRepository(session)

    def _event_to_dict(self, event: TaskRunEvent) -> dict[str, Any]:
        payload = None
        if event.payload_json:
            try:
                payload = json.loads(event.payload_json)
            except json.JSONDecodeError:
                payload = {"raw": event.payload_json}
        return {
            "id": event.id,
            "taskId": event.task_id,
            "runId": event.run_id,
            "sequence": event.sequence,
            "eventType": event.event_type,
            "schemaVersion": event.schema_version,
            "payload": payload,
            "payloadArtifactId": event.payload_artifact_id,
            "visibility": event.visibility,
            "redactionStatus": event.redaction_status,
            "createdAt": event.created_at.isoformat() if event.created_at else None,
        }

    async def list_events(self, task_id: str, *, after_sequence: int | None = None) -> list[dict[str, Any]]:
        if await self._repo.get_task(task_id) is None:
            raise NotFoundError("work task not found")
        events = await self._repo.list_events(task_id, after_sequence=after_sequence)
        return [self._event_to_dict(e) for e in events]

    async def iter_sse(
        self,
        request: Request,
        session_maker: async_sessionmaker[AsyncSession],
        task_id: str,
        *,
        last_event_id: str | None,
    ) -> AsyncIterator[str]:
        after_sequence: int | None = None
        if last_event_id:
            try:
                after_sequence = int(last_event_id.strip())
            except ValueError:
                after_sequence = None

        ping_elapsed = 0.0
        terminal_grace: float | None = None
        yield format_ping(event_id="ping-start")

        try:
            while True:
                if await request.is_disconnected():
                    break

                session = session_maker()
                try:
                    repo = WorkTaskRepository(session)
                    task = await repo.get_task(task_id)
                    if task is None:
                        yield format_sse(
                            event_id="error",
                            event_name="error",
                            data={"code": "not_found", "message": "work task not found"},
                        )
                        break

                    events = await repo.list_events(task_id, after_sequence=after_sequence)
                    for event in events:
                        data = self._event_to_dict(event)
                        yield format_sse(
                            event_id=str(event.sequence),
                            event_name=event.event_type,
                            data=data,
                        )
                        after_sequence = event.sequence

                    terminal = {
                        "completed",
                        "failed",
                        "cancelled",
                        "expired",
                        "orphaned",
                        "migration_pending_review",
                    }
                    if task.status in terminal:
                        if terminal_grace is None:
                            terminal_grace = time.monotonic()
                        elif time.monotonic() - terminal_grace >= 30.0:
                            break
                    else:
                        terminal_grace = None

                    ping_elapsed += POLL_INTERVAL_SEC
                    if ping_elapsed >= PING_INTERVAL_SEC:
                        yield format_ping()
                        ping_elapsed = 0.0
                finally:
                    await session.close()

                await asyncio.sleep(POLL_INTERVAL_SEC)
        except asyncio.CancelledError:
            raise
