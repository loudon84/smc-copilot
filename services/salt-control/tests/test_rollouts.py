from __future__ import annotations

import pytest
from conftest import operator_token


@pytest.mark.asyncio
async def test_rollout_create(client, settings):
    resp = client.post(
        "/salt/v1/rollouts",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json={
            "component": "hermes",
            "version": "0.21.0",
            "ring": "ring0",
            "requestId": "req-ro-1",
            "thresholds": {"minSuccessRate": 0.95},
            "reason": "canary",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rolloutId"].startswith("ro_")
    assert body["state"] == "created"

    got = client.get(
        f"/salt/v1/rollouts/{body['rolloutId']}",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
    )
    assert got.status_code == 200
    assert got.json()["component"] == "hermes"


@pytest.mark.asyncio
async def test_rollout_pause_on_gate_fail(client, settings, repos):
    create = client.post(
        "/salt/v1/rollouts",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json={
            "component": "hermes",
            "version": "0.21.1",
            "ring": "ring0",
            "requestId": "req-ro-gate",
            "thresholds": {"minSuccessRate": 0.99},
            "reason": "canary",
        },
    )
    rid = create.json()["rolloutId"]
    record = await repos.rollouts.get(rid)
    assert record is not None
    record.p0_count = 1
    record.target_count = 10
    record.success_rate = 0.5
    await repos.rollouts.update(record)

    adv = client.post(
        f"/salt/v1/rollouts/{rid}:advance",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json={"requestId": "req-ro-adv", "reason": "try advance"},
    )
    assert adv.status_code == 409
    assert adv.json()["error"]["code"] == "rollout_gate_failed"
    paused = await repos.rollouts.get(rid)
    assert paused is not None
    assert paused.state == "paused"


@pytest.mark.asyncio
async def test_rollout_pause_on_low_success_rate(client, settings, repos):
    create = client.post(
        "/salt/v1/rollouts",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json={
            "component": "hermes",
            "version": "0.21.2",
            "ring": "ring1",
            "requestId": "req-ro-slo",
            "thresholds": {"minSuccessRate": 0.99},
            "reason": "canary",
        },
    )
    rid = create.json()["rolloutId"]
    record = await repos.rollouts.get(rid)
    assert record is not None
    record.target_count = 100
    record.success_rate = 0.98
    record.p0_count = 0
    record.p1_count = 0
    await repos.rollouts.update(record)

    adv = client.post(
        f"/salt/v1/rollouts/{rid}:advance",
        headers={"Authorization": f"Bearer {operator_token(settings)}"},
        json={"requestId": "req-ro-slo-adv", "reason": "try advance"},
    )
    assert adv.status_code == 409
    assert adv.json()["error"]["code"] == "rollout_gate_failed"
