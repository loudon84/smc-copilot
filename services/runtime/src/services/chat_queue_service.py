"""Chat queue entries for durable turn staging (PRD v1.1 §8.2)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.errors import NotFoundError
from db.models.chat_runtime import ChatQueueEntry
from db.repositories.chat_run_repo import ChatRunRepository
from services.chat_event_service import ChatEventService


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ChatQueueService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = ChatRunRepository(session)
        self._events = ChatEventService(session)

    @staticmethod
    def entry_to_dict(entry: ChatQueueEntry) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if entry.payload_json:
            try:
                parsed = json.loads(entry.payload_json)
                payload = parsed if isinstance(parsed, dict) else {"value": parsed}
            except json.JSONDecodeError:
                payload = {"raw": entry.payload_json}
        return {
            "queueId": entry.id,
            "id": entry.id,
            "runId": entry.run_id,
            "status": entry.status,
            "payload": payload,
            "createdAt": entry.created_at.isoformat() if entry.created_at else None,
            "updatedAt": entry.updated_at.isoformat() if entry.updated_at else None,
        }

    async def _require_run(self, run_ref: str):
        run = await self._repo.get_run_by_ref(run_ref)
        if run is None:
            raise NotFoundError("chat run not found")
        return run

    async def list_queue(self, run_ref: str) -> list[dict[str, Any]]:
        run = await self._require_run(run_ref)
        entries = await self._repo.list_queue(run.id)
        return [self.entry_to_dict(e) for e in entries]

    async def enqueue(self, run_ref: str, *, status: str | None, payload: dict[str, Any]) -> dict[str, Any]:
        run = await self._require_run(run_ref)
        entry = ChatQueueEntry(
            run_id=run.id,
            status=status or "pending",
            payload_json=json.dumps(payload or {}, ensure_ascii=False),
        )
        await self._repo.add_queue_entry(entry)
        await self._events.append(
            run=run,
            event_type="queue.changed",
            payload={"action": "enqueued", "queueId": entry.id, "status": entry.status},
        )
        await self._session.commit()
        return self.entry_to_dict(entry)

    async def patch(
        self,
        run_ref: str,
        queue_id: str,
        *,
        status: str | None,
        payload: dict[str, Any] | None,
    ) -> dict[str, Any]:
        run = await self._require_run(run_ref)
        entry = await self._repo.get_queue_entry(run.id, queue_id)
        if entry is None:
            raise NotFoundError("queue entry not found")
        if status is not None:
            entry.status = status
        if payload is not None:
            entry.payload_json = json.dumps(payload, ensure_ascii=False)
        entry.updated_at = _utcnow()
        await self._session.flush()
        await self._events.append(
            run=run,
            event_type="queue.changed",
            payload={"action": "patched", "queueId": entry.id, "status": entry.status},
        )
        await self._session.commit()
        return self.entry_to_dict(entry)

    async def delete(self, run_ref: str, queue_id: str) -> dict[str, Any]:
        run = await self._require_run(run_ref)
        entry = await self._repo.get_queue_entry(run.id, queue_id)
        if entry is None:
            raise NotFoundError("queue entry not found")
        payload = self.entry_to_dict(entry)
        await self._repo.delete_queue_entry(entry)
        await self._events.append(
            run=run,
            event_type="queue.changed",
            payload={"action": "deleted", "queueId": queue_id},
        )
        await self._session.commit()
        return {"ok": True, **payload}
