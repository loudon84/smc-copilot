"""Clarify / approval interaction resolution for Chat Runtime v2."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.errors import ChatApiError, NotFoundError
from db.models.chat_runtime import ChatInteraction
from db.repositories.chat_run_repo import ChatRunRepository
from schemas.chat_runs import ChatApprovalRespondBody, ChatClarifyRespondBody, ChatInteractionRespondBody
from services.chat_event_service import ChatEventService


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ChatInteractionService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = ChatRunRepository(session)
        self._events = ChatEventService(session)

    async def respond(
        self,
        run_ref: str,
        request_id: str,
        body: ChatInteractionRespondBody,
    ) -> dict[str, Any]:
        run = await self._repo.get_run_by_ref(run_ref)
        if run is None:
            raise NotFoundError("chat run not found")

        interaction = await self._repo.get_interaction(run.id, request_id)
        if interaction is None:
            # Lazy-create so Desktop can respond even if hermes path hasn't persisted yet.
            interaction_type = body.type
            turn_id = body.turn_id
            turn = await self._repo.get_turn(turn_id)
            if turn is None:
                # also accept client turn id within run
                turn = await self._repo.get_turn_by_client(run.id, turn_id)
            interaction = ChatInteraction(
                run_id=run.id,
                turn_id=turn.id if turn else (turn_id if len(turn_id) == 36 else None),
                request_id=request_id,
                interaction_type=interaction_type,
                status="pending",
                payload_json="{}",
            )
            await self._repo.add_interaction(interaction)

        if interaction.status == "resolved":
            return {
                "accepted": True,
                "requestId": request_id,
                "status": "resolved",
                "alreadyResolved": True,
            }

        if isinstance(body, ChatClarifyRespondBody):
            if interaction.interaction_type not in ("clarify", "pending"):
                # allow type mismatch only when lazily created
                pass
            interaction.interaction_type = "clarify"
            response = {"type": "clarify", "answer": body.answer, "turnId": body.turn_id}
            event_type = "clarify.resolved"
            event_payload = {"requestId": request_id, "answer": body.answer, "turnId": body.turn_id}
        elif isinstance(body, ChatApprovalRespondBody):
            interaction.interaction_type = "approval"
            response = {
                "type": "approval",
                "decision": body.decision,
                "reason": body.reason,
                "turnId": body.turn_id,
            }
            event_type = "approval.resolved"
            event_payload = {
                "requestId": request_id,
                "decision": body.decision,
                "reason": body.reason,
                "turnId": body.turn_id,
            }
        else:
            raise ChatApiError("unsupported interaction response type", code="INVALID_INTERACTION")

        interaction.status = "resolved"
        interaction.response_json = json.dumps(response, ensure_ascii=False)
        interaction.resolved_at = _utcnow()
        await self._session.flush()

        await self._events.append(
            run=run,
            event_type=event_type,
            payload=event_payload,
            turn_id=interaction.turn_id,
        )
        await self._session.commit()
        return {
            "accepted": True,
            "requestId": request_id,
            "status": "resolved",
            "response": response,
        }
