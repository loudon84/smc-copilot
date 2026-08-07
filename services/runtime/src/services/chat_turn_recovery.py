"""Chat turn recovery on Runtime restart (PRD v1.2 §9)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.models.chat_runtime import ChatTurn
from db.repositories.chat_run_repo import ChatRunRepository
from services.chat_event_service import ChatEventService
from services.chat_turn_scheduler import ChatTurnScheduler

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def recover_chat_turns(session_maker: async_sessionmaker[AsyncSession]) -> None:
    """On startup: requeue queued/pending; fail interrupted running turns (no Hermes replay)."""
    # @lat: [[chat-sessions#Chat Turn Recovery]]
    ChatTurnScheduler.configure(session_maker)
    async with session_maker() as session:
        repo = ChatRunRepository(session)
        events = ChatEventService(session)

        result = await session.execute(
            select(ChatTurn).where(
                ChatTurn.status.in_(
                    ("queued", "pending", "running", "waiting_clarify", "waiting_approval", "waiting_interaction")
                )
            )
        )
        turns = list(result.scalars().all())
        for turn in turns:
            run = await repo.get_run(turn.run_id)
            if run is None:
                continue
            if turn.status in ("queued", "pending"):
                turn.status = "queued"
                await session.flush()
                ChatTurnScheduler.get().schedule_turn(run.id, turn.id)
                logger.info("chat recovery requeued turn_id=%s run_id=%s", turn.id, run.id)
                continue

            if turn.status == "running":
                turn.status = "failed"
                turn.completed_at = _utcnow()
                turn.error_code = "RUNTIME_RESTARTED_DURING_TURN"
                turn.error_message = "Runtime restarted while turn was running; retry explicitly"
                await events.append(
                    run=run,
                    event_type="turn.failed",
                    payload={
                        "turnId": turn.id,
                        "clientTurnId": turn.client_turn_id,
                        "errorCode": "RUNTIME_RESTARTED_DURING_TURN",
                        "code": "RUNTIME_RESTARTED_DURING_TURN",
                        "message": turn.error_message,
                    },
                    turn_id=turn.id,
                )
                if run.status == "running":
                    run.status = "failed"
                    run.completed_at = _utcnow()
                logger.warning(
                    "chat recovery interrupted turn_id=%s run_id=%s code=RUNTIME_RESTARTED_DURING_TURN",
                    turn.id,
                    run.id,
                )
                continue

            # waiting_clarify / waiting_approval — leave for Desktop resume; do not re-execute
            logger.info(
                "chat recovery left interaction turn_id=%s status=%s",
                turn.id,
                turn.status,
            )

        await session.commit()
