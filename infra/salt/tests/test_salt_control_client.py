"""Tests for SaltControlClient (httpx MockTransport)."""

from __future__ import annotations

import json

import httpx
import pytest

from client.device_credential import DeviceCredentialStore
from client.salt_control_client import DeviceInfo, SaltControlClient


def test_create_enrollment_and_store_credential(tmp_path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/salt/v1/enrollments"
        body = json.loads(request.content.decode())
        assert body["enrollmentToken"] == "tok-live"
        assert "requestId" in body
        return httpx.Response(
            200,
            json={
                "enrollmentId": "enr_abc",
                "endpointId": "ep_serverIssued01",
                "masters": ["salt-a.internal", "salt-b.internal"],
                "masterFingerprints": ["sha256:aaaa"],
                "deviceCredential": "opaque-secret-value",
                "expiresAt": "2099-01-01T00:00:00Z",
            },
        )

    store = DeviceCredentialStore(tmp_path / "device.dat", force_file_backend=True)
    transport = httpx.MockTransport(handler)
    with SaltControlClient("https://salt-control.example", transport=transport, credential_store=store) as client:
        result = client.create_enrollment(
            "tok-live",
            DeviceInfo(hostname="PC-1", machine_guid_hash="abc", windows_build=26100),
        )
    assert result.endpoint_id == "ep_serverIssued01"
    assert result.masters[0] == "salt-a.internal"
    assert store.load() == "opaque-secret-value"


def test_report_fingerprint_and_get_status() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.path}")
        if request.url.path.endswith("/fingerprint"):
            assert request.headers.get("Authorization", "").startswith("Device ")
            return httpx.Response(200, json={"state": "pending"})
        if request.url.path.endswith("/enr_1"):
            return httpx.Response(200, json={"enrollmentId": "enr_1", "state": "accepted"})
        return httpx.Response(404)

    class MemStore:
        def save(self, credential: str) -> None:
            self.cred = credential

        def load(self) -> str | None:
            return getattr(self, "cred", "cred-1")

    transport = httpx.MockTransport(handler)
    with SaltControlClient("https://sc.example", transport=transport, credential_store=MemStore()) as client:
        reported = client.report_fingerprint("enr_1", endpoint_id="ep_1", fingerprint="aa:bb")
        status = client.get_enrollment("enr_1")
        polled = client.poll_until("enr_1", max_attempts=2, sleep_fn=lambda _: None)
    assert reported["state"] == "pending"
    assert status["state"] == "accepted"
    assert polled["state"] == "accepted"
    assert any(c.startswith("POST ") for c in calls)


def test_rejects_hostname_endpoint_id() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"enrollmentId": "enr_x", "endpointId": "hostname", "masters": []})

    transport = httpx.MockTransport(handler)
    with SaltControlClient("https://sc.example", transport=transport) as client:
        with pytest.raises(ValueError, match="endpointId"):
            client.create_enrollment(
                "tok",
                DeviceInfo(hostname="PC", machine_guid_hash="x", windows_build=1),
            )
