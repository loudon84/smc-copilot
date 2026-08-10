"""EchoChatExecutor → ChatTurnWorker durable event persistence (PRD v1.2 Phase 7)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.models.chat_runtime import ChatEvent, ChatRun, ChatTurn
from services.chat_turn_worker import (
    ChatTurnWorker,
    cancel_flag_for_turn,
    clear_cancel_flags,
    request_abort,
    set_use_echo_executor,
)


@pytest.mark.asyncio
async def test_echo_executor_maps_events_into_store(app_client) -> None:
    """Echo executor yields deltas/usage/completed; worker appends durable ChatEvents."""
    # @lat: [[tests#Chat Runtime v2 Echo#Echo turn worker persistence]]
    client, *_rest = app_client
    app = _rest[-1]
    session_maker: async_sessionmaker[AsyncSession] = app.state.session_maker

    set_use_echo_executor(True)
    clear_cancel_flags("run-echo-1", "turn-echo-1")

    async with session_maker() as session:
        session.add(
            ChatRun(
                id="run-echo-1",
                client_run_id="client-echo-1",
                instance_id="instance-default",
                session_id="sess-echo",
                workspace_id="ws-echo",
                status="queued",
            )
        )
        session.add(
            ChatTurn(
                id="turn-echo-1",
                run_id="run-echo-1",
                client_turn_id="client-turn-echo-1",
                message="ping echo",
                model_id="echo-model",
                status="queued",
            )
        )
        await session.commit()

    worker = ChatTurnWorker(session_maker)
    await worker.run(run_id="run-echo-1", turn_id="turn-echo-1")

    async with session_maker() as session:
        turn = await session.get(ChatTurn, "turn-echo-1")
        assert turn is not None
        assert turn.status == "completed"

        result = await session.execute(
            select(ChatEvent).where(ChatEvent.run_id == "run-echo-1").order_by(ChatEvent.sequence)
        )
        types = [e.event_type for e in result.scalars().all()]
        assert "agent.message.delta" in types
        assert "agent.message.completed" in types
        assert "usage.updated" in types
        assert "turn.completed" in types

    listed = await client.get("/api/v1/chat-runs/run-echo-1/events")
    assert listed.status_code == 200
    assert "turn.completed" in [e["type"] for e in listed.json()]


@pytest.mark.asyncio
async def test_echo_executor_respects_cancel(app_client) -> None:
    # @lat: [[tests#Chat Runtime v2 Echo#Echo turn worker cancel]]
    _client, *_rest = app_client
    app = _rest[-1]
    session_maker: async_sessionmaker[AsyncSession] = app.state.session_maker

    set_use_echo_executor(True)
    clear_cancel_flags("run-echo-abort", "turn-echo-abort")

    async with session_maker() as session:
        session.add(
            ChatRun(
                id="run-echo-abort",
                client_run_id="client-echo-abort",
                instance_id="instance-default",
                status="queued",
            )
        )
        session.add(
            ChatTurn(
                id="turn-echo-abort",
                run_id="run-echo-abort",
                client_turn_id="client-turn-echo-abort",
                message="abort me",
                status="queued",
            )
        )
        await session.commit()

    cancel_flag_for_turn("turn-echo-abort").set()
    request_abort("run-echo-abort")

    worker = ChatTurnWorker(session_maker)
    await worker.run(run_id="run-echo-abort", turn_id="turn-echo-abort")

    async with session_maker() as session:
        turn = await session.get(ChatTurn, "turn-echo-abort")
        assert turn is not None
        assert turn.status == "cancelled"
