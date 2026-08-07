"""Remote Task Assignment v2 tests."""

from __future__ import annotations

import pytest
from fakes.service_center import sample_assignment


# @lat: [[tests#Remote Tasks#Assignment idempotent ingest]]
@pytest.mark.asyncio
async def test_assignment_idempotent_and_accept(enrolled_client) -> None:
    client, _app, center = enrolled_client
    center.enqueue_assignment(sample_assignment())
    r1 = await client.post("/api/v1/sync/now")
    assert r1.status_code == 200
    center.enqueue_assignment(sample_assignment())
    await client.post("/api/v1/sync/now")

    listed = await client.get("/api/v1/remote-tasks")
    assert listed.status_code == 200
    rows = listed.json()
    assert len([r for r in rows if r["assignmentId"] == "assignment-001"]) == 1

    task_id = rows[0]["id"]
    accept = await client.post(f"/api/v1/remote-tasks/{task_id}/accept")
    assert accept.status_code == 200
    assert accept.json()["status"] == "delivered"
    assert "assignment-001" in center.claim_log
    assert any(c["assignment_id"] == "assignment-001" for c in center.completions)


# @lat: [[tests#Remote Tasks#Reject assignment]]
@pytest.mark.asyncio
async def test_assignment_reject(enrolled_client) -> None:
    client, _app, center = enrolled_client
    center.enqueue_assignment(sample_assignment(assignmentId="assignment-reject", taskId="t-reject"))
    await client.post("/api/v1/sync/now")
    rows = (await client.get("/api/v1/remote-tasks")).json()
    row = next(r for r in rows if r["assignmentId"] == "assignment-reject")
    rejected = await client.post(f"/api/v1/remote-tasks/{row['id']}/reject", json={"reason": "busy"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
