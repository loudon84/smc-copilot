from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_enrollment_happy_path(client, seed_token, masters, app_state):
    await seed_token("tok-happy")
    create = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-happy",
            "requestId": "req-happy",
            "device": {
                "hostname": "PC-HAPPY",
                "machineGuidHash": "guid-happy",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    )
    assert create.status_code == 200
    body = create.json()
    assert body["endpointId"].startswith("ep_")
    assert body["enrollmentId"].startswith("enr_")
    assert body["deviceCredential"]
    # Endpoint ID must NOT be derived from token hash
    assert "tok-happy" not in body["endpointId"]

    endpoint_id = body["endpointId"]
    fingerprint = "sha256:minion-fp-1"
    for master in masters:
        master.add_pending(endpoint_id, fingerprint)

    fp = client.post(
        f"/salt/v1/enrollments/{body['enrollmentId']}/fingerprint",
        headers={"Authorization": f"Device {body['deviceCredential']}"},
        json={
            "endpointId": endpoint_id,
            "minionFingerprint": fingerprint,
            "requestId": "req-fp-1",
        },
    )
    assert fp.status_code == 200, fp.text
    assert fp.json()["state"] == "highstate"
    for master in masters:
        assert endpoint_id in master.accepted


@pytest.mark.asyncio
async def test_enrollment_expired_token(client, seed_token):
    await seed_token("tok-exp", expired=True)
    resp = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-exp",
            "requestId": "req-exp",
            "device": {
                "hostname": "PC-EXP",
                "machineGuidHash": "guid-exp",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "enrollment_token_expired"


@pytest.mark.asyncio
async def test_enrollment_replay_token(client, seed_token):
    await seed_token("tok-replay")
    payload = {
        "enrollmentToken": "tok-replay",
        "requestId": "req-replay-a",
        "device": {
            "hostname": "PC-R1",
            "machineGuidHash": "guid-replay-a",
            "windowsBuild": 26100,
            "arch": "AMD64",
        },
    }
    first = client.post("/salt/v1/enrollments", json=payload)
    assert first.status_code == 200
    second = client.post(
        "/salt/v1/enrollments",
        json={
            **payload,
            "requestId": "req-replay-b",
            "device": {**payload["device"], "machineGuidHash": "guid-replay-b", "hostname": "PC-R2"},
        },
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "enrollment_token_replayed"


@pytest.mark.asyncio
async def test_enrollment_fingerprint_mismatch(client, seed_token, masters):
    await seed_token("tok-fp-mismatch")
    create = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-fp-mismatch",
            "requestId": "req-fp-mm",
            "device": {
                "hostname": "PC-MM",
                "machineGuidHash": "guid-mm",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    )
    body = create.json()
    endpoint_id = body["endpointId"]
    for master in masters:
        master.add_pending(endpoint_id, "sha256:correct")

    resp = client.post(
        f"/salt/v1/enrollments/{body['enrollmentId']}/fingerprint",
        headers={"Authorization": f"Device {body['deviceCredential']}"},
        json={
            "endpointId": endpoint_id,
            "minionFingerprint": "sha256:wrong",
            "requestId": "req-fp-mm-1",
        },
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "minion_fingerprint_mismatch"
    for master in masters:
        assert endpoint_id not in master.accepted


@pytest.mark.asyncio
async def test_enrollment_idempotent_request_id(client, seed_token):
    await seed_token("tok-idem")
    payload = {
        "enrollmentToken": "tok-idem",
        "requestId": "req-idem-same",
        "device": {
            "hostname": "PC-IDEM",
            "machineGuidHash": "guid-idem",
            "windowsBuild": 26100,
            "arch": "AMD64",
        },
    }
    first = client.post("/salt/v1/enrollments", json=payload)
    second = client.post("/salt/v1/enrollments", json=payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["endpointId"] == second.json()["endpointId"]
    assert first.json()["enrollmentId"] == second.json()["enrollmentId"]
