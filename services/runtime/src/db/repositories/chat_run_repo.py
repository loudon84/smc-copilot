"""Persistence helpers for Chat Runtime v2."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.chat_runtime import ChatEvent, ChatInteraction, ChatQueueEntry, ChatRun, ChatTurn


class ChatRunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_run(self, run_id: str) -> ChatRun | None:
        result = await self._s.execute(select(ChatRun).where(ChatRun.id == run_id))
        return result.scalar_one_or_none()

    async def get_run_by_client_id(self, client_run_id: str) -> ChatRun | None:
        result = await self._s.execute(select(ChatRun).where(ChatRun.client_run_id == client_run_id))
        return result.scalar_one_or_none()

    async def get_run_by_ref(self, run_ref: str) -> ChatRun | None:
        """Resolve by primary id or client_run_id (Desktop often passes clientRunId)."""
        result = await self._s.execute(
            select(ChatRun).where(or_(ChatRun.id == run_ref, ChatRun.client_run_id == run_ref))
        )
        return result.scalar_one_or_none()

    async def add_run(self, row: ChatRun) -> ChatRun:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_turn(self, turn_id: str) -> ChatTurn | None:
        result = await self._s.execute(select(ChatTurn).where(ChatTurn.id == turn_id))
        return result.scalar_one_or_none()

    async def get_turn_by_client(self, run_id: str, client_turn_id: str) -> ChatTurn | None:
        result = await self._s.execute(
            select(ChatTurn).where(ChatTurn.run_id == run_id, ChatTurn.client_turn_id == client_turn_id)
        )
        return result.scalar_one_or_none()

    async def list_turns(self, run_id: str) -> list[ChatTurn]:
        result = await self._s.execute(select(ChatTurn).where(ChatTurn.run_id == run_id).order_by(ChatTurn.created_at))
        return list(result.scalars().all())

    async def add_turn(self, row: ChatTurn) -> ChatTurn:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def next_event_sequence(self, run_id: str) -> int:
        result = await self._s.execute(select(func.max(ChatEvent.sequence)).where(ChatEvent.run_id == run_id))
        current = result.scalar_one_or_none()
        return int(current or 0) + 1

    async def add_event(self, row: ChatEvent) -> ChatEvent:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_events(
        self,
        run_id: str,
        *,
        after_sequence: int | None = None,
        limit: int = 500,
    ) -> list[ChatEvent]:
        stmt = select(ChatEvent).where(ChatEvent.run_id == run_id).order_by(ChatEvent.sequence)
        if after_sequence is not None:
            stmt = stmt.where(ChatEvent.sequence > after_sequence)
        stmt = stmt.limit(limit)
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def get_event(self, event_id: str) -> ChatEvent | None:
        result = await self._s.execute(select(ChatEvent).where(ChatEvent.id == event_id))
        return result.scalar_one_or_none()

    async def list_queue(self, run_id: str) -> list[ChatQueueEntry]:
        result = await self._s.execute(
            select(ChatQueueEntry).where(ChatQueueEntry.run_id == run_id).order_by(ChatQueueEntry.created_at)
        )
        return list(result.scalars().all())

    async def get_queue_entry(self, run_id: str, queue_id: str) -> ChatQueueEntry | None:
        result = await self._s.execute(
            select(ChatQueueEntry).where(ChatQueueEntry.id == queue_id, ChatQueueEntry.run_id == run_id)
        )
        return result.scalar_one_or_none()

    async def add_queue_entry(self, row: ChatQueueEntry) -> ChatQueueEntry:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def delete_queue_entry(self, row: ChatQueueEntry) -> None:
        await self._s.delete(row)
        await self._s.flush()

    async def get_interaction(self, run_id: str, request_id: str) -> ChatInteraction | None:
        result = await self._s.execute(
            select(ChatInteraction).where(ChatInteraction.run_id == run_id, ChatInteraction.request_id == request_id)
        )
        return result.scalar_one_or_none()

    async def add_interaction(self, row: ChatInteraction) -> ChatInteraction:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_active_turns(self, run_id: str) -> list[ChatTurn]:
        active = (
            "queued",
            "pending",
            "running",
            "waiting_interaction",
            "waiting_clarify",
            "waiting_approval",
        )
        result = await self._s.execute(select(ChatTurn).where(ChatTurn.run_id == run_id, ChatTurn.status.in_(active)))
        return list(result.scalars().all())
