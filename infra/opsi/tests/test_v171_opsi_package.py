from __future__ import annotations

import json
import shutil
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


def _signed_release(tmp_path: Path):
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
    dest = tmp_path / "out"
    archive = make.build_release(dest, hermes, key_ref, hermes_version="0.22.0", opsi_tooling="zipfile")
    stage = dest / "release-work" / "stage"
    return make, archive, stage


def test_o01_valid_stage_and_o05_readback(tmp_path: Path):
    make, archive, stage = _signed_release(tmp_path)
    assert (stage / "OPSI" / "control.toml").is_file()
    assert (stage / "OPSI" / "product-release.json").is_file()
    readback = _load("opsi_readback", PRODUCT / "packaging" / "opsi_readback.py")
    result = readback.readback_opsi(archive, stage)
    assert result["productVersion"] == "1.7.2"


def test_o02_private_key_in_stage_fails(tmp_path: Path):
    make, _, stage = _signed_release(tmp_path)
    (stage / "CLIENT_DATA" / "keys" / "release-private-key.pem").write_text("SECRET", encoding="utf-8")
    with pytest.raises(SystemExit, match="private key"):
        make._scan_stage(stage)


def test_o03_native_opsi_makepackage(tmp_path: Path):
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    if not shutil.which("opsi-makepackage"):
        pytest.skip("opsi-makepackage unavailable")
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
    archive = make.build_release(
        tmp_path / "out", hermes, key_ref, hermes_version="0.22.0", opsi_tooling="native"
    )
    assert archive.name.endswith(".opsi")


def test_o04_native_does_not_fallback_to_zipfile(tmp_path: Path):
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    if shutil.which("opsi-makepackage"):
        pytest.skip("opsi-makepackage present")
    with pytest.raises(SystemExit, match="opsi-makepackage missing"):
        make.build_opsi_native(tmp_path, tmp_path, "1.7.2", "1")


def test_o06_readback_mismatch_fails(tmp_path: Path):
    _, archive, stage = _signed_release(tmp_path)
    control = stage / "OPSI" / "control.toml"
    control.write_text(control.read_text(encoding="utf-8") + "\n# tamper\n", encoding="utf-8")
    readback = _load("opsi_readback", PRODUCT / "packaging" / "opsi_readback.py")
    with pytest.raises(ValueError, match="Release FAILED"):
        readback.readback_opsi(archive, stage)
    json.loads((stage / "OPSI" / "product-release.json").read_text(encoding="utf-8"))


def test_rb09_artifact_signature(tmp_path: Path):
    make, archive, stage = _signed_release(tmp_path)
    man = next((stage / "CLIENT_DATA" / "artifacts").glob("hermes-*.manifest.json"))
    sig = next((stage / "CLIENT_DATA" / "artifacts").glob("hermes-*.sig"))
    artifact = next((stage / "CLIENT_DATA" / "artifacts").glob("hermes-*.zip"))
    payload = json.loads(man.read_text(encoding="utf-8"))
    v3 = _load("artifact_v3", PRODUCT / "packaging" / "artifact_v3.py")
    from cryptography.hazmat.primitives.serialization import load_pem_public_key

    public = load_pem_public_key((stage / "CLIENT_DATA" / "keys" / "release-public-key.pem").read_bytes())
    v3.verify_envelope(payload, v3.sha256_file(artifact), sig.read_bytes(), public)


def test_rb10_controller_signature(tmp_path: Path):
    _, _, stage = _signed_release(tmp_path)
    ctrl = _load("controller_manifest", PRODUCT / "packaging" / "controller_manifest.py")
    tree = stage / "CLIENT_DATA" / "controller"
    signed = json.loads((tree / "controller.manifest.json").read_text(encoding="utf-8"))
    from cryptography.hazmat.primitives.serialization import load_pem_public_key

    public = load_pem_public_key((stage / "CLIENT_DATA" / "keys" / "release-public-key.pem").read_bytes())
    ctrl.verify_manifest(signed, public, tree)


def test_rb11_product_release_signature(tmp_path: Path):
    _, _, stage = _signed_release(tmp_path)
    rel = _load("product_release", PRODUCT / "packaging" / "product_release.py")
    index = json.loads((stage / "OPSI" / "product-release.json").read_text(encoding="utf-8"))
    from cryptography.hazmat.primitives.serialization import load_pem_public_key

    public = load_pem_public_key((stage / "CLIENT_DATA" / "keys" / "release-public-key.pem").read_bytes())
    rel.verify_index(index, public)
    control = (stage / "OPSI" / "control.toml").read_text(encoding="utf-8")
    assert 'version = "1.7.2"' in control
    assert "productVersion" not in control
    assert "packageVersion" not in control
    assert 'default = ["0.22.0"]' in control
    assert 'default = ["2"]' in control


def test_rb12_real_opsi_package(tmp_path: Path):
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    if not shutil.which("opsi-makepackage"):
        pytest.skip("opsi-makepackage unavailable")
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
    archive = make.build_release(
        tmp_path / "out", hermes, key_ref, hermes_version="0.22.0", opsi_tooling="native"
    )
    assert archive.name.endswith(".opsi")


def test_rb13_opsi_readback_consistent_and_mismatch(tmp_path: Path):
    make, archive, stage = _signed_release(tmp_path)
    readback = _load("opsi_readback", PRODUCT / "packaging" / "opsi_readback.py")
    result = readback.readback_opsi(archive, stage, extract_root=tmp_path / "readback-ok")
    assert result["productVersion"] == "1.7.2"
    assert result["hermesVersion"] == "0.22.0"
    assert (tmp_path / "readback-ok" / "OPSI" / "control.toml").is_file()
    control = stage / "OPSI" / "control.toml"
    control.write_text(control.read_text(encoding="utf-8") + "\n# tamper\n", encoding="utf-8")
    with pytest.raises(ValueError, match="Release FAILED"):
        readback.readback_opsi(archive, stage, extract_root=tmp_path / "readback-bad")


def test_zipfile_path_must_not_emit_opsi(tmp_path: Path):
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    stage = tmp_path / "stage"
    (stage / "OPSI").mkdir(parents=True)
    (stage / "OPSI" / "control.toml").write_text("id = 'x'\n", encoding="utf-8")
    archive = make.write_opsi_archive(stage, tmp_path / "out", "1.7.2", "1")
    assert archive.name.endswith(".fixture.zip")
    assert not archive.name.endswith(".opsi")


def test_native_is_default_and_does_not_fallback(tmp_path: Path):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    if shutil.which("opsi-makepackage"):
        pytest.skip("opsi-makepackage present")
    hermes = tmp_path / "hermes-0.22.0-windows.zip"
    with zipfile.ZipFile(hermes, "w") as zf:
        zf.writestr("hermes.exe", b"SMOKE-HERMES-CLI 0.22.0\n")
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
    with pytest.raises(SystemExit, match="opsi-makepackage missing"):
        make.build_release(tmp_path / "out", hermes, key_ref, hermes_version="0.22.0")


def test_staged_control_toml_tracks_runtime_version(tmp_path: Path):
    make = _load("makepackage", PRODUCT / "packaging" / "makepackage.py")
    dest = tmp_path / "control.toml"
    make.stage_control_toml(
        dest,
        product_version="1.7.2",
        package_version="9",
        hermes_version="0.23.1",
        controller_revision="4",
    )
    text = dest.read_text(encoding="utf-8")
    assert 'version = "1.7.2"' in text
    assert 'version = "9"' in text
    assert "productVersion" not in text
    assert "packageVersion" not in text
    assert 'default = ["0.23.1"]' in text
    assert 'default = ["4"]' in text
