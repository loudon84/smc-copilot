from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_job_returns_batch_idempotent(client, seed_token):
    await seed_token("tok-jr")
    enrolled = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-jr",
            "requestId": "req-jr",
            "device": {
                "hostname": "PC-JR",
                "machineGuidHash": "guid-jr",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    ).json()
    cred = enrolled["deviceCredential"]
    eid = enrolled["endpointId"]
    payload = {
        "requestId": "req-jr-batch",
        "items": [
            {
                "jid": "202608120001",
                "endpointId": eid,
                "function": "state.highstate",
                "success": True,
                "payloadRedacted": {"return": {"ok": True}, "token": "should-redact"},
            }
        ],
    }
    headers = {"Authorization": f"Device {cred}"}
    first = client.post("/salt/v1/job-returns:batch", json=payload, headers=headers)
    second = client.post("/salt/v1/job-returns:batch", json=payload, headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["results"][0]["status"] == "accepted"
    assert second.json()["results"][0]["status"] == "duplicate"
