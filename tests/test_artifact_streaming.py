"""Artifact streaming hash and multipart resume tests (PRD FR-702–703)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from core.config import get_settings
from runtime.artifacts.multipart_upload import FileMultipartStore, MultipartUploader
from runtime.artifacts.streaming_hash import StreamingHasher, hash_file_streaming


# @lat: [[tests#Artifact Streaming#Large file hashed without read_bytes]]
def test_large_file_hashed_without_read_bytes(tmp_path: Path) -> None:
    path = tmp_path / "large.bin"
    # 3 chunks of 1MB
    path.write_bytes(b"\xab" * (1024 * 1024 * 3))

    with patch.object(Path, "read_bytes", side_effect=AssertionError("read_bytes forbidden")):
        checksum, size = hash_file_streaming(path, chunk_size=1024 * 1024)
    assert size == 1024 * 1024 * 3
    assert len(checksum) == 64


# @lat: [[tests#Artifact Streaming#Multipart resume]]
@pytest.mark.asyncio
async def test_multipart_resume(tmp_path: Path) -> None:
    path = tmp_path / "upload.bin"
    path.write_bytes(b"x" * (10 * 1024 * 1024))
    settings = get_settings()
    settings.artifact_multipart_threshold_bytes = 1024
    store = FileMultipartStore(tmp_path / "sessions")
    uploader = MultipartUploader(settings, store, part_size=2 * 1024 * 1024)

    checksum, size = hash_file_streaming(path)
    session = await uploader.init_session(
        artifact_id="art-1",
        upload_id="up-1",
        file_path=path,
        total_size=size,
        checksum=checksum,
    )
    parts = await uploader.upload_parts(session, upload_url="stub://upload", headers={})
    assert len(parts) >= 2

    # Simulate restart: reload session and skip uploaded parts
    reloaded = await store.get_session(session.session_id)
    assert reloaded is not None
    assert len(reloaded.parts) == len(parts)

    parts2 = await uploader.upload_parts(reloaded, upload_url="stub://upload", headers={})
    assert len(parts2) == len(parts)
    assert all(p.etag for p in parts2)


def test_streaming_hasher_incremental(tmp_path: Path) -> None:
    path = tmp_path / "small.txt"
    path.write_bytes(b"hello")
    hasher = StreamingHasher(chunk_size=2)
    one_shot, _ = hash_file_streaming(path, chunk_size=1024)
    for chunk in hasher.iter_file_chunks(path):
        hasher.update(chunk)
    assert hasher.digest_hex() == one_shot
