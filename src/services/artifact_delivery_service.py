"""Presigned artifact upload orchestration (PRD FR-33)."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import CopilotError
from db.models.endpoint_sync import ResultArtifact
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.artifact_client import StubArtifactUploadClient
from integrations.service_center.protocol import ServiceCenterClient


class ArtifactDeliveryService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
        uploader: StubArtifactUploadClient | None = None,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._uploader = uploader or StubArtifactUploadClient()

    async def upload_file(
        self,
        *,
        assignment_id: str,
        path: Path,
        content_type: str = "application/octet-stream",
    ) -> dict[str, Any]:
        if not path.is_file():
            raise CopilotError("artifact file missing", code="not_found")
        # Forbid uploading absolute local path strings as part of manifest to center
        data = path.read_bytes()
        checksum = hashlib.sha256(data).hexdigest()
        req = await self._center.upload_request(
            assignment_id=assignment_id,
            filename=path.name,
            content_type=content_type,
            size_bytes=len(data),
            checksum=checksum,
        )
        uploaded = await self._uploader.upload(
            upload_url=req.upload_url,
            data=data,
            headers=req.headers,
            checksum=checksum,
            artifact_id=req.artifact_id,
        )
        await self._center.upload_complete(req.artifact_id, checksum=checksum)
        row = ResultArtifact(
            assignment_id=assignment_id,
            artifact_id=req.artifact_id,
            checksum=checksum,
            size_bytes=len(data),
            content_type=content_type,
            local_path=None,  # never store/report absolute path to center payloads
            upload_status="uploaded",
            remote_url=uploaded.remote_url,
            uploaded_at=datetime.now(UTC),
        )
        await self._repo.add_artifact(row)
        return {
            "artifactId": req.artifact_id,
            "checksum": checksum,
            "sizeBytes": len(data),
            "filename": path.name,
            "remoteUrl": uploaded.remote_url,
        }
