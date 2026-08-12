from __future__ import annotations

from schemas.common import CamelModel


class ArtifactMetadataResponse(CamelModel):
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
