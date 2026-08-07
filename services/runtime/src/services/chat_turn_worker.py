"""Chat turn worker — runs HermesChatExecutor and persists durable events (PRD v1.2 §7)."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.repositories.chat_run_repo import ChatRunRepository
from services.chat_event_service import ChatEventService
from services.hermes_chat_event_mapper import HermesExecutionEvent, map_hermes_event_to_chat
from services.hermes_chat_executor import HermesChatExecutionRequest, HermesChatExecutor

logger = logging.getLogger(__name__)

# run_id → cancel Event for in-flight workers
_CANCEL_FLAGS: dict[str, asyncio.Event] = {}
# turn_id → cancel Event (finer-grained)
_TURN_CANCEL: dict[str, asyncio.Event] = {}


def cancel_flag_for_run(run_id: str) -> asyncio.Event:
    flag = _CANCEL_FLAGS.get(run_id)
    if flag is None:
        flag = asyncio.Event()
        _CANCEL_FLAGS[run_id] = flag
    return flag


def cancel_flag_for_turn(turn_id: str) -> asyncio.Event:
    flag = _TURN_CANCEL.get(turn_id)
    if flag is None:
        flag = asyncio.Event()
        _TURN_CANCEL[turn_id] = flag
    return flag


def clear_cancel_flags(run_id: str, turn_id: str | None = None) -> None:
    _CANCEL_FLAGS.pop(run_id, None)
    if turn_id:
        _TURN_CANCEL.pop(turn_id, None)


def request_abort(run_id: str) -> None:
    cancel_flag_for_run(run_id).set()
    for tid, flag in list(_TURN_CANCEL.items()):
        # best-effort: cancel all turn flags for this run are keyed separately;
        # ChatRunService.abort also sets turn statuses.
        flag.set()


class ChatExecutor(Protocol):
    async def execute(
        self,
        request: HermesChatExecutionRequest,
        cancel: asyncio.Event,
    ) -> AsyncIterator[HermesExecutionEvent]: ...


ExecutorFactory = Callable[[AsyncSession], ChatExecutor]


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def _echo_executor(
    request: HermesChatExecutionRequest,
    cancel: asyncio.Event,
) -> AsyncIterator[HermesExecutionEvent]:
    """Test/dev fallback when no real Hermes gateway is available."""
    chunks = [
        "I'll help with that. ",
        f"(echo) {(request.message or '')[:200]}",
    ]
    for chunk in chunks:
        if cancel.is_set():
            yield HermesExecutionEvent(
                type="cancelled",
                payload={"errorCode": "TURN_CANCELLED", "message": "aborted by client"},
            )
            return
        yield HermesExecutionEvent(
            type="message_delta",
            payload={"content": chunk, "text": chunk, "turnId": request.turn_id},
        )
        await asyncio.sleep(0.05)
    if cancel.is_set():
        yield HermesExecutionEvent(
            type="cancelled",
            payload={"errorCode": "TURN_CANCELLED", "message": "aborted by client"},
        )
        return
    full = "".join(chunks)
    yield HermesExecutionEvent(
        type="message_completed",
        payload={"content": full, "text": full, "turnId": request.turn_id},
    )
    yield HermesExecutionEvent(
        type="usage",
        payload={
            "promptTokens": max(1, len(request.message or "") // 4),
            "completionTokens": max(1, len(full) // 4),
            "totalTokens": max(2, (len(request.message or "") + len(full)) // 4),
        },
    )
    yield HermesExecutionEvent(
        type="completed",
        payload={"turnId": request.turn_id, "sessionId": request.session_id, "modelId": request.model_id},
    )


class EchoChatExecutor:
    """Deterministic executor used by unit tests and offline mode."""

    async def execute(
        self,
        request: HermesChatExecutionRequest,
        cancel: asyncio.Event,
    ) -> AsyncIterator[HermesExecutionEvent]:
        async for event in _echo_executor(request, cancel):
            yield event


_executor_factory: ExecutorFactory | None = None
_use_echo: bool = False


def set_chat_executor_factory(factory: ExecutorFactory | None) -> None:
    global _executor_factory
    _executor_factory = factory


def set_use_echo_executor(enabled: bool) -> None:
    global _use_echo
    _use_echo = enabled


def get_chat_executor(session: AsyncSession) -> ChatExecutor:
    if _executor_factory is not None:
        return _executor_factory(session)
    if _use_echo:
        return EchoChatExecutor()
    return HermesChatExecutor(session)


class ChatTurnWorker:
    """Execute one ChatTurn through ChatExecutor → ChatEventStore."""

    def __init__(self, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._session_maker = session_maker

    async def run(self, run_id: str, turn_id: str) -> None:
        # @lat: [[chat-sessions#Chat Turn Worker]]
        cancel = cancel_flag_for_turn(turn_id)
        run_cancel = cancel_flag_for_run(run_id)
        if run_cancel.is_set():
            cancel.set()

        started = _utcnow()
        try:
            async with self._session_maker() as session:
                repo = ChatRunRepository(session)
                events = ChatEventService(session)
                run = await repo.get_run(run_id)
                turn = await repo.get_turn(turn_id)
                if run is None or turn is None:
                    return
                if turn.status in ("completed", "cancelled", "failed"):
                    return

                turn.status = "running"
                turn.started_at = turn.started_at or started
                run.status = "running"
                await session.flush()
                await session.commit()

                attachment_ids: list[str] = []
                if turn.attachment_ids_json:
                    try:
                        parsed = json.loads(turn.attachment_ids_json)
                        if isinstance(parsed, list):
                            attachment_ids = [str(x) for x in parsed]
                    except json.JSONDecodeError:
                        attachment_ids = []

                request = HermesChatExecutionRequest(
                    instance_id=run.instance_id,
                    message=turn.message,
                    session_id=run.session_id,
                    workspace_id=run.workspace_id,
                    model_id=turn.model_id,
                    attachment_ids=attachment_ids,
                    turn_id=turn.id,
                )
                executor = get_chat_executor(session)
                tool_count = 0
                prompt_tokens = 0
                completion_tokens = 0
                total_tokens = 0
                terminal = False

                async for hermes_event in executor.execute(request, cancel):
                    if run_cancel.is_set():
                        cancel.set()

                    chat_type, payload = map_hermes_event_to_chat(hermes_event)
                    payload.setdefault("turnId", turn.id)

                    if hermes_event.type == "session":
                        sid = hermes_event.payload.get("sessionId")
                        if isinstance(sid, str) and sid.strip() and not run.session_id:
                            run.session_id = sid.strip()

                    if hermes_event.type == "usage":
                        prompt_tokens = int(hermes_event.payload.get("promptTokens") or 0)
                        completion_tokens = int(hermes_event.payload.get("completionTokens") or 0)
                        total_tokens = int(hermes_event.payload.get("totalTokens") or 0)

                    if hermes_event.type.startswith("tool_"):
                        tool_count += 1

                    # After abort: only allow turn.cancelled
                    if cancel.is_set() and hermes_event.type not in ("cancelled",):
                        if hermes_event.type in ("message_delta", "tool_started", "tool_progress", "tool_completed"):
                            continue

                    await events.append(
                        run=run,
                        event_type=chat_type,
                        payload=payload,
                        turn_id=turn.id,
                    )
                    await session.commit()

                    if hermes_event.type == "clarify_requested":
                        turn.status = "waiting_clarify"
                        run.status = "waiting_interaction"
                        await session.commit()
                        terminal = True
                        break

                    if hermes_event.type == "approval_requested":
                        turn.status = "waiting_approval"
                        run.status = "waiting_interaction"
                        await session.commit()
                        terminal = True
                        break

                    if hermes_event.type == "cancelled":
                        turn.status = "cancelled"
                        turn.completed_at = _utcnow()
                        turn.error_code = "TURN_CANCELLED"
                        turn.error_message = str(hermes_event.payload.get("message") or "aborted")
                        if run.status == "running":
                            run.status = "cancelled"
                            run.completed_at = _utcnow()
                        await session.commit()
                        terminal = True
                        break

                    if hermes_event.type == "failed":
                        turn.status = "failed"
                        turn.completed_at = _utcnow()
                        turn.error_code = str(hermes_event.payload.get("errorCode") or "TURN_FAILED")
                        turn.error_message = str(hermes_event.payload.get("message") or "turn failed")
                        if run.status == "running":
                            run.status = "failed"
                            run.completed_at = _utcnow()
                        await session.commit()
                        terminal = True
                        break

                    if hermes_event.type == "completed":
                        turn.status = "completed"
                        turn.completed_at = _utcnow()
                        if run.status == "running":
                            run.status = "active"
                        await session.commit()
                        terminal = True
                        break

                if not terminal and cancel.is_set():
                    turn.status = "cancelled"
                    turn.completed_at = _utcnow()
                    turn.error_code = "TURN_CANCELLED"
                    await events.append(
                        run=run,
                        event_type="turn.cancelled",
                        payload={"turnId": turn.id, "clientTurnId": turn.client_turn_id},
                        turn_id=turn.id,
                    )
                    if run.status == "running":
                        run.status = "cancelled"
                        run.completed_at = _utcnow()
                    await session.commit()

                # Observability fields stored in turn.error_message metadata when columns absent;
                # duration logged without secrets.
                duration_ms = int((_utcnow() - started).total_seconds() * 1000)
                logger.info(
                    "chat_turn_finished run_id=%s turn_id=%s client_turn_id=%s status=%s "
                    "duration_ms=%s model_id=%s prompt_tokens=%s completion_tokens=%s "
                    "total_tokens=%s tool_count=%s error_code=%s",
                    run.id,
                    turn.id,
                    turn.client_turn_id,
                    turn.status,
                    duration_ms,
                    turn.model_id,
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    tool_count,
                    turn.error_code,
                )
        except Exception:
            logger.exception("chat turn worker failed run_id=%s turn_id=%s", run_id, turn_id)
            try:
                async with self._session_maker() as session:
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
                    turn.error_message = "turn worker failed"
                    await events.append(
                        run=run,
                        event_type="turn.failed",
                        payload={
                            "code": "TURN_FAILED",
                            "message": "turn worker failed",
                            "turnId": turn.id,
                            "errorCode": "TURN_FAILED",
                        },
                        turn_id=turn.id,
                    )
                    await session.commit()
            except Exception:
                logger.debug("chat turn failure recording skipped", exc_info=True)
        finally:
            clear_cancel_flags(run_id, turn_id)
            # Wake scheduler to process next queued turn
            try:
                from services.chat_turn_scheduler import ChatTurnScheduler

                await ChatTurnScheduler.get().on_turn_finished(run_id)
            except Exception:
                logger.debug("scheduler notify skipped", exc_info=True)


# Avoid unused import lint for Protocol typing helpers
_ = (Awaitable,)
