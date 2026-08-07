"""Per-run chat turn scheduler — one active turn at a time (PRD v1.2 §7 / §8)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.repositories.chat_run_repo import ChatRunRepository
from services.chat_turn_worker import ChatTurnWorker

logger = logging.getLogger(__name__)

_ACTIVE_STATUSES = frozenset({"running", "waiting_clarify", "waiting_approval", "waiting_interaction"})


class ChatTurnScheduler:
    """Schedules ChatTurns for a run: queued → worker; only one active turn per run."""

    _instance: ChatTurnScheduler | None = None

    def __init__(self, session_maker: async_sessionmaker[AsyncSession] | None = None) -> None:
        self._session_maker = session_maker
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get(cls) -> ChatTurnScheduler:
        if cls._instance is None:
            cls._instance = ChatTurnScheduler()
        return cls._instance

    @classmethod
    def configure(cls, session_maker: async_sessionmaker[AsyncSession]) -> ChatTurnScheduler:
        sched = cls.get()
        sched._session_maker = session_maker
        return sched

    @classmethod
    def reset(cls) -> None:
        cls._instance = None

    def schedule_turn(self, run_id: str, turn_id: str) -> None:
        # @lat: [[chat-sessions#Chat Turn Scheduler]]
        if self._session_maker is None:
            logger.warning("chat turn scheduler not configured; dropping turn %s", turn_id)
            return
        task = asyncio.create_task(
            self._run_when_ready(run_id, turn_id),
            name=f"chat-turn-{turn_id}",
        )
        self._tasks[turn_id] = task

        def _done(t: asyncio.Task[Any]) -> None:
            self._tasks.pop(turn_id, None)
            if t.cancelled():
                return
            exc = t.exception()
            if exc:
                logger.error("chat turn task failed turn_id=%s: %s", turn_id, exc)

        task.add_done_callback(_done)

    async def _run_when_ready(self, run_id: str, turn_id: str) -> None:
        assert self._session_maker is not None
        async with self._lock:
            # Wait until no other active turn for this run
            while True:
                async with self._session_maker() as session:
                    repo = ChatRunRepository(session)
                    active = await repo.list_active_turns(run_id)
                    others = [t for t in active if t.id != turn_id and t.status in _ACTIVE_STATUSES]
                    turn = await repo.get_turn(turn_id)
                    if turn is None:
                        return
                    if turn.status in ("completed", "cancelled", "failed"):
                        return
                    if not others:
                        if turn.status == "queued":
                            turn.status = "running"
                            await session.commit()
                        break
                await asyncio.sleep(0.05)

        worker = ChatTurnWorker(self._session_maker)
        await worker.run(run_id, turn_id)

    async def on_turn_finished(self, run_id: str) -> None:
        """Promote next queued turn / queue entry after a turn finishes."""
        if self._session_maker is None:
            return
        async with self._session_maker() as session:
            repo = ChatRunRepository(session)
            active = await repo.list_active_turns(run_id)
            if any(t.status in _ACTIVE_STATUSES for t in active):
                return
            # Prefer turns already in queued status
            queued_turns = [t for t in await repo.list_turns(run_id) if t.status == "queued"]
            if queued_turns:
                nxt = sorted(queued_turns, key=lambda t: t.created_at or t.id)[0]
                self.schedule_turn(run_id, nxt.id)
                return
            # Else promote pending queue entries that carry a turn payload
            from services.chat_queue_service import ChatQueueService

            queue = await ChatQueueService(session).list_queue(run_id)
            pending = [e for e in queue if e.get("status") == "pending"]
            if not pending:
                return
            # Queue promotion is handled by ChatRunService.enqueue_turn path;
            # here we only wake queued turns.
            _ = pending
