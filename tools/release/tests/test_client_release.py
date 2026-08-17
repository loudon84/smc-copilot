from __future__ import annotations

import json
import subprocess
import zipfile
from pathlib import Path

import pytest

from tools.release.client.build_client_release import build_all
from tools.release.client.release_inventory import scan_secrets
from tools.release.client.verify_client_release import verify_client_release

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
except ImportError:  # pragma: no cover
    Ed25519PrivateKey = None

ROOT = Path(__file__).resolve().parents[2]


def _git(repo: Path, *args: str) -> None:
    result = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "git failed")


def _hermes_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "hermes-agent"
    repo.mkdir()
    (repo / "pyproject.toml").write_text('[project]\nname = "hermes-agent"\nversion = "0.22.0"\n', encoding="utf-8")
    (repo / "uv.lock").write_text("version = 1\nrequires-python = '>=3.12'\n", encoding="utf-8")
    _git(repo, "init")
    _git(repo, "config", "user.email", "builder@example.com")
    _git(repo, "config", "user.name", "builder")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "freeze")
    return repo


def _write_config(path: Path, hermes_repo: Path, installer: Path) -> Path:
    path.write_text(
        "\n".join(
            [
                "schema: smc.client-release.config.v1",
                "release:",
                '  version: "1.7.1"',
                '  channel: "lab"',
                "clientRuntime:",
                "  platform: windows",
                "  architecture: amd64",
                "  python:",
                '    version: "3.12"',
                '    range: ">=3.12,<3.13"',
                "  node:",
                '    version: "22"',
                '    range: ">=22,<23"',
                "work:",
                "  enabled: true",
                "hermes:",
                f'  repo: "{hermes_repo.as_posix()}"',
                "  version: auto",
                "  profile: smc-managed",
                "opsi:",
                '  productVersion: "1.7.1"',
                '  packageVersion: "1"',
                '  controllerRevision: "2"',
                "  buildMode: native",
                "external:",
                f'  opsiClientInstaller: "{installer.as_posix()}"',
                "",
            ]
        ),
        encoding="utf-8",
    )
    return path


def _key_ref(tmp_path: Path) -> Path:
    from cryptography.hazmat.primitives import serialization

    private = Ed25519PrivateKey.generate()
    key_ref = tmp_path / "TEST-ONLY-release.pem"
    key_ref.write_bytes(
        private.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    return key_ref


def _inputs(tmp_path: Path) -> dict[str, Path]:
    hermes_repo = _hermes_repo(tmp_path)
    work = tmp_path / "work-dist"
    work.mkdir()
    (work / "copilot-desktop-1.7.1-setup.exe").write_bytes(b"setup")
    (work / "copilot-desktop-1.7.1-portable.exe").write_bytes(b"portable")
    hermes = tmp_path / "hermes-0.22.0-windows.zip"
    with zipfile.ZipFile(hermes, "w") as zf:
        zf.writestr("hermes.exe", b"SMOKE-HERMES-CLI 0.22.0\n")
        zf.writestr("README.txt", b"fixture")
    installer = tmp_path / "opsi-client-agent-installer.exe"
    installer.write_bytes(b"opsi-client")
    config = _write_config(tmp_path / "client-release.yaml", hermes_repo, installer)
    return {
        "config": config,
        "hermes_repo": hermes_repo,
        "work": work,
        "hermes": hermes,
        "installer": installer,
        "key": _key_ref(tmp_path),
    }


def test_rb14_secret_scan_fails(tmp_path: Path):
    dest = tmp_path / "rel"
    dest.mkdir()
    (dest / ".env").write_text("SECRET=1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="secret"):
        scan_secrets(dest)


def test_rb15_final_release_ready(tmp_path: Path, monkeypatch):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    from tools.release.client import build_client_release as bcr

    monkeypatch.setattr(
        bcr,
        "freeze_smc",
        lambda allow_dirty: {"revision": "a" * 40, "dirty": False, "liveEligible": True},
    )
    paths = _inputs(tmp_path)
    dest = bcr.build_all(
        config_path=paths["config"],
        output=tmp_path / "dist",
        hermes_repo=paths["hermes_repo"],
        opsi_client_installer=paths["installer"],
        signing_key_ref=paths["key"],
        allow_dirty=True,
        work_dist=paths["work"],
        hermes_zip=paths["hermes"],
        opsi_tooling="zipfile",
        mode="offline",
    )
    manifest = json.loads((dest / "manifests" / "client-release.json").read_text(encoding="utf-8"))
    assert manifest["schema"] == "smc.client-release.v1"
    assert manifest["liveEligible"] is True
    verified = verify_client_release(dest, stage=dest / "opsi" / "stage", require_signatures=True)
    assert verified["liveEligible"] is True
    assert any((dest / "opsi").glob("*.fixture.zip"))


def test_stage_all_does_not_require_prebuilt_opsi(tmp_path: Path, monkeypatch):
    if Ed25519PrivateKey is None:
        pytest.skip("cryptography required")
    from tools.release.client import build_client_release as bcr

    monkeypatch.setattr(
        bcr,
        "freeze_smc",
        lambda allow_dirty: {"revision": "a" * 40, "dirty": False, "liveEligible": True},
    )
    paths = _inputs(tmp_path)
    dest = build_all(
        config_path=paths["config"],
        output=tmp_path / "dist",
        hermes_repo=paths["hermes_repo"],
        opsi_client_installer=paths["installer"],
        signing_key_ref=paths["key"],
        allow_dirty=True,
        work_dist=paths["work"],
        hermes_zip=paths["hermes"],
        opsi_pkg=None,
        opsi_tooling="zipfile",
    )
    assert dest.is_dir()
    assert list((dest / "opsi").glob("*.fixture.zip"))
