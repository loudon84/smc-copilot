"""Resolve trusted Artifact metadata for Salt install/upgrade invocations."""

from __future__ import annotations

from dataclasses import dataclass

from core.config import Settings
from core.errors import ErrorCode, SaltControlError
from db.repositories.interfaces import RepositoryBundle
from integrations.artifact_store import ArtifactStore


@dataclass(frozen=True)
class ArtifactInvocation:
    version: str
    artifact_url: str
    artifact_sha256: str
    artifact_signature: str
    key_id: str
    public_key: str
    hermes_home: str | None = None


async def resolve_artifact_invocation(
    *,
    endpoint_id: str,
    version: str,
    component: str,
    hermes_home: str | None,
    repos: RepositoryBundle,
    store: ArtifactStore,
    settings: Settings,
) -> ArtifactInvocation:
    if not version or version.lower() == "latest":
        raise SaltControlError(ErrorCode.VALIDATION_ERROR, "version required", status_code=400)
    if component != "hermes":
        raise SaltControlError(ErrorCode.VALIDATION_ERROR, "unsupported component", status_code=400)
    endpoint = await repos.endpoints.get(endpoint_id)
    platform = endpoint.platform if endpoint is not None else "windows"
    arch = endpoint.arch if endpoint is not None else "AMD64"
    meta = await store.get_manifest(component, version, platform=platform, arch=arch)
    if meta is None:
        local = await repos.artifacts.get(component, version, platform, arch)
        if local is None:
            raise SaltControlError(ErrorCode.ARTIFACT_NOT_FOUND, "artifact metadata missing", status_code=404)
        url, sha256, signature, key_id = local.url, local.sha256, local.manifest_signature, local.key_id
    else:
        url, sha256, signature, key_id = meta.url, meta.sha256, meta.manifest_signature, meta.key_id
    expected_key = settings.artifact_key_id
    public_key = settings.artifact_public_key
    if not expected_key or not public_key:
        raise SaltControlError(ErrorCode.ARTIFACT_SIGNATURE_INVALID, "trusted artifact key missing", status_code=400)
    if key_id != expected_key:
        raise SaltControlError(ErrorCode.ARTIFACT_SIGNATURE_INVALID, "artifact key id mismatch", status_code=400)
    if not url or not sha256 or not signature:
        raise SaltControlError(
            ErrorCode.ARTIFACT_SIGNATURE_INVALID, "incomplete artifact signature material", status_code=400
        )
    return ArtifactInvocation(
        version=version,
        artifact_url=url,
        artifact_sha256=sha256,
        artifact_signature=signature,
        key_id=key_id,
        public_key=public_key,
        hermes_home=hermes_home,
    )
