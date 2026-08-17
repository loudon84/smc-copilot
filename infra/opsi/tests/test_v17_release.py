from __future__ import annotations

import hashlib
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


def test_control_toml_splits_product_and_hermes_versions():
    text = (PRODUCT / "OPSI" / "control.toml").read_text(encoding="utf-8")
    assert 'version = "1.7.2"' in text
    assert 'version = "1"' in text
    assert "productVersion" not in text
    assert "packageVersion" not in text
    assert "[[ProductProperty]]" in text
    assert 'default = ["0.22.0"]' in text
    assert 'default = ["2"]' in text
    assert "0.22.0" in text


def test_build_release_emits_signed_envelopes_not_zip_copy(tmp_path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    hermes = tmp_path / "hermes-0.22.0-windows.zip"
    with zipfile.ZipFile(hermes, "w") as zf:
        zf.writestr("hermes.exe", b"SMOKE-HERMES-CLI 0.22.0\n")
        zf.writestr("README.txt", b"fixture")
    from cryptography.hazmat.primitives import serialization

    private = Ed25519PrivateKey.generate()
    key_ref = tmp_path / "release.pem"
    key_ref.write_bytes(
        private.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    source_art = PRODUCT / "CLIENT_DATA" / "artifacts"
    before = {p: p.read_bytes() for p in source_art.glob("*")} if source_art.is_dir() else {}
    dest = tmp_path / "out"
    archive = make.build_release(dest, hermes, key_ref, hermes_version="0.22.0", opsi_tooling="zipfile")
    after = {p: p.read_bytes() for p in source_art.glob("*")} if source_art.is_dir() else {}
    assert before == after
    assert archive.name.endswith(".fixture.zip")
    assert not archive.name.endswith(".opsi")
    assert archive.is_file()
    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
    assert "OPSI/product-release.json" in names
    assert not any("private" in name.lower() and "public" not in name.lower() for name in names)
    index = json.loads(zipfile.ZipFile(archive).read("OPSI/product-release.json"))
    assert index["productVersion"] == "1.7.2"
    assert index["runtimes"][0]["version"] == "0.22.0"
    assert index["liveEligible"] is False
    rel = _load("product_release", PRODUCT / "packaging" / "product_release.py")
    rel.verify_index(index, private.public_key())


def test_build_release_wheelhouse_binds_runtime_build(tmp_path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    runtime_build = {
        "schema": "smc.hermes.runtime-build.v1",
        "version": "0.22.0",
        "platform": "windows",
        "architecture": "amd64",
        "requires": {"python": ">=3.12,<3.13", "node": ">=22,<23"},
        "source": {
            "revision": "abc1234deadbeef",
            "dirty": False,
            "pyprojectSha256": "aa" * 32,
            "lockSha256": "bb" * 32,
        },
        "profile": {"name": "smc-managed", "version": 1},
        "python": {"wheelCount": 1, "wheelhouseDigest": "cc" * 32},
        "node": {"packageCount": 0, "packageLockDigest": "dd" * 32},
        "buildId": "build-test",
        "liveEligible": False,
    }
    hermes = tmp_path / "hermes-0.22.0-windows-amd64.zip"
    with zipfile.ZipFile(hermes, "w") as zf:
        zf.writestr("app/hermes_agent-0.22.0-py3-none-any.whl", b"wheel-bytes")
        zf.writestr("python/wheels/pydantic-2.11.0-py3-none-any.whl", b"dep")
        zf.writestr("runtime-build.json", json.dumps(runtime_build, indent=2).encode("utf-8"))
        zf.writestr("runtime-profile.json", b'{"schema":"smc.hermes.runtime-profile.v1"}')
    from cryptography.hazmat.primitives import serialization

    private = Ed25519PrivateKey.generate()
    key_ref = tmp_path / "release.pem"
    key_ref.write_bytes(
        private.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    archive = make.build_release(tmp_path / "out", hermes, key_ref, hermes_version="0.22.0", opsi_tooling="zipfile")
    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
        manifest = json.loads(zf.read([n for n in names if n.endswith(".manifest.json") and "hermes-" in n][0]))
    assert manifest["installType"] == "python-wheelhouse"
    assert manifest["runtimeEntrypoint"] == "venv/Scripts/hermes.exe"
    assert manifest["requires"]["python"] == ">=3.12,<3.13"
    assert manifest["profile"]["name"] == "smc-managed"
    assert len(manifest["runtimeBuildSha256"]) == 64


def test_controller_digest_is_not_sha256_of_revision():
    text = (PRODUCT / "controller" / "Install-SmcController.ps1").read_text(encoding="utf-8")
    assert "Get-SmcSha256Text -Text $Revision" not in text
    adapter = (PRODUCT / "scripts" / "Invoke-SmcHermesAgent.ps1").read_text(encoding="utf-8")
    assert "Get-SmcSha256Text -Text $ControllerRevision" not in adapter
    psm = (PRODUCT / "controller" / "SmcController.psm1").read_text(encoding="utf-8")
    assert "Get-FileHash" in psm
    assert "canonicalDigest" in psm


def test_controller_manifest_tamper_fails_closed(tmp_path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    ctrl = _load("controller_manifest", PRODUCT / "packaging" / "controller_manifest.py")
    root = tmp_path / "bundle"
    root.mkdir()
    (root / "Invoke-SmcEndpointController.ps1").write_text("# entry\n", encoding="utf-8")
    (root / "Invoke-SmcUserController.ps1").write_text("# user\n", encoding="utf-8")
    unsigned = ctrl.build_unsigned(root, "2", key_id=ctrl.SMOKE_KEY_ID)
    private = Ed25519PrivateKey.generate()
    signed = ctrl.sign_manifest(unsigned, private)
    ctrl.verify_manifest(signed, private.public_key(), root)
    tampered = dict(signed)
    tampered["files"] = list(signed["files"]) + [
        {"path": "evil.ps1", "size": 1, "sha256": "ab" * 32}
    ]
    with pytest.raises(Exception):
        ctrl.verify_manifest(tampered, private.public_key(), root)
    (root / "extra.bin").write_bytes(b"x")
    with pytest.raises(ValueError, match="mismatch"):
        ctrl.verify_manifest(signed, private.public_key(), root)


def test_artifact_v3_rejects_duplicates_and_compat(tmp_path):
    module = _load("artifact_v3", PRODUCT / "packaging" / "artifact_v3.py")
    evil = tmp_path / "dup.zip"
    with zipfile.ZipFile(evil, "w") as zf:
        zf.writestr("hermes.exe", b"a")
        zf.writestr("Hermes.exe", b"b")
    with pytest.raises(ValueError, match="collision|duplicate"):
        module.file_list_from_zip(evil)
    with pytest.raises(ValueError):
        module.parse_compat("latest")
    assert module.compat_holds(">=2", "2")
    assert not module.compat_holds(">=2", "1")


def test_assert_signature_does_not_use_system_python():
    module = (PRODUCT / "scripts" / "common" / "SmcOpsi.psm1").read_text(encoding="utf-8")
    assert "Get-Command python" not in module
    assert "smc-artifact-verify" in module
    assert "system Python is forbidden" in module
    verifier = (PRODUCT / "controller" / "smc-artifact-verify.ps1").read_text(encoding="utf-8")
    assert "Get-Command python" not in verifier


def test_thin_bootstrap_dispatches_installed_controller():
    bootstrap = (PRODUCT / "scripts" / "Invoke-SmcHermesAgent.ps1").read_text(encoding="utf-8")
    assert "Install-SmcControllerBundle" in bootstrap
    assert "current.json" in bootstrap
    assert "install\\Install-Hermes.ps1" not in bootstrap
    installed = (PRODUCT / "controller" / "Invoke-SmcEndpointController.ps1").read_text(encoding="utf-8")
    assert "ScriptPath" in installed
    assert "must not run from OPSI ScriptPath" in installed
    assert "Install-Hermes.ps1" in installed


def test_gateway_wrapper_sets_hermes_home():
    wrapper = (PRODUCT / "controller" / "Start-SmcHermesGateway.ps1").read_text(encoding="utf-8")
    assert "$env:HERMES_HOME = $HermesHome" in wrapper
    register = (PRODUCT / "bootstrap" / "machine" / "Register-UserBootstrap.ps1").read_text(encoding="utf-8")
    assert "Start-SmcHermesGateway.ps1" in register
    assert "set HERMES_HOME=" not in register
    assert "Register-SmcManagedTask -TaskName $gatewayName -Execute $cli" not in register


def test_python_install_uses_manifest_digest_not_revision(tmp_path):
    import sys

    sys.path.insert(0, str(PRODUCT))
    from controller.lifecycle import fake_programdata, install_controller_bundle, write_json

    layout = fake_programdata(tmp_path / "programdata")
    src = tmp_path / "src"
    src.mkdir()
    entry = b"# c\n"
    user = b"# u\n"
    (src / "Invoke-SmcEndpointController.ps1").write_bytes(entry)
    (src / "Invoke-SmcUserController.ps1").write_bytes(user)
    write_json(
        src / "controller.manifest.json",
        {
            "canonicalDigest": "aa" * 32,
            "files": [
                {
                    "path": "Invoke-SmcEndpointController.ps1",
                    "size": len(entry),
                    "sha256": hashlib.sha256(entry).hexdigest(),
                },
                {
                    "path": "Invoke-SmcUserController.ps1",
                    "size": len(user),
                    "sha256": hashlib.sha256(user).hexdigest(),
                },
            ],
        },
    )
    installed = install_controller_bundle(layout, src, "2", "ff" * 32)
    pointer = json.loads(layout.current_controller.read_text(encoding="utf-8"))
    assert pointer["digest"] == "aa" * 32
    assert "ff" * 12 not in str(installed)
    (src / "Invoke-SmcEndpointController.ps1").write_bytes(b"# TAMPER\n")
    with pytest.raises(ValueError, match="digest mismatch|tamper"):
        install_controller_bundle(layout, src, "2")
