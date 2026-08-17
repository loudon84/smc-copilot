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
    archive = make.build_release(dest, hermes, key_ref, hermes_version="0.22.0")
    stage = dest / "release-work" / "stage"
    return make, archive, stage


def test_o01_valid_stage_and_o05_readback(tmp_path: Path):
    make, archive, stage = _signed_release(tmp_path)
    assert (stage / "OPSI" / "control.toml").is_file()
    assert (stage / "OPSI" / "product-release.json").is_file()
    readback = _load("opsi_readback", PRODUCT / "packaging" / "opsi_readback.py")
    result = readback.readback_opsi(archive, stage)
    assert result["productVersion"] == "1.7.1"


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
        make.build_opsi_native(tmp_path, tmp_path, "1.7.1", "1")


def test_o06_readback_mismatch_fails(tmp_path: Path):
    _, archive, stage = _signed_release(tmp_path)
    control = stage / "OPSI" / "control.toml"
    control.write_text(control.read_text(encoding="utf-8") + "\n# tamper\n", encoding="utf-8")
    readback = _load("opsi_readback", PRODUCT / "packaging" / "opsi_readback.py")
    with pytest.raises(ValueError, match="Release FAILED"):
        readback.readback_opsi(archive, stage)
    json.loads((stage / "OPSI" / "product-release.json").read_text(encoding="utf-8"))
