"""Remote Task Assignment v2 tests."""

from __future__ import annotations

import pytest

from tests.fakes.service_center import sample_assignment


# @lat: [[tests#Endpoint Sync#Remote task ingest idempotent]]
@pytest.mark.asyncio
async def test_remote_task_idempotent_ingest(enrolled_client) -> None:
    client, _app, center = enrolled_client
    assignment = sample_assignment()
    center.enqueue_assignment(assignment)
    center.enqueue_assignment(assignment)  # same version again after first drain won't matter
    await client.post("/api/v1/sync/now")
    # enqueue duplicate and sync again — ingest uses assignmentId+version unique
    center.enqueue_assignment(assignment)
    await client.post("/api/v1/sync/now")

    listed = await client.get("/api/v1/remote-tasks")
    assert listed.status_code == 200
    rows = listed.json()
    assert len([r for r in rows if r["assignmentId"] == "assignment-001"]) == 1


# @lat: [[tests#Endpoint Sync#Remote task accept claim deliver]]
@pytest.mark.asyncio
async def test_remote_task_accept(enrolled_client) -> None:
    client, _app, center = enrolled_client
    center.enqueue_assignment(sample_assignment())
    await client.post("/api/v1/sync/now")

    listed = await client.get("/api/v1/remote-tasks")
    row_id = listed.json()[0]["id"]
    accepted = await client.post(f"/api/v1/remote-tasks/{row_id}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "delivered"
    assert center.completions

    events = await client.get(f"/api/v1/remote-tasks/{row_id}/events")
    assert events.status_code == 200
    types = [e["eventType"] for e in events.json()]
    assert "task.started" in types or "task.completed" in types or "task.updated" in types


# @lat: [[tests#Endpoint Sync#Remote task cancel]]
@pytest.mark.asyncio
async def test_remote_task_cancel_control(enrolled_client) -> None:
    client, _app, center = enrolled_client
    center.enqueue_assignment(sample_assignment(assignmentId="assignment-cancel"))
    await client.post("/api/v1/sync/now")
    center.enqueue_task_control(assignment_id="assignment-cancel", action="cancel")
    await client.post("/api/v1/sync/now")
    listed = await client.get("/api/v1/remote-tasks")
    row = next(r for r in listed.json() if r["assignmentId"] == "assignment-cancel")
    assert row["status"] == "cancelled"
