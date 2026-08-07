"""ChatRun / ChatTurn orchestration for durable Chat Runtime v2 (PRD v1.1 §8 / v1.2)."""

from __future__ import annotations

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
from services.chat_turn_scheduler import ChatTurnScheduler
from services.chat_turn_worker import request_abort

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(UTC)


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

        active = await self._repo.list_active_turns(run.id)
        busy = [t for t in active if t.status in ("running", "waiting_clarify", "waiting_approval", "waiting_interaction")]

        turn = ChatTurn(
            run_id=run.id,
            client_turn_id=body.client_turn_id,
            message=body.message,
            model_id=body.model_id,
            status="queued",
            context_json=context_json,
            attachment_ids_json=attachment_ids_json,
            started_at=None,
        )
        await self._repo.add_turn(turn)
        await self._session.flush()

        if busy:
            # Mirror into queue for Desktop visibility (pending edits until running).
            await ChatQueueService(self._session).enqueue(
                run.id,
                status="pending",
                payload={
                    "clientTurnId": body.client_turn_id,
                    "turnId": turn.id,
                    "message": body.message,
                    "modelId": body.model_id,
                },
            )
        else:
            run.status = "running"
            await self._session.commit()

        if self._session_maker is not None:
            ChatTurnScheduler.configure(self._session_maker).schedule_turn(run.id, turn.id)

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

        request_abort(run.id)
        active_turns = await self._repo.list_active_turns(run.id)
        for turn in active_turns:
            if turn.status in ("queued", "pending"):
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
            # running turns: worker observes cancel and emits turn.cancelled

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
