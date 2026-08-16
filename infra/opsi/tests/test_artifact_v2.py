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


def test_smoke_does_not_rewrite_source_key_or_emit_opsi(tmp_path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    module = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    source_pub = PRODUCT / "CLIENT_DATA" / "keys" / "release-public-key.pem"
    before = source_pub.read_bytes() if source_pub.exists() else None
    archive = module.build_smoke(tmp_path)
    after = source_pub.read_bytes() if source_pub.exists() else None
    assert before == after
    assert archive.name.endswith(".smoke.zip")
    assert not archive.name.endswith(".opsi")
    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
    assert not any(name.endswith("release-private-key.pem") for name in names)
    assert module.SMOKE_KEY_ID != module.RELEASE_KEY_ID
    assert module.SMOKE_KEY_ID.startswith("TEST-ONLY")


def test_release_refuses_missing_inputs(tmp_path):
    module = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    with pytest.raises(SystemExit):
        module.build_release(tmp_path, tmp_path / "missing.zip", tmp_path / "missing.pem")


def test_envelope_v2_negative_vectors(tmp_path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    module = _load("artifact_v2", PRODUCT / "packaging" / "artifact_v2.py")

    artifact = tmp_path / "hermes.zip"
    with zipfile.ZipFile(artifact, "w") as zf:
        zf.writestr("hermes.exe", b"cli")
    digest = module.sha256_file(artifact)
    manifest = {
        "schema": module.MANIFEST_SCHEMA,
        "version": "0.22.0",
        "platform": "windows",
        "architecture": "amd64",
        "entrypoint": "hermes.exe",
        "sha256": digest,
        "cliSha256": "aa" * 32,
        "cliVersion": "0.22.0",
        "packageRevision": "2",
        "keyId": module.RELEASE_KEY_ID,
        "bytes": artifact.stat().st_size,
    }
    private = Ed25519PrivateKey.generate()
    public = private.public_key()
    signature = module.sign_envelope(manifest, digest, private)
    module.verify_envelope(manifest, digest, signature, public)

    tampered = dict(manifest)
    tampered["entrypoint"] = "..\\evil.exe"
    with pytest.raises(Exception):
        module.verify_envelope(tampered, digest, signature, public)
    with pytest.raises(ValueError):
        module.validate_entrypoint("C:\\Windows\\hermes.exe")
    with pytest.raises(ValueError):
        module.validate_entrypoint("..\\hermes.exe")
    other = Ed25519PrivateKey.generate().public_key()
    with pytest.raises(Exception):
        module.verify_envelope(manifest, digest, signature, other)
    wrong_digest = "ff" * 32
    with pytest.raises(Exception):
        module.verify_envelope(manifest, wrong_digest, signature, public)
    with pytest.raises(Exception):
        module.verify_envelope(manifest, digest, signature[:-1] + bytes([signature[-1] ^ 1]), public)


def test_install_verifies_before_expand():
    text = (PRODUCT / "scripts" / "install" / "Install-Hermes.ps1").read_text(encoding="utf-8")
    verify_at = text.index("Assert-SmcArtifactSignature")
    expand_at = text.index("Expand-Archive")
    assert verify_at < expand_at
    assert "Get-Command hermes" not in text
    assert "untrusted artifact keyId" in text


def test_scripts_forbid_local_client_and_use_resolver():
    init = (PRODUCT / "bootstrap" / "user" / "Initialize-HermesHome.ps1").read_text(encoding="utf-8")
    assert "clientId=local is forbidden" in init
    assert "Resolve-SmcHermesCli" in init
    assert "Get-Command hermes" not in init
    register = (PRODUCT / "bootstrap" / "machine" / "Register-UserBootstrap.ps1").read_text(encoding="utf-8")
    assert "SMC-Hermes-User-Bootstrap-" in register
    assert "SMC-Hermes-Gateway-" in register
    assert "Register-SmcManagedTask" in register
    uninstall = (PRODUCT / "scripts" / "install" / "Uninstall-OpsiManaged.ps1").read_text(encoding="utf-8")
    assert "Remove-SmcManagedTask" in uninstall
    assert "bootstrapTask" in uninstall
    assert "gatewayTask" in uninstall
    status = (PRODUCT / "scripts" / "health" / "Get-HermesStatus.ps1").read_text(encoding="utf-8")
    assert "clientId=local forbidden" in status
    module = (PRODUCT / "scripts" / "common" / "SmcOpsi.psm1").read_text(encoding="utf-8")
    assert "function Resolve-SmcHermesCli" in module
    assert "function Assert-SmcArtifactSignature" in module


def test_canonical_manifest_is_stable():
    module = _load("artifact_v2", PRODUCT / "packaging" / "artifact_v2.py")
    manifest = {
        "schema": module.MANIFEST_SCHEMA,
        "version": "0.22.0",
        "platform": "windows",
        "architecture": "amd64",
        "entrypoint": "hermes.exe",
        "sha256": "aa" * 32,
        "cliSha256": "bb" * 32,
        "cliVersion": "0.22.0",
        "packageRevision": "2",
        "keyId": module.RELEASE_KEY_ID,
        "bytes": 12,
    }
    left = module.canonical_manifest_bytes(manifest)
    right = module.canonical_manifest_bytes(dict(reversed(list(manifest.items()))))
    assert left == right
    json.loads(left)
