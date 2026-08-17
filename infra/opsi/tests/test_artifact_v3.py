from __future__ import annotations

import json
import zipfile
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
except ImportError:  # pragma: no cover
    Ed25519PrivateKey = None

PRODUCT = Path(__file__).resolve().parents[1] / "products" / "smc-hermes-agent"


def _load(name: str, path: Path):
    spec = spec_from_file_location(name, path)
    assert spec and spec.loader
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_envelope_v3_rejects_extra_missing_and_traversal(tmp_path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    module = _load("artifact_v3", PRODUCT / "packaging" / "artifact_v3.py")
    artifact = tmp_path / "hermes.zip"
    with zipfile.ZipFile(artifact, "w") as zf:
        zf.writestr("hermes.exe", b"cli")
        zf.writestr("README.txt", b"ok")
    digest = module.sha256_file(artifact)
    files = module.file_list_from_zip(artifact)
    manifest = {
        "schema": module.MANIFEST_SCHEMA,
        "version": "0.22.0",
        "platform": "windows",
        "architecture": "amd64",
        "entrypoint": "hermes.exe",
        "sha256": digest,
        "cliSha256": "aa" * 32,
        "cliVersion": "0.22.0",
        "packageRevision": "3",
        "keyId": module.RELEASE_KEY_ID,
        "bytes": artifact.stat().st_size,
        "files": files,
        "cliVersionCommand": ["--version"],
        "controllerCompat": "1",
    }
    private = Ed25519PrivateKey.generate()
    public = private.public_key()
    signature = module.sign_envelope(manifest, digest, private)
    module.verify_envelope(manifest, digest, signature, public)
    extract = tmp_path / "extract"
    extract.mkdir()
    with zipfile.ZipFile(artifact) as zf:
        zf.extractall(extract)
    module.verify_extracted_files(extract, files)
    (extract / "extra.bin").write_bytes(b"x")
    with pytest.raises(ValueError, match="mismatch"):
        module.verify_extracted_files(extract, files)
    with zipfile.ZipFile(tmp_path / "evil.zip", "w") as zf:
        zf.writestr("../evil.exe", b"no")
    with pytest.raises(ValueError, match="escapes"):
        module.file_list_from_zip(tmp_path / "evil.zip")
    empty = dict(manifest)
    empty["files"] = []
    with pytest.raises(ValueError, match="files"):
        module.verify_envelope(empty, digest, signature, public)
    json.loads(module.canonical_manifest_bytes(manifest))


def test_python_wheelhouse_requires_metadata(tmp_path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    module = _load("artifact_v3", PRODUCT / "packaging" / "artifact_v3.py")
    artifact = tmp_path / "hermes.zip"
    with zipfile.ZipFile(artifact, "w") as zf:
        zf.writestr("app/hermes_agent-0.20.2-py3-none-any.whl", b"wheel")
        zf.writestr("runtime-build.json", b'{"schema":"smc.hermes.runtime-build.v1"}')
    digest = module.sha256_file(artifact)
    files = module.file_list_from_zip(artifact)
    private = Ed25519PrivateKey.generate()
    public = private.public_key()
    incomplete = {
        "schema": module.MANIFEST_SCHEMA,
        "version": "0.20.2",
        "platform": "windows",
        "architecture": "amd64",
        "entrypoint": "hermes.exe",
        "sha256": digest,
        "cliSha256": "aa" * 32,
        "cliVersion": "0.20.2",
        "packageRevision": "1",
        "keyId": module.RELEASE_KEY_ID,
        "bytes": artifact.stat().st_size,
        "files": files,
        "installType": "python-wheelhouse",
        "controllerCompat": "1",
    }
    signature = module.sign_envelope(incomplete, digest, private)
    with pytest.raises(ValueError, match="runtimeEntrypoint"):
        module.verify_envelope(incomplete, digest, signature, public)
    complete = dict(incomplete)
    complete["runtimeEntrypoint"] = "venv/Scripts/hermes.exe"
    complete["requires"] = {"python": ">=3.12,<3.13", "node": ">=22,<23"}
    complete["profile"] = {"name": "smc-managed", "version": 1}
    complete["runtimeBuildSha256"] = "bb" * 32
    signature = module.sign_envelope(complete, digest, private)
    module.verify_envelope(complete, digest, signature, public)
    payload = json.loads(module.canonical_manifest_bytes(complete))
    assert payload["installType"] == "python-wheelhouse"
    assert payload["runtimeEntrypoint"] == "venv/Scripts/hermes.exe"

