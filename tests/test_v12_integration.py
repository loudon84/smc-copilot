"""v1.2 integration flows (subset of PRD section 16): Hub pull, local task, Hermes run, approval gate, workbench."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from integrations.team_hub.dto import RemoteAssignmentDTO

_ROOT = Path(__file__).resolve().parent.parent
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", "default"]


@pytest.mark.asyncio
async def test_v12_team_pull_run_and_workbench(app_client) -> None:
    client, supervisor, settings, stub, _ = app_client

    create_profile = await client.post(
        "/api/v1/profiles",
        json={"name": "coder", "type": "coding", "gateway_port": settings.default_gateway_port},
    )
    assert create_profile.status_code == 201
    profile_id = create_profile.json()["id"]
    port = create_profile.json()["gateway_port"]
    supervisor.set_mock_gateway_command(_mock_cmd(port))
    start = await client.post(f"/api/v1/profiles/{profile_id}/start")
    assert start.status_code == 200

    stub.stage(
        RemoteAssignmentDTO(
            remote_task_id="remote-1",
            assignment_id="asg-1",
            title="hello",
            description=None,
            task_type="review_task",
            payload={"input": "integration", "model": "mock-model"},
        )
    )

    pull = await client.post("/api/v1/team-tasks/pull")
    assert pull.status_code == 200
    assert pull.json()["ingested"] == 1

    listed = await client.get("/api/v1/team-tasks")
    assert listed.status_code == 200
    assert len(listed.json()) >= 1

    tasks = await client.get("/api/v1/tasks")
    assert tasks.status_code == 200
    assert len(tasks.json()) >= 1
    task = tasks.json()[0]
    task_id = task["id"]
    assert task["status"] == "approved"

    run = await client.post(f"/api/v1/tasks/{task_id}/run")
    assert run.status_code == 200
    assert run.json()["hermes_run_id"]
    assert run.json()["status"] in {"completed", "synced"}

    ev = await client.get(f"/api/v1/tasks/{task_id}/events")
    assert ev.status_code == 200
    assert len(ev.json()) >= 1

    summary = await client.get("/api/v1/desktop/task-workbench/summary")
    assert summary.status_code == 200
    s = summary.json()
    assert "tasks" in s and "profiles" in s
    assert s["team_sync"]["use_stub"] is True


@pytest.mark.asyncio
async def test_v12_approval_gate_then_run(app_client) -> None:
    client, supervisor, settings, stub, _ = app_client

    create_profile = await client.post(
        "/api/v1/profiles",
        json={"name": "coder2", "type": "coding", "gateway_port": settings.default_gateway_port + 5},
    )
    assert create_profile.status_code == 201
    profile_id = create_profile.json()["id"]
    port = create_profile.json()["gateway_port"]
    supervisor.set_mock_gateway_command(_mock_cmd(port))
    assert (await client.post(f"/api/v1/profiles/{profile_id}/start")).status_code == 200

    stub.stage(
        RemoteAssignmentDTO(
            remote_task_id="remote-2",
            assignment_id="asg-2",
            title="need-ok",
            task_type="coding_task",
            payload={"input": "go", "model": "mock-model"},
        )
    )
    assert (await client.post("/api/v1/team-tasks/pull")).status_code == 200

    tasks = await client.get("/api/v1/tasks")
    task_id = next(t["id"] for t in tasks.json() if t.get("remote_task_id") == "remote-2")
    assert (await client.get(f"/api/v1/tasks/{task_id}")).json()["status"] == "waiting_approval"

    pending = await client.get("/api/v1/approvals/pending")
    assert pending.status_code == 200
    assert pending.json()
    approval_id = pending.json()[0]["id"]

    assert (await client.post(f"/api/v1/approvals/{approval_id}/approve", json={})).status_code == 200
    assert (await client.get(f"/api/v1/tasks/{task_id}")).json()["status"] == "approved"

    run = await client.post(f"/api/v1/tasks/{task_id}/run")
    assert run.status_code == 200
    assert run.json()["status"] in {"completed", "synced"}


@pytest.mark.asyncio
async def test_v12_workspace_validate_path_policy_deny(app_client, tmp_path: Path) -> None:
    client, *_ = app_client
    root = tmp_path / "proj"
    root.mkdir(parents=True, exist_ok=True)
    ws_create = await client.post(
        "/api/v1/workspaces",
        json={
            "name": "w",
            "root_path": str(root.resolve()),
            "type": "project",
            "policy_json": '{"paths": {"deny": ["*secret*"]}}',
        },
    )
    assert ws_create.status_code == 201
    wid = ws_create.json()["id"]

    ok = await client.post(f"/api/v1/workspaces/{wid}/validate-path", json={"path": "src/main.py"})
    assert ok.status_code == 200

    deny = await client.post(f"/api/v1/workspaces/{wid}/validate-path", json={"path": "secret/token"})
    assert deny.status_code == 403
    body = deny.json()
    code = body.get("code") or body.get("error", {}).get("code")
    assert code == "policy_denied"


@pytest.mark.asyncio
async def test_v12_task_routing_patch(app_client) -> None:
    client, *_ = app_client
    before = await client.get("/api/v1/task-routing")
    assert before.status_code == 200
    assert "review_task" in before.json()["rules"]

    patch = await client.patch(
        "/api/v1/task-routing",
        json={"rules": {"review_task": {"profile_type": "coding", "require_approval": True}}},
    )
    assert patch.status_code == 200
    assert patch.json()["rules"]["review_task"]["require_approval"] is True
