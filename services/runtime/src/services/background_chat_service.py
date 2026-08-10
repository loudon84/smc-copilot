"""Background Side Question Service (PRD v1.6 FR-03 / §50 / §65).

Creates a child ChatRun with run_kind=background that does NOT alter the main
run state, queue, or session context. Underlying Hermes call: prompt.background.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError
from db.models.chat_runtime import ChatEvent, ChatRun, ChatTurn
from db.models.runtime import HermesInstance
from integrations.hermes.dashboard_rpc_client import (
    HermesDashboardRpcClient,
    resolve_dashboard_port,
)
from schemas.chat_commands import ChatBackgroundTurnBody, ChatBackgroundTurnResponse
from services.gateway_credential_service import GatewayCredentialService

logger = get_logger(__name__)


class BackgroundChatService:
    def __init__(self, session: AsyncSession, settings: Any) -> None:
        self._session = session
        self._settings = settings
        self._credentials = GatewayCredentialService(settings, session)

    async def create_background_turn(
        self,
        parent_run_id: str,
        body: ChatBackgroundTurnBody,
    ) -> ChatBackgroundTurnResponse:
        parent = await self._session.get(ChatRun, parent_run_id)
        if parent is None:
            raise RuntimeServiceError(f"Chat run not found: {parent_run_id}", code="not_found")

        instance_id = parent.instance_id
        session_id = body.session_id or parent.session_id or ""
        turn_id = str(uuid.uuid4())
        bg_run_id = str(uuid.uuid4())
        client_run_id = f"bg-{parent_run_id}-{uuid.uuid4().hex[:8]}"

        bg_run = ChatRun(
            id=bg_run_id,
            client_run_id=client_run_id,
            instance_id=instance_id,
            session_id=session_id or None,
            workspace_id=parent.workspace_id,
            status="active",
            run_kind="background",
            parent_run_id=parent_run_id,
            parent_turn_id=body.parent_turn_id,
            event_cursor=0,
        )
        self._session.add(bg_run)

        bg_turn = ChatTurn(
            id=turn_id,
            run_id=bg_run_id,
            client_turn_id=f"bg-turn-{uuid.uuid4().hex[:8]}",
            message=body.message,
            status="running",
            started_at=datetime.now(UTC),
        )
        self._session.add(bg_turn)

        # Events go on the PARENT run so Desktop SSE on the main run sees background.*
        await self._append_event(
            parent_run_id,
            turn_id=turn_id,
            event_type="background.started",
            payload={
                "backgroundRunId": bg_run_id,
                "backgroundTurnId": turn_id,
                "parentTurnId": body.parent_turn_id,
                "message": body.message,
            },
        )
        await self._session.flush()

        # Fire Hermes prompt.background (best-effort; failures emit background.failed).
        try:
            await self._invoke_hermes_background(
                instance_id=instance_id,
                session_id=session_id,
                message=body.message,
                parent_turn_id=body.parent_turn_id,
                bg_run=bg_run,
                bg_turn=bg_turn,
                parent_run_id=parent_run_id,
            )
        except Exception as exc:
            logger.warning("background_turn_failed", error=str(exc), run_id=bg_run_id)
            bg_turn.status = "failed"
            bg_turn.error_message = str(exc)
            bg_turn.completed_at = datetime.now(UTC)
            bg_run.status = "failed"
            bg_run.completed_at = datetime.now(UTC)
            await self._append_event(
                parent_run_id,
                turn_id=turn_id,
                event_type="background.failed",
                payload={
                    "backgroundRunId": bg_run_id,
                    "backgroundTurnId": turn_id,
                    "error": str(exc),
                },
            )
            await self._session.flush()

        return ChatBackgroundTurnResponse(
            accepted=True,
            runId=bg_run_id,
            turnId=turn_id,
            parentRunId=parent_run_id,
            parentTurnId=body.parent_turn_id,
            runKind="background",
        )

    async def _invoke_hermes_background(
        self,
        *,
        instance_id: str,
        session_id: str,
        message: str,
        parent_turn_id: str | None,
        bg_run: ChatRun,
        bg_turn: ChatTurn,
        parent_run_id: str,
    ) -> None:
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")

        api_key: str | None = None
        try:
            creds = await self._credentials.resolve_for_instance(instance_id)
            api_key = creds.api_server_key
        except Exception:
            pass

        client = HermesDashboardRpcClient(
            dashboard_port=resolve_dashboard_port(),
            api_key=api_key,
        )
        try:
            result = await client.prompt_background(
                session_id=session_id,
                message=message,
                parent_turn_id=parent_turn_id,
            )
            output = ""
            if isinstance(result, dict):
                output = str(result.get("output") or result.get("message") or result.get("text") or "")
            elif isinstance(result, str):
                output = result

            bg_turn.status = "completed"
            bg_turn.completed_at = datetime.now(UTC)
            bg_run.status = "completed"
            bg_run.completed_at = datetime.now(UTC)
            await self._append_event(
                parent_run_id,
                turn_id=bg_turn.id,
                event_type="background.completed",
                payload={
                    "backgroundRunId": bg_run.id,
                    "backgroundTurnId": bg_turn.id,
                    "output": output,
                },
            )
            await self._session.flush()
        finally:
            await client.close()

    async def _append_event(
        self,
        run_id: str,
        *,
        turn_id: str | None,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        run = await self._session.get(ChatRun, run_id)
        if run is None:
            return
        seq = int(run.event_cursor or 0) + 1
        run.event_cursor = seq
        self._session.add(
            ChatEvent(
                id=str(uuid.uuid4()),
                run_id=run_id,
                turn_id=turn_id,
                sequence=seq,
                event_type=event_type,
                payload_json=json.dumps(payload),
            )
        )
