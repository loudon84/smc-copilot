"""Presigned artifact upload client (stub + HTTP placeholder)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol
from uuid import uuid4


@dataclass
class UploadResult:
    artifact_id: str
    remote_url: str
    checksum: str
    bytes_uploaded: int


class ArtifactUploadClient(Protocol):
    async def upload(
        self,
        *,
        upload_url: str,
        data: bytes,
        headers: dict[str, str] | None = None,
        checksum: str,
        artifact_id: str,
    ) -> UploadResult: ...


class StubArtifactUploadClient:
    """Records uploads in memory for tests and offline Stub Center mode."""

    def __init__(self) -> None:
        self.uploads: list[UploadResult] = []

    async def upload(
        self,
        *,
        upload_url: str,
        data: bytes,
        headers: dict[str, str] | None = None,
        checksum: str,
        artifact_id: str,
    ) -> UploadResult:
        _ = headers
        result = UploadResult(
            artifact_id=artifact_id or str(uuid4()),
            remote_url=upload_url,
            checksum=checksum,
            bytes_uploaded=len(data),
        )
        self.uploads.append(result)
        return result


@dataclass
class HttpArtifactUploadClient:
    """Placeholder HTTPS PUT uploader (center not yet available)."""

    timeout_seconds: float = 60.0
    max_bytes: int = field(default=100_000_000)

    async def upload(
        self,
        *,
        upload_url: str,
        data: bytes,
        headers: dict[str, str] | None = None,
        checksum: str,
        artifact_id: str,
    ) -> UploadResult:
        import httpx

        if len(data) > self.max_bytes:
            raise ValueError("artifact exceeds max upload size")
        async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=False) as client:
            resp = await client.put(upload_url, content=data, headers=headers or {})
            if resp.status_code >= 400:
                raise RuntimeError(f"upload failed: {resp.status_code}")
        return UploadResult(
            artifact_id=artifact_id,
            remote_url=upload_url,
            checksum=checksum,
            bytes_uploaded=len(data),
        )
