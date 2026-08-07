from __future__ import annotations

import pytest

from api.v1.tasks import stream_events
from services.sse_helpers import format_sse, task_event_to_data
from tests.api.sse_stream_helpers import build_stream_request, collect_sse_from_iterator


@pytest.mark.asyncio
async def test_task_timeline_events_stream_http(app_client) -> None:
    client, _, settings, _, app = app_client
    create = await client.post(
        "/api/v1/tasks",
        json={"title": "Timeline SSE", "task_type": "coding_task"},
    )
    assert create.status_code == 201
    task_id = create.json()["id"]

    request = build_stream_request(f"/api/v1/tasks/{task_id}/events/stream")
    response = await stream_events(
        task_id,
        request,
        settings,
        app.state.session_maker,
    )
    assert response.media_type == "text/event-stream"

    from services.workbench_event_stream import iter_task_timeline_events

    body = await collect_sse_from_iterator(
        iter_task_timeline_events(
            request,
            app.state.session_maker,
            task_id=task_id,
            last_event_id=None,
        ),
        must_contain="task_created",
        timeout_sec=2.0,
    )
    assert "event:" in body
    assert "task_created" in body


@pytest.mark.asyncio
async def test_task_events_stream_includes_payload_and_run_id(app_client) -> None:
    client, *_ = app_client
    create = await client.post(
        "/api/v1/tasks",
        json={"title": "Timeline task", "task_type": "coding_task"},
    )
    assert create.status_code == 201
    task_id = create.json()["id"]

    events = await client.get(f"/api/v1/tasks/{task_id}/events")
    assert events.status_code == 200
    rows = events.json()
    created = next(row for row in rows if row["event_type"] == "task_created")
    assert created["event_payload"] is not None

    data = task_event_to_data(
        type(
            "TaskEvent",
            (),
            {
                "id": created["id"],
                "task_id": task_id,
                "run_id": None,
                "event_type": "task_created",
                "message": created.get("message"),
                "event_payload": created["event_payload"],
                "created_at": type("DT", (), {"isoformat": lambda self: created["created_at"]})(),
            },
        )(),
    )
    block = format_sse(event_id=created["id"], event_name="task_created", data=data)
    assert "event_payload" in block
    assert "id:" in block


@pytest.mark.asyncio
async def test_iter_task_timeline_yields_ping_start(app_client) -> None:
    client, _, _, _, app = app_client
    create = await client.post(
        "/api/v1/tasks",
        json={"title": "Timeline ping", "task_type": "coding_task"},
    )
    task_id = create.json()["id"]

    from services.workbench_event_stream import iter_task_timeline_events

    request = build_stream_request(f"/api/v1/tasks/{task_id}/events/stream")
    stream = iter_task_timeline_events(
        request,
        app.state.session_maker,
        task_id=task_id,
        last_event_id=None,
    )
    body = await collect_sse_from_iterator(stream, must_contain="task_created")
    assert "event:" in body
