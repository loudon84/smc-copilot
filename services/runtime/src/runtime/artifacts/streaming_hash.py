"""Chunked SHA-256 hashing — forbids loading entire files into memory (PRD FR-702)."""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import BinaryIO

DEFAULT_CHUNK_SIZE = 256 * 1024


# @lat: [[runtime-service#Artifact 流式 Hash]]
class StreamingHasher:
    def __init__(self, *, chunk_size: int = DEFAULT_CHUNK_SIZE) -> None:
        self._chunk_size = chunk_size
        self._digest = hashlib.sha256()
        self._bytes_read = 0

    @property
    def bytes_read(self) -> int:
        return self._bytes_read

    def update(self, chunk: bytes) -> None:
        self._digest.update(chunk)
        self._bytes_read += len(chunk)

    def digest_hex(self) -> str:
        return self._digest.hexdigest()

    def iter_file_chunks(self, path: Path) -> Iterator[bytes]:
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(self._chunk_size)
                if not chunk:
                    break
                yield chunk

    def hash_file(self, path: Path) -> tuple[str, int]:
        for chunk in self.iter_file_chunks(path):
            self.update(chunk)
        return self.digest_hex(), self._bytes_read

    async def hash_async_stream(self, stream: AsyncIterator[bytes]) -> tuple[str, int]:
        async for chunk in stream:
            self.update(chunk)
        return self.digest_hex(), self._bytes_read


def hash_file_streaming(path: Path, *, chunk_size: int = DEFAULT_CHUNK_SIZE) -> tuple[str, int]:
    hasher = StreamingHasher(chunk_size=chunk_size)
    return hasher.hash_file(path)


def iter_file_chunks(path: Path, *, chunk_size: int = DEFAULT_CHUNK_SIZE) -> Iterator[bytes]:
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            yield chunk


def iter_buffer_chunks(data: BinaryIO, *, chunk_size: int = DEFAULT_CHUNK_SIZE) -> Iterator[bytes]:
    while True:
        chunk = data.read(chunk_size)
        if not chunk:
            break
        yield chunk
