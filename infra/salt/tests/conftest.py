from __future__ import annotations

import base64
import hashlib
import hmac
import zipfile
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

SIGNING_KEY = "test-signing-key"


def make_ed25519_keypair() -> tuple[str, str, Ed25519PrivateKey]:
    private = Ed25519PrivateKey.generate()
    private_b64 = base64.b64encode(private.private_bytes_raw()).decode("ascii")
    public_b64 = base64.b64encode(private.public_key().public_bytes_raw()).decode("ascii")
    return private_b64, public_b64, private


def make_signed_zip(
    tmp_path: Path,
    version: str = "0.20.0",
    key: str = SIGNING_KEY,
    *,
    use_ed25519: bool = False,
    private: Ed25519PrivateKey | None = None,
) -> tuple[Path, str, str, str | None, str | None]:
    bundle_root = tmp_path / "bundle"
    agent = bundle_root / "hermes-agent"
    (agent / "hermes_cli").mkdir(parents=True)
    (agent / "hermes_cli" / "main.py").write_text("# fixture hermes\n", encoding="utf-8")
    scripts = agent / "venv" / "Scripts"
    scripts.mkdir(parents=True)
    (scripts / "python.exe").write_text("", encoding="utf-8")
    (scripts / "hermes.exe").write_text("", encoding="utf-8")
    zip_path = tmp_path / f"hermes-{version}.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        for file in agent.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(bundle_root).as_posix())
    data = zip_path.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    key_id: str | None = None
    public_b64: str | None = None
    if use_ed25519:
        priv = private or Ed25519PrivateKey.generate()
        signature = base64.b64encode(priv.sign(data)).decode("ascii")
        public_b64 = base64.b64encode(priv.public_key().public_bytes_raw()).decode("ascii")
        key_id = "smc-test-key"
    else:
        signature = hmac.new(key.encode("utf-8"), data, hashlib.sha256).hexdigest()
    return zip_path, sha256, signature, key_id, public_b64


@pytest.fixture
def signed_artifact(tmp_path: Path) -> tuple[Path, str, str]:
    zip_path, sha256, signature, _, _ = make_signed_zip(tmp_path)
    return zip_path, sha256, signature


@pytest.fixture
def ed25519_artifact(tmp_path: Path) -> tuple[Path, str, str, str, str]:
    zip_path, sha256, signature, key_id, public_b64 = make_signed_zip(tmp_path, use_ed25519=True)
    assert key_id and public_b64
    return zip_path, sha256, signature, key_id, public_b64
