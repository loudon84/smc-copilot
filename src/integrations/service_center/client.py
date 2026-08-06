"""Service Center clients: Stub (default) + Http (contract-aligned placeholder)."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from core.config import Settings
from core.errors import ServiceCenterError
from core.logging import get_logger
from integrations.service_center.dto import (
    ChangesResponse,
    ClaimResponse,
    EnrollRequest,
    EnrollResponse,
    ExperienceReviewItem,
    TokenRefreshResponse,
    UploadRequestResponse,
)

logger = get_logger(__name__)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


class StubServiceCenterClient:
    """In-memory Service Center for local/dev/tests. Deterministic and scriptable."""

    def __init__(self) -> None:
        self.enrolled: dict[str, dict[str, Any]] = {}
        self.refresh_creds: dict[str, str] = {}
        self.heartbeats: list[dict[str, Any]] = []
        self.inventories: list[dict[str, Any]] = []
        self.ack_records: list[tuple[str, list[str]]] = []
        self.event_log: list[dict[str, Any]] = []
        self.claim_log: list[str] = []
        self.completions: list[dict[str, Any]] = []
        self.failures: list[dict[str, Any]] = []
        self.uploads: list[dict[str, Any]] = []
        self.experience_submissions: list[dict[str, Any]] = []
        self._channel_queues: dict[str, list[dict[str, Any]]] = {}
        self._reviews: dict[str, list[ExperienceReviewItem]] = {}
        self._leases: dict[str, ClaimResponse] = {}
        self._next_endpoint_seq = 1

    # --- test scripting helpers ---

    def enqueue_change(self, channel: str, envelope: dict[str, Any]) -> None:
        self._channel_queues.setdefault(channel, []).append(envelope)

    def enqueue_desired_state(self, *, revision: int, resources: list[dict[str, Any]], **extra: Any) -> str:
        message_id = str(uuid4())
        payload = {
            "revision": revision,
            "generatedAt": _iso(_utcnow()),
            "resources": resources,
            "policies": extra.get("policies", {}),
            "removedResources": extra.get("removed_resources", []),
        }
        envelope = {
            "protocolVersion": "1.0",
            "messageId": message_id,
            "idempotencyKey": f"desired-state-{revision}",
            "messageType": "desired_state.updated",
            "sequence": revision,
            "payload": payload,
            "signature": "stub",
        }
        self.enqueue_change("desired_state", envelope)
        return message_id

    def enqueue_assignment(self, assignment: dict[str, Any]) -> str:
        message_id = str(uuid4())
        envelope = {
            "protocolVersion": "1.0",
            "messageId": message_id,
            "idempotencyKey": f"{assignment.get('assignmentId')}:{assignment.get('assignmentVersion', 1)}",
            "messageType": "task.assignment",
            "sequence": int(assignment.get("assignmentVersion") or 1),
            "payload": assignment,
            "signature": "stub",
        }
        self.enqueue_change("task_assignment", envelope)
        return message_id

    def enqueue_task_control(self, *, assignment_id: str, action: str, **extra: Any) -> str:
        message_id = str(uuid4())
        envelope = {
            "protocolVersion": "1.0",
            "messageId": message_id,
            "idempotencyKey": f"control-{assignment_id}-{action}-{message_id}",
            "messageType": f"task.control.{action}",
            "sequence": 0,
            "payload": {"assignmentId": assignment_id, "action": action, **extra},
            "signature": "stub",
        }
        self.enqueue_change("task_control", envelope)
        return message_id

    def set_experience_review(self, endpoint_id: str, candidate_id: str, status: str, **detail: Any) -> None:
        item = ExperienceReviewItem(candidate_id=candidate_id, status=status, detail=detail)
        self._reviews.setdefault(endpoint_id, []).append(item)

    # --- protocol ---

    async def enroll(self, request: EnrollRequest) -> EnrollResponse:
        endpoint_id = f"ep-stub-{self._next_endpoint_seq:04d}"
        self._next_endpoint_seq += 1
        refresh = f"refresh-{uuid4().hex}"
        expires = _utcnow() + timedelta(minutes=30)
        access = f"access-{uuid4().hex}"
        self.enrolled[endpoint_id] = {
            "public_key_b64": request.public_key_b64,
            "device_id": request.device_id,
            "tenant_id": request.tenant_hint or "tenant-stub",
            "enrollment_code": request.enrollment_code,
        }
        self.refresh_creds[endpoint_id] = refresh
        return EnrollResponse(
            endpoint_id=endpoint_id,
            tenant_id=request.tenant_hint or "tenant-stub",
            access_token=access,
            access_token_expires_at=_iso(expires),
            refresh_credential=refresh,
            certificate_thumbprint=hashlib.sha256(request.public_key_b64.encode()).hexdigest()[:40],
        )

    async def token_refresh(
        self,
        *,
        endpoint_id: str,
        refresh_credential: str,
        device_signature: str,
    ) -> TokenRefreshResponse:
        _ = device_signature
        if endpoint_id not in self.enrolled:
            raise ServiceCenterError("endpoint not enrolled", code="endpoint_not_found")
        if self.refresh_creds.get(endpoint_id) != refresh_credential:
            raise ServiceCenterError("invalid refresh credential", code="invalid_refresh")
        expires = _utcnow() + timedelta(minutes=30)
        return TokenRefreshResponse(
            access_token=f"access-{uuid4().hex}",
            access_token_expires_at=_iso(expires),
            refresh_credential=refresh_credential,
        )

    async def heartbeat(self, endpoint_id: str, payload: dict[str, Any]) -> None:
        self.heartbeats.append({"endpoint_id": endpoint_id, "payload": payload, "at": _iso(_utcnow())})

    async def inventory(self, endpoint_id: str, snapshot: dict[str, Any]) -> None:
        self.inventories.append({"endpoint_id": endpoint_id, "snapshot": snapshot, "at": _iso(_utcnow())})

    async def get_changes(
        self,
        endpoint_id: str,
        *,
        channel: str,
        cursor: str = "",
    ) -> ChangesResponse:
        _ = endpoint_id, cursor
        queue = self._channel_queues.get(channel, [])
        items = list(queue)
        self._channel_queues[channel] = []
        next_cursor = items[-1]["messageId"] if items else cursor
        return ChangesResponse(items=items, next_cursor=next_cursor or "", has_more=False)

    async def acks(self, endpoint_id: str, message_ids: list[str]) -> None:
        self.ack_records.append((endpoint_id, list(message_ids)))

    async def events_batch(self, endpoint_id: str, events: list[dict[str, Any]]) -> None:
        for ev in events:
            self.event_log.append({"endpoint_id": endpoint_id, **ev})

    async def claim(self, assignment_id: str, *, endpoint_id: str) -> ClaimResponse:
        _ = endpoint_id
        self.claim_log.append(assignment_id)
        lease = ClaimResponse(
            lease_id=str(uuid4()),
            expires_at=_iso(_utcnow() + timedelta(seconds=300)),
            heartbeat_interval_seconds=60,
        )
        self._leases[assignment_id] = lease
        return lease

    async def task_heartbeat(self, assignment_id: str, *, lease_id: str) -> ClaimResponse:
        existing = self._leases.get(assignment_id)
        if existing is None or existing.lease_id != lease_id:
            raise ServiceCenterError("lease not found", code="lease_not_found")
        renewed = ClaimResponse(
            lease_id=lease_id,
            expires_at=_iso(_utcnow() + timedelta(seconds=300)),
            heartbeat_interval_seconds=existing.heartbeat_interval_seconds,
        )
        self._leases[assignment_id] = renewed
        return renewed

    async def complete(
        self,
        assignment_id: str,
        *,
        lease_id: str,
        result: dict[str, Any],
    ) -> None:
        self.completions.append({"assignment_id": assignment_id, "lease_id": lease_id, "result": result})

    async def fail(
        self,
        assignment_id: str,
        *,
        lease_id: str,
        error: dict[str, Any],
    ) -> None:
        self.failures.append({"assignment_id": assignment_id, "lease_id": lease_id, "error": error})

    async def upload_request(
        self,
        *,
        assignment_id: str,
        filename: str,
        content_type: str,
        size_bytes: int,
        checksum: str,
    ) -> UploadRequestResponse:
        artifact_id = str(uuid4())
        resp = UploadRequestResponse(
            artifact_id=artifact_id,
            upload_url=f"stub://upload/{artifact_id}/{filename}",
            headers={"Content-Type": content_type},
            expires_at=_iso(_utcnow() + timedelta(hours=1)),
        )
        self.uploads.append(
            {
                "assignment_id": assignment_id,
                "artifact_id": artifact_id,
                "checksum": checksum,
                "size_bytes": size_bytes,
                "status": "requested",
            }
        )
        return resp

    async def upload_complete(self, artifact_id: str, *, checksum: str) -> None:
        for u in self.uploads:
            if u["artifact_id"] == artifact_id:
                u["status"] = "complete"
                u["checksum"] = checksum
                return
        self.uploads.append({"artifact_id": artifact_id, "checksum": checksum, "status": "complete"})

    async def submit_experience_candidate(
        self,
        endpoint_id: str,
        candidate: dict[str, Any],
    ) -> dict[str, Any]:
        submission_id = str(uuid4())
        record = {
            "endpoint_id": endpoint_id,
            "submission_id": submission_id,
            "candidate": candidate,
            "status": "received",
        }
        self.experience_submissions.append(record)
        return {"submissionId": submission_id, "status": "received"}

    async def get_experience_reviews(self, endpoint_id: str) -> list[ExperienceReviewItem]:
        items = list(self._reviews.get(endpoint_id, []))
        self._reviews[endpoint_id] = []
        return items


class HttpServiceCenterClient:
    """HTTPS client aligned to PRD §19. Not the default until Center is ready."""

    def __init__(
        self,
        base_url: str,
        *,
        domain_allowlist: list[str] | None = None,
        timeout_seconds: float = 30.0,
        max_response_bytes: int = 2_000_000,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._allowlist = {h.lower() for h in (domain_allowlist or []) if h}
        self._timeout = timeout_seconds
        self._max_response_bytes = max_response_bytes
        self._access_token: str | None = None
        self._validate_base()

    def _validate_base(self) -> None:
        parsed = urlparse(self._base)
        if parsed.scheme != "https":
            raise ServiceCenterError("Service Center base URL must be HTTPS", code="insecure_url")
        host = (parsed.hostname or "").lower()
        if self._allowlist and host not in self._allowlist:
            raise ServiceCenterError(f"host {host} not in allowlist", code="domain_not_allowed")

    def set_access_token(self, token: str | None) -> None:
        self._access_token = token

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Accept": "application/json"}
        if self._access_token:
            h["Authorization"] = f"Bearer {self._access_token}"
        return h

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self._base}{path}"
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=False) as client:
            resp = await client.request(method, url, headers=self._headers(), **kwargs)
            if resp.status_code >= 400:
                raise ServiceCenterError(f"{method} {path} failed: {resp.status_code} {resp.text[:200]}")
            if len(resp.content) > self._max_response_bytes:
                raise ServiceCenterError("response too large", code="response_too_large")
            if not resp.content:
                return None
            return resp.json()

    async def enroll(self, request: EnrollRequest) -> EnrollResponse:
        data = await self._request(
            "POST",
            "/api/v1/endpoints/enroll",
            json={
                "enrollmentCode": request.enrollment_code,
                "publicKey": request.public_key_b64,
                "deviceId": request.device_id,
                "machineIdHash": request.machine_id_hash,
                "runtimeVersion": request.runtime_version,
                "osVersion": request.os_version,
                "architecture": request.architecture,
                "userId": request.user_id,
                "tenantHint": request.tenant_hint,
            },
        )
        token = str(data["accessToken"])
        self.set_access_token(token)
        return EnrollResponse(
            endpoint_id=str(data["endpointId"]),
            tenant_id=str(data.get("tenantId") or ""),
            access_token=token,
            access_token_expires_at=str(data["accessTokenExpiresAt"]),
            refresh_credential=str(data["refreshCredential"]),
            certificate_thumbprint=data.get("certificateThumbprint"),
        )

    async def token_refresh(
        self,
        *,
        endpoint_id: str,
        refresh_credential: str,
        device_signature: str,
    ) -> TokenRefreshResponse:
        data = await self._request(
            "POST",
            "/api/v1/endpoints/token/refresh",
            json={
                "endpointId": endpoint_id,
                "refreshCredential": refresh_credential,
                "deviceSignature": device_signature,
            },
        )
        token = str(data["accessToken"])
        self.set_access_token(token)
        return TokenRefreshResponse(
            access_token=token,
            access_token_expires_at=str(data["accessTokenExpiresAt"]),
            refresh_credential=data.get("refreshCredential"),
        )

    async def heartbeat(self, endpoint_id: str, payload: dict[str, Any]) -> None:
        await self._request("POST", f"/api/v1/endpoints/{endpoint_id}/heartbeat", json=payload)

    async def inventory(self, endpoint_id: str, snapshot: dict[str, Any]) -> None:
        await self._request("POST", f"/api/v1/endpoints/{endpoint_id}/inventory", json=snapshot)

    async def get_changes(
        self,
        endpoint_id: str,
        *,
        channel: str,
        cursor: str = "",
    ) -> ChangesResponse:
        data = await self._request(
            "GET",
            f"/api/v1/endpoints/{endpoint_id}/changes",
            params={"channel": channel, "cursor": cursor},
        )
        return ChangesResponse(
            items=list(data.get("items") or []),
            next_cursor=str(data.get("nextCursor") or ""),
            has_more=bool(data.get("hasMore")),
        )

    async def acks(self, endpoint_id: str, message_ids: list[str]) -> None:
        await self._request(
            "POST",
            f"/api/v1/endpoints/{endpoint_id}/acks",
            json={"messageIds": message_ids},
        )

    async def events_batch(self, endpoint_id: str, events: list[dict[str, Any]]) -> None:
        await self._request(
            "POST",
            f"/api/v1/endpoints/{endpoint_id}/events/batch",
            json={"events": events},
        )

    async def claim(self, assignment_id: str, *, endpoint_id: str) -> ClaimResponse:
        data = await self._request(
            "POST",
            f"/api/v1/task-assignments/{assignment_id}/claim",
            json={"endpointId": endpoint_id},
        )
        return ClaimResponse(
            lease_id=str(data["leaseId"]),
            expires_at=str(data["expiresAt"]),
            heartbeat_interval_seconds=int(data.get("heartbeatIntervalSeconds") or 60),
        )

    async def task_heartbeat(self, assignment_id: str, *, lease_id: str) -> ClaimResponse:
        data = await self._request(
            "POST",
            f"/api/v1/task-assignments/{assignment_id}/heartbeat",
            json={"leaseId": lease_id},
        )
        return ClaimResponse(
            lease_id=str(data.get("leaseId") or lease_id),
            expires_at=str(data["expiresAt"]),
            heartbeat_interval_seconds=int(data.get("heartbeatIntervalSeconds") or 60),
        )

    async def complete(
        self,
        assignment_id: str,
        *,
        lease_id: str,
        result: dict[str, Any],
    ) -> None:
        await self._request(
            "POST",
            f"/api/v1/task-assignments/{assignment_id}/complete",
            json={"leaseId": lease_id, "result": result},
        )

    async def fail(
        self,
        assignment_id: str,
        *,
        lease_id: str,
        error: dict[str, Any],
    ) -> None:
        await self._request(
            "POST",
            f"/api/v1/task-assignments/{assignment_id}/fail",
            json={"leaseId": lease_id, "error": error},
        )

    async def upload_request(
        self,
        *,
        assignment_id: str,
        filename: str,
        content_type: str,
        size_bytes: int,
        checksum: str,
    ) -> UploadRequestResponse:
        data = await self._request(
            "POST",
            "/api/v1/artifacts/upload-request",
            json={
                "assignmentId": assignment_id,
                "filename": filename,
                "contentType": content_type,
                "sizeBytes": size_bytes,
                "checksum": checksum,
            },
        )
        return UploadRequestResponse(
            artifact_id=str(data["artifactId"]),
            upload_url=str(data["uploadUrl"]),
            headers=dict(data.get("headers") or {}),
            expires_at=data.get("expiresAt"),
        )

    async def upload_complete(self, artifact_id: str, *, checksum: str) -> None:
        await self._request(
            "POST",
            f"/api/v1/artifacts/{artifact_id}/complete",
            json={"checksum": checksum},
        )

    async def submit_experience_candidate(
        self,
        endpoint_id: str,
        candidate: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            f"/api/v1/endpoints/{endpoint_id}/experience-candidates",
            json=candidate,
        )

    async def get_experience_reviews(self, endpoint_id: str) -> list[ExperienceReviewItem]:
        data = await self._request("GET", f"/api/v1/endpoints/{endpoint_id}/experience-reviews")
        items = data if isinstance(data, list) else (data or {}).get("items") or []
        out: list[ExperienceReviewItem] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            out.append(
                ExperienceReviewItem(
                    candidate_id=str(it.get("candidateId") or ""),
                    status=str(it.get("status") or ""),
                    detail=dict(it.get("detail") or {}),
                )
            )
        return out


def create_service_center_client(settings: Settings) -> StubServiceCenterClient | HttpServiceCenterClient:
    if settings.service_center_use_stub or not (settings.service_center_base_url or "").strip():
        logger.info("service_center_using_stub")
        return StubServiceCenterClient()
    allowlist = [x.strip() for x in (settings.service_center_domain_allowlist or "").split(",") if x.strip()]
    return HttpServiceCenterClient(settings.service_center_base_url, domain_allowlist=allowlist)
