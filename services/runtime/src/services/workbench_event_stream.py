from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.models.task_related import TaskEvent
from db.repositories.v12_repos import TaskEventRepository, TaskRepository
from services.sse_helpers import format_ping, format_sse, parse_last_event_id, task_event_to_data

PING_INTERVAL_SEC = 10.0
POLL_INTERVAL_SEC = 0.5

_TASK_CREATED_TYPES = frozenset({"task_created", "task_ingested"})
_APPROVAL_TYPES = frozenset({"approval_requested", "approval_created"})


def map_workbench_event_name(event_type: str) -> str:
    if event_type in _TASK_CREATED_TYPES:
        return "task_created"
    if event_type in _APPROVAL_TYPES:
        return "approval_created"
    return "task_updated"


def build_workbench_sse_payload(event: TaskEvent) -> dict:
    data = task_event_to_data(event)
    data["workbench_event"] = map_workbench_event_name(event.event_type)
    return data


async def iter_workbench_events(
    request: Request,
    session_maker: async_sessionmaker[AsyncSession],
    *,
    last_event_id: str | None,
) -> AsyncIterator[str]:
    cursor = last_event_id
    ping_elapsed = 0.0

    try:
        yield format_ping(event_id="ping-start")
        while True:
            if await request.is_disconnected():
                break

            session = session_maker()
            try:
                repo = TaskEventRepository(session)
                events = await repo.list_recent_global_events(after_id=cursor, limit=200)
                for event in events:
                    name = map_workbench_event_name(event.event_type)
                    yield format_sse(
                        event_id=event.id,
                        event_name=name,
                        data=build_workbench_sse_payload(event),
                    )
                    cursor = event.id

                ping_elapsed += POLL_INTERVAL_SEC
                if ping_elapsed >= PING_INTERVAL_SEC:
                    yield format_ping(event_id=f"ping-{int(ping_elapsed)}")
                    ping_elapsed = 0.0
            finally:
                await session.close()

            await asyncio.sleep(POLL_INTERVAL_SEC)
    except asyncio.CancelledError:
        raise


async def iter_task_timeline_events(
    request: Request,
    session_maker: async_sessionmaker[AsyncSession],
    *,
    task_id: str,
    last_event_id: str | None,
) -> AsyncIterator[str]:
    cursor = last_event_id
    ping_elapsed = 0.0
    terminal_grace_sec = 30.0
    terminal_since: float | None = None

    try:
        yield format_ping(event_id="ping-start")
        while True:
            if await request.is_disconnected():
                break

            session = session_maker()
            try:
                task_repo = TaskRepository(session)
                event_repo = TaskEventRepository(session)
                task = await task_repo.get(task_id)
                if task is None:
                    yield format_sse(
                        event_id="error",
                        event_name="error",
                        data={"code": "not_found", "message": "Task not found"},
                    )
                    break

                events = await event_repo.list_by_task_after(task_id, after_id=cursor, limit=500)
                for event in events:
                    yield format_sse(
                        event_id=event.id,
                        event_name=event.event_type,
                        data=task_event_to_data(event),
                    )
                    cursor = event.id

                terminal_statuses = {"completed", "failed", "cancelled"}
                if task.status in terminal_statuses:
                    if terminal_since is None:
                        terminal_since = time.monotonic()
                    elif time.monotonic() - terminal_since >= terminal_grace_sec:
                        break
                else:
                    terminal_since = None

                ping_elapsed += POLL_INTERVAL_SEC
                if ping_elapsed >= PING_INTERVAL_SEC:
                    yield format_ping()
                    ping_elapsed = 0.0
            finally:
                await session.close()

            await asyncio.sleep(POLL_INTERVAL_SEC)
    except asyncio.CancelledError:
        raise


def resolve_last_event_id(request: Request) -> str | None:
    return parse_last_event_id(request.headers.get("Last-Event-ID"))
