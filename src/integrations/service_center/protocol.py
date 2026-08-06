"""Service Center client protocol (PRD §19)."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from integrations.service_center.dto import (
    ChangesResponse,
    ClaimResponse,
    EnrollRequest,
    EnrollResponse,
    ExperienceReviewItem,
    TokenRefreshResponse,
    UploadRequestResponse,
)


@runtime_checkable
class ServiceCenterClient(Protocol):
    async def enroll(self, request: EnrollRequest) -> EnrollResponse: ...

    async def token_refresh(
        self,
        *,
        endpoint_id: str,
        refresh_credential: str,
        device_signature: str,
    ) -> TokenRefreshResponse: ...

    async def heartbeat(self, endpoint_id: str, payload: dict[str, Any]) -> None: ...

    async def inventory(self, endpoint_id: str, snapshot: dict[str, Any]) -> None: ...

    async def get_changes(
        self,
        endpoint_id: str,
        *,
        channel: str,
        cursor: str = "",
    ) -> ChangesResponse: ...

    async def acks(self, endpoint_id: str, message_ids: list[str]) -> None: ...

    async def events_batch(self, endpoint_id: str, events: list[dict[str, Any]]) -> None: ...

    async def claim(self, assignment_id: str, *, endpoint_id: str) -> ClaimResponse: ...

    async def task_heartbeat(self, assignment_id: str, *, lease_id: str) -> ClaimResponse: ...

    async def complete(
        self,
        assignment_id: str,
        *,
        lease_id: str,
        result: dict[str, Any],
    ) -> None: ...

    async def fail(
        self,
        assignment_id: str,
        *,
        lease_id: str,
        error: dict[str, Any],
    ) -> None: ...

    async def upload_request(
        self,
        *,
        assignment_id: str,
        filename: str,
        content_type: str,
        size_bytes: int,
        checksum: str,
    ) -> UploadRequestResponse: ...

    async def upload_complete(self, artifact_id: str, *, checksum: str) -> None: ...

    async def submit_experience_candidate(
        self,
        endpoint_id: str,
        candidate: dict[str, Any],
    ) -> dict[str, Any]: ...

    async def get_experience_reviews(self, endpoint_id: str) -> list[ExperienceReviewItem]: ...
