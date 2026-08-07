"""Chat Runtime v2 API tests (PRD v1.1 Phase 5)."""

from __future__ import annotations

import asyncio

import pytest


# @lat: [[tests#Chat Runtime v2#Create run and turn]]
@pytest.mark.asyncio
async def test_create_run_and_turn(app_client) -> None:
    client, *_ = app_client

    created = await client.post(
        "/api/v1/chat-runs",
        json={
            "clientRunId": "client-run-1",
            "instanceId": "instance-default",
            "sessionId": "sess-1",
            "workspaceId": "ws-1",
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["accepted"] is True
    assert body["runId"]
    assert body["eventCursor"] >= 1
    run_id = body["runId"]

    again = await client.post(
        "/api/v1/chat-runs",
        json={"clientRunId": "client-run-1", "instanceId": "instance-default"},
    )
    assert again.status_code == 200
    assert again.json()["runId"] == run_id

    turn = await client.post(
        f"/api/v1/chat-runs/{run_id}/turns",
        json={
            "clientRunId": "client-run-1",
            "clientTurnId": "turn-1",
            "instanceId": "instance-default",
            "message": "hello durable chat",
            "modelId": "stub-model",
        },
    )
    assert turn.status_code == 200, turn.text
    turn_body = turn.json()
    assert turn_body["accepted"] is True
    assert turn_body["turnId"]
    turn_id = turn_body["turnId"]

    for _ in range(40):
        events = await client.get(f"/api/v1/chat-runs/{run_id}/events")
        assert events.status_code == 200
        types = [e["type"] for e in events.json()]
        if "turn.completed" in types:
            break
        await asyncio.sleep(0.1)
    else:
        pytest.fail(f"turn.completed not emitted, got {types}")

    types = [e["type"] for e in events.json()]
    assert "run.started" in types
    assert "session.started" in types
    assert "agent.message.delta" in types
    assert "agent.message.completed" in types
    assert "turn.completed" in types
    assert all(e["runId"] == run_id for e in events.json())
    assert any(e.get("turnId") == turn_id for e in events.json() if e["type"].startswith("agent."))


# @lat: [[tests#Chat Runtime v2#List events replay]]
@pytest.mark.asyncio
async def test_list_events_after_sequence(app_client) -> None:
    client, *_ = app_client
    created = await client.post(
        "/api/v1/chat-runs",
        json={"clientRunId": "client-run-events", "instanceId": "inst"},
    )
    run_id = created.json()["runId"]
    await client.post(
        f"/api/v1/chat-runs/{run_id}/turns",
        json={
            "clientTurnId": "t1",
            "instanceId": "inst",
            "message": "replay me",
        },
    )
    all_events: list[dict] = []
    for _ in range(40):
        all_events = (await client.get(f"/api/v1/chat-runs/{run_id}/events")).json()
        if any(e["type"] == "turn.completed" for e in all_events):
            break
        await asyncio.sleep(0.1)

    mid = all_events[0]["sequence"]
    replay = await client.get(
        f"/api/v1/chat-runs/{run_id}/events",
        params={"after_sequence": mid},
    )
    assert replay.status_code == 200
    replayed = replay.json()
    assert all(e["sequence"] > mid for e in replayed)

    by_client = await client.get("/api/v1/chat-runs/client-run-events/events")
    assert by_client.status_code == 200
    assert len(by_client.json()) == len(all_events)


# @lat: [[tests#Chat Runtime v2#Abort cancels turn]]
@pytest.mark.asyncio
async def test_abort_cancels_active_turn(app_client) -> None:
    client, *_ = app_client
    created = await client.post(
        "/api/v1/chat-runs",
        json={"clientRunId": "client-run-abort", "instanceId": "inst"},
    )
    run_id = created.json()["runId"]
    await client.post(
        f"/api/v1/chat-runs/{run_id}/turns",
        json={"clientTurnId": "t-abort", "instanceId": "inst", "message": "long"},
    )
    aborted = await client.post(f"/api/v1/chat-runs/{run_id}/abort", json={})
    assert aborted.status_code == 200
    assert aborted.json()["status"] == "cancelled"

    got = await client.get(f"/api/v1/chat-runs/{run_id}")
    assert got.json()["status"] == "cancelled"

    events = (await client.get(f"/api/v1/chat-runs/{run_id}/events")).json()
    assert any(e["type"] == "turn.cancelled" for e in events)


# @lat: [[tests#Chat Runtime v2#Queue lifecycle]]
@pytest.mark.asyncio
async def test_queue_lifecycle(app_client) -> None:
    client, *_ = app_client
    created = await client.post(
        "/api/v1/chat-runs",
        json={"clientRunId": "client-run-queue", "instanceId": "inst"},
    )
    run_id = created.json()["runId"]

    enqueued = await client.post(
        f"/api/v1/chat-runs/{run_id}/queue",
        json={"payload": {"message": "queued turn"}, "status": "pending"},
    )
    assert enqueued.status_code == 200
    queue_id = enqueued.json()["queueId"]

    listed = await client.get(f"/api/v1/chat-runs/{run_id}/queue")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["queueId"] == queue_id

    patched = await client.patch(
        f"/api/v1/chat-runs/{run_id}/queue/{queue_id}",
        json={"status": "running"},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "running"

    deleted = await client.delete(f"/api/v1/chat-runs/{run_id}/queue/{queue_id}")
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True

    empty = await client.get(f"/api/v1/chat-runs/{run_id}/queue")
    assert empty.json() == []

    snapshot = await client.get(f"/api/v1/chat-runs/{run_id}/snapshot")
    assert snapshot.status_code == 200
    snap = snapshot.json()
    assert snap["runId"] == run_id
    assert any(e["type"] == "queue.changed" for e in snap["events"])


# @lat: [[tests#Chat Runtime v2#Interaction respond]]
@pytest.mark.asyncio
async def test_interaction_respond(app_client) -> None:
    client, *_ = app_client
    created = await client.post(
        "/api/v1/chat-runs",
        json={"clientRunId": "client-run-ix", "instanceId": "inst"},
    )
    run_id = created.json()["runId"]
    turn = await client.post(
        f"/api/v1/chat-runs/{run_id}/turns",
        json={"clientTurnId": "t-ix", "instanceId": "inst", "message": "need clarify"},
    )
    turn_id = turn.json()["turnId"]

    responded = await client.post(
        f"/api/v1/chat-runs/{run_id}/interactions/req-1/respond",
        json={"turnId": turn_id, "type": "clarify", "answer": "yes"},
    )
    assert responded.status_code == 200
    assert responded.json()["accepted"] is True

    events = (await client.get(f"/api/v1/chat-runs/{run_id}/events")).json()
    assert any(e["type"] == "clarify.resolved" for e in events)

    for _ in range(40):
        types = [e["type"] for e in (await client.get(f"/api/v1/chat-runs/{run_id}/events")).json()]
        if "turn.completed" in types or "turn.cancelled" in types or "turn.failed" in types:
            break
        await asyncio.sleep(0.1)
    await client.post(f"/api/v1/chat-runs/{run_id}/abort", json={})


# @lat: [[tests#Chat Runtime v2#Capability declared]]
@pytest.mark.asyncio
async def test_chat_runtime_v2_capability(app_client) -> None:
    client, *_ = app_client
    caps = await client.get("/api/v1/runtime/capabilities")
    assert caps.status_code == 200
    assert "chat.runtime.v2" in caps.json()["features"]
