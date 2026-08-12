from __future__ import annotations

import hashlib
import hmac
import zipfile
from pathlib import Path

import pytest

SIGNING_KEY = "test-signing-key"


def make_signed_zip(tmp_path: Path, version: str = "0.20.0", key: str = SIGNING_KEY) -> tuple[Path, str, str]:
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
    signature = hmac.new(key.encode("utf-8"), data, hashlib.sha256).hexdigest()
    return zip_path, sha256, signature


@pytest.fixture
def signed_artifact(tmp_path: Path) -> tuple[Path, str, str]:
    return make_signed_zip(tmp_path)
