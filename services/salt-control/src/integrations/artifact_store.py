from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class ArtifactMeta:
    component: str
    version: str
    platform: str
    arch: str
    size: int
    sha256: str
    url: str
    manifest_signature: str
    key_id: str
    rollback_version: str | None = None


class ArtifactStore(Protocol):
    async def get_manifest(
        self, component: str, version: str, *, platform: str = "windows", arch: str = "AMD64"
    ) -> ArtifactMeta | None: ...


class FakeArtifactStore:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str, str, str], ArtifactMeta] = {}

    def put(self, meta: ArtifactMeta) -> None:
        self._items[(meta.component, meta.version, meta.platform, meta.arch)] = meta

    async def get_manifest(
        self, component: str, version: str, *, platform: str = "windows", arch: str = "AMD64"
    ) -> ArtifactMeta | None:
        return self._items.get((component, version, platform, arch))
