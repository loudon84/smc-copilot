"""Salt Control HTTP client for enrollment (v2.2). Uses httpx."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Protocol

import httpx


class DeviceCredentialStore(Protocol):
    def save(self, credential: str) -> None: ...

    def load(self) -> str | None: ...


@dataclass(frozen=True)
class DeviceInfo:
    hostname: str
    machine_guid_hash: str
    windows_build: int
    arch: str = "AMD64"

    def to_payload(self) -> dict[str, Any]:
        return {
            "hostname": self.hostname,
            "machineGuidHash": self.machine_guid_hash,
            "windowsBuild": self.windows_build,
            "arch": self.arch,
        }


@dataclass
class EnrollmentResult:
    enrollment_id: str
    endpoint_id: str
    masters: list[str]
    master_fingerprints: list[str]
    device_credential: str | None
    expires_at: str | None
    raw: dict[str, Any]


class SaltControlClient:
    """POST /salt/v1/enrollments, fingerprint, GET status."""

    def __init__(
        self,
        base_url: str,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 30.0,
        credential_store: DeviceCredentialStore | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.credential_store = credential_store
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            transport=transport,
            headers={"Accept": "application/json"},
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> SaltControlClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def create_enrollment(
        self,
        enrollment_token: str,
        device: DeviceInfo,
        *,
        request_id: str | None = None,
    ) -> EnrollmentResult:
        rid = request_id or str(uuid.uuid4())
        resp = self._client.post(
            "/salt/v1/enrollments",
            json={
                "enrollmentToken": enrollment_token,
                "requestId": rid,
                "device": device.to_payload(),
            },
        )
        resp.raise_for_status()
        body = resp.json()
        endpoint_id = str(body.get("endpointId") or "")
        if not endpoint_id or endpoint_id.lower() in {"hostname", "username"}:
            raise ValueError("endpointId missing or illegal (must be server-issued)")
        credential = body.get("deviceCredential")
        if credential and self.credential_store is not None:
            self.credential_store.save(str(credential))
        return EnrollmentResult(
            enrollment_id=str(body["enrollmentId"]),
            endpoint_id=endpoint_id,
            masters=[str(m) for m in (body.get("masters") or [])],
            master_fingerprints=[str(f) for f in (body.get("masterFingerprints") or [])],
            device_credential=str(credential) if credential else None,
            expires_at=str(body["expiresAt"]) if body.get("expiresAt") else None,
            raw=body,
        )

    def report_fingerprint(
        self,
        enrollment_id: str,
        *,
        endpoint_id: str,
        fingerprint: str,
        request_id: str | None = None,
        device_credential: str | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {}
        cred = device_credential
        if cred is None and self.credential_store is not None:
            cred = self.credential_store.load()
        if cred:
            headers["Authorization"] = f"Device {cred}"
        rid = request_id or str(uuid.uuid4())
        resp = self._client.post(
            f"/salt/v1/enrollments/{enrollment_id}/fingerprint",
            headers=headers,
            json={
                "endpointId": endpoint_id,
                "fingerprint": fingerprint,
                "requestId": rid,
            },
        )
        resp.raise_for_status()
        return resp.json()

    def get_enrollment(self, enrollment_id: str) -> dict[str, Any]:
        resp = self._client.get(f"/salt/v1/enrollments/{enrollment_id}")
        resp.raise_for_status()
        return resp.json()

    def poll_until(
        self,
        enrollment_id: str,
        *,
        terminal: frozenset[str] | set[str] | None = None,
        max_attempts: int = 60,
        sleep_fn: Any = None,
    ) -> dict[str, Any]:
        import time

        done = terminal or frozenset({"accepted", "synced", "highstate", "rejected", "failed", "completed"})
        sleeper = sleep_fn or time.sleep
        last: dict[str, Any] = {}
        for _ in range(max_attempts):
            last = self.get_enrollment(enrollment_id)
            state = str(last.get("state") or last.get("status") or "").lower()
            if state in done:
                return last
            sleeper(1.0)
        return last
