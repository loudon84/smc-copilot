from __future__ import annotations

from core.errors import ErrorCode, SaltControlError
from db.repositories.interfaces import RepositoryBundle
from integrations.artifact_store import ArtifactStore
from schemas.artifact import ArtifactMetadataResponse


class ArtifactService:
    def __init__(self, repos: RepositoryBundle, store: ArtifactStore) -> None:
        self.repos = repos
        self.store = store

    async def get(
        self,
        component: str,
        version: str,
        *,
        platform: str = "windows",
        arch: str = "AMD64",
    ) -> ArtifactMetadataResponse:
        meta = await self.store.get_manifest(component, version, platform=platform, arch=arch)
        if meta is None:
            local = await self.repos.artifacts.get(component, version, platform, arch)
            if local is None:
                raise SaltControlError(ErrorCode.ARTIFACT_NOT_FOUND, "artifact not found", status_code=404)
            return ArtifactMetadataResponse(
                component=local.component,
                version=local.version,
                platform=local.platform,
                arch=local.arch,
                size=local.size,
                sha256=local.sha256,
                url=local.url,
                manifest_signature=local.manifest_signature,
                key_id=local.key_id,
                rollback_version=local.rollback_version,
            )
        return ArtifactMetadataResponse(
            component=meta.component,
            version=meta.version,
            platform=meta.platform,
            arch=meta.arch,
            size=meta.size,
            sha256=meta.sha256,
            url=meta.url,
            manifest_signature=meta.manifest_signature,
            key_id=meta.key_id,
            rollback_version=meta.rollback_version,
        )
