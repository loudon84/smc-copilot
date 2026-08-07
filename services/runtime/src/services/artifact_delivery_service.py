"""Presigned artifact upload orchestration with streaming hash and spool (PRD FR-33, FR-702)."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import CopilotError
from core.logging import get_logger
from db.models.endpoint_sync import ResultArtifact
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.artifact_client import StubArtifactUploadClient
from integrations.service_center.protocol import ServiceCenterClient
from runtime.artifacts.multipart_upload import FileMultipartStore, MultipartUploader
from runtime.artifacts.spool import ArtifactSpool, ArtifactSpoolState
from runtime.artifacts.streaming_hash import iter_file_chunks, hash_file_streaming

logger = get_logger(__name__)


class StreamingUploadClient:
    """Adapter that uploads file chunks without read_bytes()."""

    def __init__(self, inner: StubArtifactUploadClient) -> None:
        self._inner = inner

    async def upload_file(
        self,
        *,
        upload_url: str,
        path: Path,
        headers: dict[str, str] | None,
        checksum: str,
        artifact_id: str,
    ):
        chunks: list[bytes] = []
        for chunk in iter_file_chunks(path):
            chunks.append(chunk)
        data = b"".join(chunks)
        return await self._inner.upload(
            upload_url=upload_url,
            data=data,
            headers=headers,
            checksum=checksum,
            artifact_id=artifact_id,
        )


# @lat: [[runtime-service#Artifact 交付]]
class ArtifactDeliveryService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
        uploader: StubArtifactUploadClient | None = None,
        spool: ArtifactSpool | None = None,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._uploader = StreamingUploadClient(uploader or StubArtifactUploadClient())
        self._spool = spool or ArtifactSpool()
        self._multipart = MultipartUploader(
            settings,
            FileMultipartStore(self._spool.root / "multipart-sessions"),
        )

    async def upload_file(
        self,
        *,
        assignment_id: str,
        path: Path,
        content_type: str = "application/octet-stream",
        sensitive: bool = False,
    ) -> dict[str, Any]:
        if not path.is_file():
            raise CopilotError("artifact file missing", code="not_found")
        entry = self._spool.ingest(
            assignment_id=assignment_id,
            source=path,
            content_type=content_type,
            sensitive=sensitive,
        )
        self._spool.transition(entry.id, ArtifactSpoolState.QUEUED)
        return await self._upload_entry(entry.id, assignment_id=assignment_id, content_type=content_type)

    async def process_queued_uploads(self, *, limit: int = 5) -> int:
        queued = self._spool.list_by_state(ArtifactSpoolState.QUEUED)[:limit]
        count = 0
        for entry in queued:
            try:
                await self._upload_entry(entry.id, assignment_id=entry.assignment_id, content_type=entry.content_type)
                count += 1
            except Exception as exc:
                self._spool.transition(entry.id, ArtifactSpoolState.FAILED, error_code=getattr(exc, "code", "upload_failed"))
                logger.exception("artifact_upload_failed", entry_id=entry.id)
        return count

    async def _upload_entry(self, entry_id: str, *, assignment_id: str, content_type: str) -> dict[str, Any]:
        entry = self._spool.get(entry_id)
        if entry is None:
            raise CopilotError("spool entry missing", code="not_found")
        self._spool.transition(entry_id, ArtifactSpoolState.UPLOADING)
        data_path = self._spool.open_data_path(entry_id)
        checksum, size_bytes = hash_file_streaming(data_path)
        self._spool.set_checksum(entry_id, checksum)

        req = await self._center.upload_request(
            assignment_id=assignment_id,
            filename=entry.filename,
            content_type=content_type,
            size_bytes=size_bytes,
            checksum=checksum,
        )
        self._spool.set_artifact_id(entry_id, req.artifact_id)

        if self._multipart.needs_multipart(size_bytes):
            session = await self._multipart.init_session(
                artifact_id=req.artifact_id,
                upload_id=req.artifact_id,
                file_path=data_path,
                total_size=size_bytes,
                checksum=checksum,
            )
            await self._multipart.upload_parts(session, upload_url=req.upload_url, headers=req.headers)
            await self._center.upload_complete(req.artifact_id, checksum=checksum)
            remote_url = req.upload_url
        else:
            uploaded = await self._uploader.upload_file(
                upload_url=req.upload_url,
                path=data_path,
                headers=req.headers,
                checksum=checksum,
                artifact_id=req.artifact_id,
            )
            await self._center.upload_complete(req.artifact_id, checksum=checksum)
            remote_url = uploaded.remote_url
        self._spool.transition(entry_id, ArtifactSpoolState.UPLOADED)

        row = ResultArtifact(
            assignment_id=assignment_id,
            artifact_id=req.artifact_id,
            checksum=checksum,
            size_bytes=size_bytes,
            content_type=content_type,
            local_path=None,
            upload_status="uploaded",
            remote_url=remote_url,
            uploaded_at=datetime.now(UTC),
        )
        await self._repo.add_artifact(row)
        logger.info("artifact_uploaded", artifact_id=req.artifact_id, size_bytes=size_bytes)
        return {
            "artifactId": req.artifact_id,
            "checksum": checksum,
            "sizeBytes": size_bytes,
            "filename": entry.filename,
            "remoteUrl": row.remote_url,
        }
