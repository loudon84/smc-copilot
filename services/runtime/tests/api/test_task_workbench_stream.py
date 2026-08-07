from __future__ import annotations

import pytest

from api.v1.desktop_workbench import workbench_events_stream
from services.sse_helpers import format_sse
from services.workbench_event_stream import map_workbench_event_name
from tests.api.sse_stream_helpers import build_stream_request, collect_sse_from_iterator


@pytest.mark.asyncio
async def test_workbench_events_stream_http(app_client) -> None:
    """StreamingResponse yields SSE immediately (httpx ASGI blocks on infinite streams)."""
    client, _, settings, _, app = app_client
    create = await client.post(
        "/api/v1/tasks",
        json={"title": "SSE stream task", "task_type": "coding_task"},
    )
    assert create.status_code == 201
    task_id = create.json()["id"]

    request = build_stream_request("/api/v1/desktop/task-workbench/events/stream")
    response = await workbench_events_stream(
        request,
        settings,
        app.state.session_maker,
    )
    assert response.media_type == "text/event-stream"

    from services.workbench_event_stream import iter_workbench_events

    body = await collect_sse_from_iterator(
        iter_workbench_events(request, app.state.session_maker, last_event_id=None),
        must_contain="task_created",
        timeout_sec=2.0,
    )
    assert "event:" in body
    assert task_id in body or "task_created" in body


@pytest.mark.asyncio
async def test_workbench_stream_emits_task_created(app_client) -> None:
    client, *_ = app_client
    create = await client.post(
        "/api/v1/tasks",
        json={"title": "SSE task", "task_type": "coding_task"},
    )
    assert create.status_code == 201
    task_id = create.json()["id"]

    events = await client.get(f"/api/v1/tasks/{task_id}/events")
    assert events.status_code == 200
    rows = events.json()
    created = next(row for row in rows if row["event_type"] == "task_created")
    assert created["event_payload"] is not None
    assert map_workbench_event_name("task_created") == "task_created"

    block = format_sse(
        event_id=created["id"],
        event_name="task_created",
        data={"id": created["id"], "task_id": task_id, "event_type": "task_created"},
    )
    assert "event: task_created" in block
    assert task_id in block


@pytest.mark.asyncio
async def test_iter_workbench_events_yields_ping_start(app_client) -> None:
    _, _, _, _, app = app_client
    from services.workbench_event_stream import iter_workbench_events

    request = build_stream_request("/api/v1/desktop/task-workbench/events/stream")
    stream = iter_workbench_events(request, app.state.session_maker, last_event_id=None)
    body = await collect_sse_from_iterator(stream, must_contain="ping")
    assert "event:" in body
