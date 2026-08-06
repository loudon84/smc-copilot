"""Multipart artifact upload with resume support (PRD FR-703)."""

from __future__ import annotations

import json
import math
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from core.config import Settings
from core.logging import get_logger
from runtime.artifacts.streaming_hash import DEFAULT_CHUNK_SIZE, iter_file_chunks

logger = get_logger(__name__)

DEFAULT_PART_SIZE = 5 * 1024 * 1024


@dataclass
class UploadPart:
    part_number: int
    etag: str | None = None
    size_bytes: int = 0
    uploaded_at: str | None = None


@dataclass
class MultipartSession:
    session_id: str
    artifact_id: str
    upload_id: str
    file_path: str
    total_size: int
    part_size: int
    parts: list[UploadPart] = field(default_factory=list)
    status: str = "initiated"
    checksum: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


class MultipartUploadStore(Protocol):
    async def save_session(self, session: MultipartSession) -> None: ...
    async def get_session(self, session_id: str) -> MultipartSession | None: ...
    async def update_part(self, session_id: str, part: UploadPart) -> None: ...


class InMemoryMultipartStore:
    def __init__(self) -> None:
        self._sessions: dict[str, MultipartSession] = {}

    async def save_session(self, session: MultipartSession) -> None:
        self._sessions[session.session_id] = session

    async def get_session(self, session_id: str) -> MultipartSession | None:
        return self._sessions.get(session_id)

    async def update_part(self, session_id: str, part: UploadPart) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            return
        for i, existing in enumerate(session.parts):
            if existing.part_number == part.part_number:
                session.parts[i] = part
                return
        session.parts.append(part)


class FileMultipartStore:
    """Persist multipart sessions to disk for restart resume."""

    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        return self._root / f"{session_id}.json"

    async def save_session(self, session: MultipartSession) -> None:
        self._path(session.session_id).write_text(
            json.dumps(
                {
                    "sessionId": session.session_id,
                    "artifactId": session.artifact_id,
                    "uploadId": session.upload_id,
                    "filePath": session.file_path,
                    "totalSize": session.total_size,
                    "partSize": session.part_size,
                    "parts": [
                        {
                            "partNumber": p.part_number,
                            "etag": p.etag,
                            "sizeBytes": p.size_bytes,
                            "uploadedAt": p.uploaded_at,
                        }
                        for p in session.parts
                    ],
                    "status": session.status,
                    "checksum": session.checksum,
                    "createdAt": session.created_at,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    async def get_session(self, session_id: str) -> MultipartSession | None:
        path = self._path(session_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return MultipartSession(
            session_id=data["sessionId"],
            artifact_id=data["artifactId"],
            upload_id=data["uploadId"],
            file_path=data["filePath"],
            total_size=data["totalSize"],
            part_size=data["partSize"],
            parts=[
                UploadPart(
                    part_number=p["partNumber"],
                    etag=p.get("etag"),
                    size_bytes=p.get("sizeBytes", 0),
                    uploaded_at=p.get("uploadedAt"),
                )
                for p in data.get("parts", [])
            ],
            status=data.get("status", "initiated"),
            checksum=data.get("checksum"),
            created_at=data.get("createdAt", ""),
        )

    async def update_part(self, session_id: str, part: UploadPart) -> None:
        session = await self.get_session(session_id)
        if session is None:
            return
        for i, existing in enumerate(session.parts):
            if existing.part_number == part.part_number:
                session.parts[i] = part
                break
        else:
            session.parts.append(part)
        await self.save_session(session)


class PartUploader(Protocol):
    async def upload_part(
        self,
        *,
        upload_url: str,
        part_number: int,
        data: bytes,
        headers: dict[str, str] | None = None,
    ) -> str: ...


class StubPartUploader:
    async def upload_part(
        self,
        *,
        upload_url: str,
        part_number: int,
        data: bytes,
        headers: dict[str, str] | None = None,
    ) -> str:
        _ = upload_url, headers
        return f"etag-part-{part_number}-{len(data)}"


# @lat: [[runtime-service#Artifact 分块上传]]
class MultipartUploader:
    def __init__(
        self,
        settings: Settings,
        store: MultipartUploadStore,
        part_uploader: PartUploader | None = None,
        *,
        part_size: int = DEFAULT_PART_SIZE,
    ) -> None:
        self._settings = settings
        self._store = store
        self._part_uploader = part_uploader or StubPartUploader()
        self._part_size = part_size

    def needs_multipart(self, size_bytes: int) -> bool:
        return size_bytes >= self._settings.artifact_multipart_threshold_bytes

    def iter_parts(self, path: Path) -> Iterator[tuple[int, bytes]]:
        part_number = 1
        buffer = b""
        for chunk in iter_file_chunks(path, chunk_size=DEFAULT_CHUNK_SIZE):
            buffer += chunk
            while len(buffer) >= self._part_size:
                yield part_number, buffer[: self._part_size]
                buffer = buffer[self._part_size :]
                part_number += 1
        if buffer:
            yield part_number, buffer

    def part_count(self, size_bytes: int) -> int:
        return max(1, math.ceil(size_bytes / self._part_size))

    async def init_session(
        self,
        *,
        artifact_id: str,
        upload_id: str,
        file_path: Path,
        total_size: int,
        checksum: str,
    ) -> MultipartSession:
        session = MultipartSession(
            session_id=str(uuid.uuid4()),
            artifact_id=artifact_id,
            upload_id=upload_id,
            file_path=str(file_path),
            total_size=total_size,
            part_size=self._part_size,
            checksum=checksum,
        )
        await self._store.save_session(session)
        return session

    async def upload_parts(
        self,
        session: MultipartSession,
        *,
        upload_url: str,
        headers: dict[str, str] | None = None,
    ) -> list[UploadPart]:
        path = Path(session.file_path)
        uploaded_etags: dict[int, str] = {p.part_number: p.etag for p in session.parts if p.etag}
        results: list[UploadPart] = []
        for part_number, data in self.iter_parts(path):
            if part_number in uploaded_etags:
                results.append(
                    UploadPart(
                        part_number=part_number,
                        etag=uploaded_etags[part_number],
                        size_bytes=len(data),
                    )
                )
                continue
            etag = await self._part_uploader.upload_part(
                upload_url=upload_url,
                part_number=part_number,
                data=data,
                headers=headers,
            )
            part = UploadPart(
                part_number=part_number,
                etag=etag,
                size_bytes=len(data),
                uploaded_at=datetime.now(UTC).isoformat(),
            )
            await self._store.update_part(session.session_id, part)
            results.append(part)
        session.parts = results
        session.status = "parts_uploaded"
        await self._store.save_session(session)
        return results

    def complete_payload(self, session: MultipartSession) -> dict[str, Any]:
        return {
            "uploadId": session.upload_id,
            "parts": [
                {"partNumber": p.part_number, "etag": p.etag}
                for p in sorted(session.parts, key=lambda x: x.part_number)
            ],
        }
