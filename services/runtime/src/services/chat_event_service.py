"""Durable Chat Event Store + SSE replay (PRD v1.1 §8.4)."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.errors import NotFoundError
from db.models.chat_runtime import ChatEvent, ChatRun
from db.repositories.chat_run_repo import ChatRunRepository
from services.sse_helpers import format_ping, format_sse

POLL_INTERVAL_SEC = 0.5
PING_INTERVAL_SEC = 10.0
TERMINAL_RUN_STATUSES = frozenset({"completed", "failed", "cancelled", "aborted"})


class ChatEventService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = ChatRunRepository(session)

    @staticmethod
    def event_to_dict(event: ChatEvent, *, run: ChatRun | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if event.payload_json:
            try:
                parsed = json.loads(event.payload_json)
                payload = parsed if isinstance(parsed, dict) else {"value": parsed}
            except json.JSONDecodeError:
                payload = {"raw": event.payload_json}
        return {
            "eventId": event.id,
            "id": event.id,
            "sequence": event.sequence,
            "runId": event.run_id,
            "turnId": event.turn_id or "",
            "type": event.event_type,
            "eventType": event.event_type,
            "timestamp": event.created_at.isoformat() if event.created_at else None,
            "createdAt": event.created_at.isoformat() if event.created_at else None,
            "instanceId": run.instance_id if run else None,
            "sessionId": run.session_id if run else None,
            "payload": payload,
        }

    async def append(
        self,
        *,
        run: ChatRun,
        event_type: str,
        payload: dict[str, Any] | None = None,
        turn_id: str | None = None,
    ) -> ChatEvent:
        sequence = await self._repo.next_event_sequence(run.id)
        row = ChatEvent(
            run_id=run.id,
            turn_id=turn_id,
            sequence=sequence,
            event_type=event_type,
            payload_json=json.dumps(payload or {}, ensure_ascii=False),
        )
        await self._repo.add_event(row)
        run.event_cursor = sequence
        await self._session.flush()
        return row

    async def list_events(
        self,
        run_ref: str,
        *,
        after_sequence: int | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        run = await self._repo.get_run_by_ref(run_ref)
        if run is None:
            raise NotFoundError("chat run not found")
        events = await self._repo.list_events(run.id, after_sequence=after_sequence, limit=limit)
        return [self.event_to_dict(e, run=run) for e in events]

    async def resolve_after_sequence(self, run_id: str, last_event_id: str | None) -> int | None:
        if not last_event_id:
            return None
        value = last_event_id.strip()
        if not value:
            return None
        try:
            return int(value)
        except ValueError:
            pass
        event = await self._repo.get_event(value)
        if event is not None and event.run_id == run_id:
            return event.sequence
        return None

    async def iter_sse(
        self,
        request: Request,
        session_maker: async_sessionmaker[AsyncSession],
        run_ref: str,
        *,
        last_event_id: str | None,
    ) -> AsyncIterator[str]:
        bootstrap = session_maker()
        try:
            repo = ChatRunRepository(bootstrap)
            run = await repo.get_run_by_ref(run_ref)
            if run is None:
                yield format_sse(
                    event_id="error",
                    event_name="error",
                    data={"code": "not_found", "message": "chat run not found"},
                )
                return
            run_id = run.id
            after_sequence = await ChatEventService(bootstrap).resolve_after_sequence(run_id, last_event_id)
        finally:
            await bootstrap.close()

        ping_elapsed = 0.0
        terminal_grace: float | None = None
        yield format_ping(event_id="ping-start")

        try:
            while True:
                if await request.is_disconnected():
                    break

                session = session_maker()
                try:
                    repo = ChatRunRepository(session)
                    run = await repo.get_run(run_id)
                    if run is None:
                        yield format_sse(
                            event_id="error",
                            event_name="error",
                            data={"code": "not_found", "message": "chat run not found"},
                        )
                        break

                    events = await repo.list_events(run_id, after_sequence=after_sequence)
                    for event in events:
                        data = self.event_to_dict(event, run=run)
                        yield format_sse(
                            event_id=str(event.sequence),
                            event_name=event.event_type,
                            data=data,
                        )
                        after_sequence = event.sequence

                    if run.status in TERMINAL_RUN_STATUSES:
                        if terminal_grace is None:
                            terminal_grace = time.monotonic()
                        elif time.monotonic() - terminal_grace >= 5.0:
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
