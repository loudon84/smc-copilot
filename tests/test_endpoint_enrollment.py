"""Endpoint enrollment API tests (PRD FR-06–FR-09)."""

from __future__ import annotations

import pytest

from integrations.service_center.auth import generate_device_keypair, sign_message, verify_signature


# @lat: [[tests#Endpoint Sync#Enrollment start and complete]]
@pytest.mark.asyncio
async def test_enrollment_start_and_complete(app_client) -> None:
    client, _sup, _settings, _hub, app = app_client
    start = await client.post(
        "/api/v1/endpoint/enrollment/start",
        json={"enrollmentCode": "ENROLL-42"},
    )
    assert start.status_code == 200
    body = start.json()
    assert body["status"] == "pending"
    assert body["publicKey"]
    assert body["enrollmentId"]

    complete = await client.post(
        "/api/v1/endpoint/enrollment/complete",
        json={"enrollmentCode": "ENROLL-42", "enrollmentId": body["enrollmentId"]},
    )
    assert complete.status_code == 200
    done = complete.json()
    assert done["status"] == "completed"
    assert done["endpointId"].startswith("ep-stub-")

    status = await client.get("/api/v1/endpoint/status")
    assert status.status_code == 200
    st = status.json()
    assert st["syncEnabled"] is True
    assert st["endpointId"] == done["endpointId"]


# @lat: [[tests#Endpoint Sync#Enrollment revoke keeps local usable]]
@pytest.mark.asyncio
async def test_enrollment_revoke(enrolled_client) -> None:
    client, _app, _center = enrolled_client
    revoked = await client.post("/api/v1/endpoint/enrollment/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["syncEnabled"] is False
    status = await client.get("/api/v1/endpoint/status")
    assert status.json()["enrollmentStatus"] == "revoked"


# @lat: [[tests#Endpoint Sync#Device key sign verify]]
def test_device_key_sign_verify() -> None:
    pair = generate_device_keypair()
    msg = b"refresh:ep-1"
    sig = sign_message(pair.private_key_b64, msg)
    assert verify_signature(pair.public_key_b64, msg, sig)
    assert not verify_signature(pair.public_key_b64, b"other", sig)


# @lat: [[tests#Endpoint Sync#Inventory endpoint]]
@pytest.mark.asyncio
async def test_inventory_get(enrolled_client) -> None:
    client, _app, _center = enrolled_client
    inv = await client.get("/api/v1/endpoint/inventory")
    assert inv.status_code == 200
    data = inv.json()
    assert "snapshot" in data
    assert "macAddress" not in data["snapshot"]
