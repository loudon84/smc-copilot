"""Sync protocol, backoff, inbox/outbox tests."""

from __future__ import annotations

import pytest

from integrations.service_center.auth import generate_device_keypair
from runtime.delivery_backoff import compute_backoff_seconds, should_dead_letter
from runtime.sync_protocol import build_envelope, payload_hash, verify_envelope


# @lat: [[tests#Endpoint Sync#Envelope build and verify]]
def test_envelope_build_and_verify() -> None:
    pair = generate_device_keypair()
    env = build_envelope(
        message_type="desired_state.updated",
        payload={"revision": 1},
        endpoint_id="ep-1",
        tenant_id="tenant",
        sequence=1,
        private_key_b64=pair.private_key_b64,
    )
    assert env["protocolVersion"] == "1.0"
    assert env["signature"]
    assert verify_envelope(env, pair.public_key_b64)
    env["payload"]["revision"] = 2
    assert not verify_envelope(env, pair.public_key_b64)


# @lat: [[tests#Endpoint Sync#Payload hash stable]]
def test_payload_hash_stable() -> None:
    assert payload_hash({"b": 1, "a": 2}) == payload_hash({"a": 2, "b": 1})


# @lat: [[tests#Endpoint Sync#Backoff and dead letter]]
def test_backoff_and_dead_letter() -> None:
    d1 = compute_backoff_seconds(1, jitter_ratio=0)
    d2 = compute_backoff_seconds(2, jitter_ratio=0)
    assert d2 == d1 * 2
    assert should_dead_letter(20, 20)
    assert not should_dead_letter(19, 20)


# @lat: [[tests#Endpoint Sync#Sync now pulls desired state]]
@pytest.mark.asyncio
async def test_sync_now_inbox_dedupe(enrolled_client) -> None:
    client, app, center = enrolled_client
    center.enqueue_desired_state(
        revision=7,
        resources=[{"resourceType": "skill", "resourceId": "s1", "version": "1.0.0", "checksum": "x"}],
    )
    # duplicate same message id is not re-queued by stub (queue drained once)
    r1 = await client.post("/api/v1/sync/now")
    assert r1.status_code == 200
    assert r1.json()["pulled"] >= 1
    r2 = await client.post("/api/v1/sync/now")
    assert r2.status_code == 200
    assert r2.json()["pulled"] == 0

    status = await client.get("/api/v1/sync/status")
    assert status.status_code == 200
    assert status.json()["syncEnabled"] is True
