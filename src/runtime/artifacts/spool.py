"""Local artifact spool under HermesRuntime/artifact-spool (PRD FR-701)."""

from __future__ import annotations

import json
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

from core.logging import get_logger
from runtime.artifacts.encryption import ArtifactEncryption
from runtime.platform_paths import default_runtime_data_dir

logger = get_logger(__name__)


class ArtifactSpoolState(StrEnum):
    CREATED = "created"
    QUEUED = "queued"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    FAILED = "failed"
    EXPIRED = "expired"
    DELETED = "deleted"


_VALID_TRANSITIONS: dict[ArtifactSpoolState, set[ArtifactSpoolState]] = {
    ArtifactSpoolState.CREATED: {ArtifactSpoolState.QUEUED, ArtifactSpoolState.DELETED},
    ArtifactSpoolState.QUEUED: {
        ArtifactSpoolState.UPLOADING,
        ArtifactSpoolState.FAILED,
        ArtifactSpoolState.EXPIRED,
        ArtifactSpoolState.DELETED,
    },
    ArtifactSpoolState.UPLOADING: {
        ArtifactSpoolState.UPLOADED,
        ArtifactSpoolState.FAILED,
        ArtifactSpoolState.QUEUED,
        ArtifactSpoolState.DELETED,
    },
    ArtifactSpoolState.UPLOADED: {ArtifactSpoolState.EXPIRED, ArtifactSpoolState.DELETED},
    ArtifactSpoolState.FAILED: {ArtifactSpoolState.QUEUED, ArtifactSpoolState.EXPIRED, ArtifactSpoolState.DELETED},
    ArtifactSpoolState.EXPIRED: {ArtifactSpoolState.DELETED},
    ArtifactSpoolState.DELETED: set(),
}


@dataclass
class ArtifactSpoolEntry:
    id: str
    assignment_id: str
    filename: str
    content_type: str
    size_bytes: int
    checksum: str | None
    state: ArtifactSpoolState
    encrypted: bool = False
    sensitive: bool = False
    artifact_id: str | None = None
    error_code: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


# @lat: [[runtime-service#Artifact Spool]]
class ArtifactSpool:
    def __init__(self, root: Path | None = None) -> None:
        self._root = (root or (default_runtime_data_dir() / "artifact-spool")).resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        self._encryption = ArtifactEncryption(self._root / ".keys")

    @property
    def root(self) -> Path:
        return self._root

    def _meta_path(self, entry_id: str) -> Path:
        return self._root / entry_id / "meta.json"

    def _data_path(self, entry_id: str, *, encrypted: bool) -> Path:
        suffix = ".enc" if encrypted else ".bin"
        return self._root / entry_id / f"data{suffix}"

    def _load_meta(self, entry_id: str) -> ArtifactSpoolEntry:
        meta = json.loads(self._meta_path(entry_id).read_text(encoding="utf-8"))
        return ArtifactSpoolEntry(
            id=meta["id"],
            assignment_id=meta["assignmentId"],
            filename=meta["filename"],
            content_type=meta["contentType"],
            size_bytes=meta["sizeBytes"],
            checksum=meta.get("checksum"),
            state=ArtifactSpoolState(meta["state"]),
            encrypted=meta.get("encrypted", False),
            sensitive=meta.get("sensitive", False),
            artifact_id=meta.get("artifactId"),
            error_code=meta.get("errorCode"),
            created_at=meta.get("createdAt", ""),
            updated_at=meta.get("updatedAt", ""),
        )

    def _save_meta(self, entry: ArtifactSpoolEntry) -> None:
        entry.updated_at = datetime.now(UTC).isoformat()
        path = self._meta_path(entry.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "id": entry.id,
                    "assignmentId": entry.assignment_id,
                    "filename": entry.filename,
                    "contentType": entry.content_type,
                    "sizeBytes": entry.size_bytes,
                    "checksum": entry.checksum,
                    "state": entry.state.value,
                    "encrypted": entry.encrypted,
                    "sensitive": entry.sensitive,
                    "artifactId": entry.artifact_id,
                    "errorCode": entry.error_code,
                    "createdAt": entry.created_at,
                    "updatedAt": entry.updated_at,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    def ingest(
        self,
        *,
        assignment_id: str,
        source: Path,
        content_type: str = "application/octet-stream",
        sensitive: bool = False,
    ) -> ArtifactSpoolEntry:
        entry_id = str(uuid.uuid4())
        entry_dir = self._root / entry_id
        entry_dir.mkdir(parents=True, exist_ok=True)
        dest = self._data_path(entry_id, encrypted=sensitive)
        if sensitive:
            self._encryption.encrypt_file(source, dest)
            encrypted = True
        else:
            shutil.copy2(source, dest)
            encrypted = False
        entry = ArtifactSpoolEntry(
            id=entry_id,
            assignment_id=assignment_id,
            filename=source.name,
            content_type=content_type,
            size_bytes=dest.stat().st_size,
            checksum=None,
            state=ArtifactSpoolState.CREATED,
            encrypted=encrypted,
            sensitive=sensitive,
        )
        self._save_meta(entry)
        logger.info("artifact_spool_ingested", entry_id=entry_id, size_bytes=entry.size_bytes)
        return entry

    def transition(self, entry_id: str, new_state: ArtifactSpoolState, *, error_code: str | None = None) -> ArtifactSpoolEntry:
        entry = self._load_meta(entry_id)
        allowed = _VALID_TRANSITIONS.get(entry.state, set())
        if new_state not in allowed:
            raise ValueError(f"invalid spool transition {entry.state} -> {new_state}")
        entry.state = new_state
        if error_code:
            entry.error_code = error_code
        self._save_meta(entry)
        return entry

    def open_data_path(self, entry_id: str) -> Path:
        entry = self._load_meta(entry_id)
        if entry.encrypted:
            plain = self._root / entry_id / "data.plain"
            if not plain.exists():
                self._encryption.decrypt_file(
                    self._data_path(entry_id, encrypted=True),
                    plain,
                )
            return plain
        return self._data_path(entry_id, encrypted=False)

    def list_by_state(self, state: ArtifactSpoolState) -> list[ArtifactSpoolEntry]:
        entries: list[ArtifactSpoolEntry] = []
        for child in self._root.iterdir():
            meta = child / "meta.json"
            if not meta.is_file():
                continue
            entry = self._load_meta(child.name)
            if entry.state == state:
                entries.append(entry)
        return entries

    def get(self, entry_id: str) -> ArtifactSpoolEntry | None:
        meta = self._meta_path(entry_id)
        if not meta.exists():
            return None
        return self._load_meta(entry_id)

    def set_checksum(self, entry_id: str, checksum: str) -> ArtifactSpoolEntry:
        entry = self._load_meta(entry_id)
        entry.checksum = checksum
        self._save_meta(entry)
        return entry

    def set_artifact_id(self, entry_id: str, artifact_id: str) -> ArtifactSpoolEntry:
        entry = self._load_meta(entry_id)
        entry.artifact_id = artifact_id
        self._save_meta(entry)
        return entry

    def delete_entry(self, entry_id: str) -> None:
        entry_dir = self._root / entry_id
        if entry_dir.exists():
            shutil.rmtree(entry_dir, ignore_errors=True)
        logger.info("artifact_spool_deleted", entry_id=entry_id)
