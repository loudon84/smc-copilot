"""ChatRun / ChatTurn orchestration for durable Chat Runtime v2 (PRD v1.1 §8)."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.errors import NotFoundError, StateMachineError
from db.models.chat_runtime import ChatRun, ChatTurn
from db.repositories.chat_run_repo import ChatRunRepository
from schemas.chat_runs import ChatAcceptedResult, ChatCreateRunBody, ChatCreateTurnBody
from services.chat_event_service import ChatEventService
from services.chat_queue_service import ChatQueueService

logger = logging.getLogger(__name__)

# run_id → Event set when abort requested for in-flight stub workers
_ABORT_FLAGS: dict[str, asyncio.Event] = {}


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _abort_flag(run_id: str) -> asyncio.Event:
    flag = _ABORT_FLAGS.get(run_id)
    if flag is None:
        flag = asyncio.Event()
        _ABORT_FLAGS[run_id] = flag
    return flag


def _clear_abort_flag(run_id: str) -> None:
    _ABORT_FLAGS.pop(run_id, None)


class ChatRunService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        session_maker: async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        self._session = session
        self._session_maker = session_maker
        self._repo = ChatRunRepository(session)
        self._events = ChatEventService(session)

    @staticmethod
    def run_to_dict(run: ChatRun) -> dict[str, Any]:
        return {
            "runId": run.id,
            "id": run.id,
            "clientRunId": run.client_run_id,
            "instanceId": run.instance_id,
            "sessionId": run.session_id,
            "workspaceId": run.workspace_id,
            "status": run.status,
            "eventCursor": run.event_cursor,
            "createdAt": run.created_at.isoformat() if run.created_at else None,
            "updatedAt": run.updated_at.isoformat() if run.updated_at else None,
            "completedAt": run.completed_at.isoformat() if run.completed_at else None,
        }

    async def create_run(self, body: ChatCreateRunBody) -> ChatAcceptedResult:
        existing = await self._repo.get_run_by_client_id(body.client_run_id)
        if existing is not None:
            return ChatAcceptedResult(
                accepted=True,
                run_id=existing.id,
                turn_id="",
                event_cursor=existing.event_cursor,
            )

        run = ChatRun(
            client_run_id=body.client_run_id,
            instance_id=body.instance_id,
            session_id=body.session_id,
            workspace_id=body.workspace_id,
            status="active",
            event_cursor=0,
        )
        await self._repo.add_run(run)
        await self._events.append(
            run=run,
            event_type="run.started",
            payload={
                "clientRunId": run.client_run_id,
                "instanceId": run.instance_id,
                "sessionId": run.session_id,
                "workspaceId": run.workspace_id,
            },
        )
        if run.session_id:
            await self._events.append(
                run=run,
                event_type="session.started",
                payload={"sessionId": run.session_id},
            )
        await self._session.commit()
        return ChatAcceptedResult(
            accepted=True,
            run_id=run.id,
            turn_id="",
            event_cursor=run.event_cursor,
        )

    async def get_run(self, run_ref: str) -> dict[str, Any]:
        run = await self._repo.get_run_by_ref(run_ref)
        if run is None:
            raise NotFoundError("chat run not found")
        return self.run_to_dict(run)

    async def get_snapshot(self, run_ref: str) -> dict[str, Any]:
        run = await self._repo.get_run_by_ref(run_ref)
        if run is None:
            raise NotFoundError("chat run not found")
        events = await self._events.list_events(run.id)
        queue = await ChatQueueService(self._session).list_queue(run.id)
        return {
            "runId": run.id,
            "sessionId": run.session_id,
            "status": run.status,
            "eventCursor": run.event_cursor,
            "events": events,
            "queue": queue,
        }

    async def create_turn(self, run_ref: str, body: ChatCreateTurnBody) -> ChatAcceptedResult:
        run = await self._repo.get_run_by_ref(run_ref)
        if run is None and body.client_run_id and body.instance_id:
            # Auto-create run when Desktop startTurn races ahead (idempotent clientRunId).
            created = await self.create_run(
                ChatCreateRunBody(
                    clientRunId=body.client_run_id,
                    instanceId=body.instance_id,
                    sessionId=body.session_id,
                    workspaceId=body.workspace_id,
                )
            )
            run = await self._repo.get_run(created.run_id)
        if run is None:
            raise NotFoundError("chat run not found")
        if run.status in ("cancelled", "aborted", "failed"):
            raise StateMachineError(f"chat run is {run.status}")

        existing = await self._repo.get_turn_by_client(run.id, body.client_turn_id)
        if existing is not None:
            return ChatAcceptedResult(
                accepted=True,
                run_id=run.id,
                turn_id=existing.id,
                event_cursor=run.event_cursor,
            )

        if body.session_id and not run.session_id:
            run.session_id = body.session_id
            await self._events.append(
                run=run,
                event_type="session.started",
                payload={"sessionId": run.session_id},
            )

        context_json = None
        if body.context is not None:
            context_json = json.dumps(body.context.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False)
        attachment_ids_json = json.dumps(body.attachment_ids or [], ensure_ascii=False)

        turn = ChatTurn(
            run_id=run.id,
            client_turn_id=body.client_turn_id,
            message=body.message,
            model_id=body.model_id,
            status="pending",
            context_json=context_json,
            attachment_ids_json=attachment_ids_json,
            started_at=_utcnow(),
        )
        await self._repo.add_turn(turn)
        turn.status = "running"
        run.status = "running"
        await self._session.flush()
        await self._session.commit()

        if self._session_maker is not None:
            asyncio.create_task(
                _execute_turn_stub(self._session_maker, run.id, turn.id),
                name=f"chat-turn-{turn.id}",
            )

        return ChatAcceptedResult(
            accepted=True,
            run_id=run.id,
            turn_id=turn.id,
            event_cursor=run.event_cursor,
        )

    async def abort(self, run_ref: str) -> dict[str, Any]:
        run = await self._repo.get_run_by_ref(run_ref)
        if run is None:
            raise NotFoundError("chat run not found")

        _abort_flag(run.id).set()
        active_turns = await self._repo.list_active_turns(run.id)
        for turn in active_turns:
            turn.status = "cancelled"
            turn.completed_at = _utcnow()
            turn.error_code = "TURN_CANCELLED"
            turn.error_message = "aborted by client"
            await self._events.append(
                run=run,
                event_type="turn.cancelled",
                payload={"turnId": turn.id, "clientTurnId": turn.client_turn_id},
                turn_id=turn.id,
            )

        run.status = "cancelled"
        run.completed_at = _utcnow()
        await self._session.flush()
        await self._session.commit()
        return {
            "ok": True,
            "runId": run.id,
            "status": run.status,
            "cancelledTurns": [t.id for t in active_turns],
        }


async def _execute_turn_stub(
    session_maker: async_sessionmaker[AsyncSession],
    run_id: str,
    turn_id: str,
) -> None:
    """Emit durable delta/completed events so chat-runs e2e works without Hermes yet.

    Phase 6+ should replace this with InstanceChatService / Hermes Gateway mapping into
    the same Event Store.
    """
    abort = _abort_flag(run_id)
    try:
        async with session_maker() as session:
            repo = ChatRunRepository(session)
            events = ChatEventService(session)
            run = await repo.get_run(run_id)
            turn = await repo.get_turn(turn_id)
            if run is None or turn is None:
                return
            if abort.is_set() or turn.status == "cancelled":
                return

            chunks = [
                "I'll help with that. ",
                f"(echo) {turn.message[:200]}",
            ]
            for chunk in chunks:
                if abort.is_set():
                    break
                await events.append(
                    run=run,
                    event_type="agent.message.delta",
                    payload={"content": chunk, "text": chunk, "turnId": turn.id},
                    turn_id=turn.id,
                )
                await session.commit()
                await asyncio.sleep(0.05)

            if abort.is_set():
                turn = await repo.get_turn(turn_id)
                run = await repo.get_run(run_id)
                if turn and turn.status != "cancelled":
                    turn.status = "cancelled"
                    turn.completed_at = _utcnow()
                    await events.append(
                        run=run,  # type: ignore[arg-type]
                        event_type="turn.cancelled",
                        payload={"turnId": turn.id},
                        turn_id=turn.id,
                    )
                    await session.commit()
                return

            full = "".join(chunks)
            await events.append(
                run=run,
                event_type="agent.message.completed",
                payload={"content": full, "turnId": turn.id},
                turn_id=turn.id,
            )
            await events.append(
                run=run,
                event_type="usage.updated",
                payload={
                    "promptTokens": max(1, len(turn.message) // 4),
                    "completionTokens": max(1, len(full) // 4),
                    "totalTokens": max(2, (len(turn.message) + len(full)) // 4),
                },
                turn_id=turn.id,
            )
            turn.status = "completed"
            turn.completed_at = _utcnow()
            await events.append(
                run=run,
                event_type="turn.completed",
                payload={
                    "turnId": turn.id,
                    "clientTurnId": turn.client_turn_id,
                    "sessionId": run.session_id,
                },
                turn_id=turn.id,
            )
            # Keep run active for subsequent turns unless aborted.
            if run.status == "running":
                run.status = "active"
            await session.commit()
    except Exception:
        logger.exception("chat turn stub failed run_id=%s turn_id=%s", run_id, turn_id)
        try:
            async with session_maker() as session:
                repo = ChatRunRepository(session)
                events = ChatEventService(session)
                run = await repo.get_run(run_id)
                turn = await repo.get_turn(turn_id)
                if run is None or turn is None:
                    return
                if turn.status in ("completed", "cancelled", "failed"):
                    return
                turn.status = "failed"
                turn.completed_at = _utcnow()
                turn.error_code = "TURN_FAILED"
                turn.error_message = "stub worker failed"
                await events.append(
                    run=run,
                    event_type="turn.failed",
                    payload={
                        "code": "TURN_FAILED",
                        "message": "stub worker failed",
                        "turnId": turn.id,
                    },
                    turn_id=turn.id,
                )
                await session.commit()
        except Exception:
            logger.debug("chat turn stub failure recording skipped", exc_info=True)
    finally:
        # Only clear abort flag when no other active turns remain.
        try:
            async with session_maker() as session:
                repo = ChatRunRepository(session)
                active = await repo.list_active_turns(run_id)
                if not active:
                    _clear_abort_flag(run_id)
        except Exception:
            logger.debug("chat turn stub cleanup skipped", exc_info=True)
