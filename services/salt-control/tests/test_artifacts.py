from __future__ import annotations

import pytest
from conftest import master_token

from integrations.artifact_store import ArtifactMeta


@pytest.mark.asyncio
async def test_artifact_found(client, artifact_store, settings):
    artifact_store.put(
        ArtifactMeta(
            component="hermes",
            version="0.20.0",
            platform="windows",
            arch="AMD64",
            size=1024,
            sha256="abc123",
            url="https://artifacts.example/hermes-0.20.0.zip",
            manifest_signature="ed25519:sig",
            key_id="key-1",
            rollback_version="0.19.0",
        )
    )
    resp = client.get(
        "/salt/v1/artifacts/hermes/0.20.0",
        headers={"Authorization": f"Bearer {master_token(settings)}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["keyId"] == "key-1"
    assert body["manifestSignature"] == "ed25519:sig"
    assert body["sha256"] == "abc123"


@pytest.mark.asyncio
async def test_artifact_not_found(client, settings):
    resp = client.get(
        "/salt/v1/artifacts/missing/9.9.9",
        headers={"Authorization": f"Bearer {master_token(settings)}"},
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "artifact_not_found"
