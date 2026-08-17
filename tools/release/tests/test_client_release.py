from __future__ import annotations

from pathlib import Path

import pytest

from tools.release.client.build_client_release import assemble, build_all, copy_runtime_artifacts
from tools.release.client.release_config import load_release_config
from tools.release.client.release_inventory import capture_opsi_client_installer, capture_work_installers, scan_secrets, sha256_file
from tools.release.client.verify_client_release import verify_client_release

ROOT = Path(__file__).resolve().parents[3]
CONFIG = ROOT / "release" / "client-release.yaml"


def test_load_native_client_release_config():
    data = load_release_config(CONFIG)
    assert data["release"]["version"] == "1.7.1"
    assert data["opsi"]["buildMode"] == "native"
    assert data["opsi"]["productVersion"] != data["hermes"]["version"] or data["hermes"]["version"] == "auto"


def test_capture_work_and_opsi_client(tmp_path: Path):
    work_src = tmp_path / "work-dist"
    work_src.mkdir()
    setup = work_src / "copilot-desktop-0.7.4-setup.exe"
    portable = work_src / "copilot-desktop-0.7.4-portable.exe"
    setup.write_bytes(b"setup")
    portable.write_bytes(b"portable")
    work = capture_work_installers(work_src, tmp_path / "out" / "work")
    assert work["version"] == "0.7.4"
    assert len(work["sha256"]) == 64
    installer = tmp_path / "opsi-client-agent-installer.exe"
    installer.write_bytes(b"opsi-client")
    captured = capture_opsi_client_installer(installer, tmp_path / "out" / "bootstrap")
    assert captured["name"] == "opsi-client-agent-installer.exe"
    assert (tmp_path / "out" / "bootstrap" / "opsi-client-agent-installer.exe").is_file()


def test_secret_scan_fail_closed(tmp_path: Path):
    (tmp_path / "ok.txt").write_text("ok", encoding="utf-8")
    scan_secrets(tmp_path)
    (tmp_path / "release-private-key.pem").write_text("secret", encoding="utf-8")
    with pytest.raises(ValueError, match="secret"):
        scan_secrets(tmp_path)


def test_assemble_and_verify_client_release(tmp_path: Path):
    dest = tmp_path / "client-release" / "1.7.1" / "build-test"
    work_src = tmp_path / "work-dist"
    work_src.mkdir()
    (work_src / "copilot-desktop-0.7.4-setup.exe").write_bytes(b"setup")
    (work_src / "copilot-desktop-0.7.4-portable.exe").write_bytes(b"portable")
    work = capture_work_installers(work_src, dest / "work")
    hermes_zip = tmp_path / "hermes-0.20.2-windows-amd64.zip"
    hermes_zip.write_bytes(b"zip")
    (tmp_path / "hermes-0.20.2-windows-amd64.manifest.json").write_text("{}", encoding="utf-8")
    hermes_meta = copy_runtime_artifacts(hermes_zip, dest)
    hermes_meta.update(
        {
            "profile": "smc-managed",
            "sourceRevision": "abc1234",
            "version": "0.20.2",
        }
    )
    opsi_pkg = tmp_path / "smc-hermes-agent_1.7.1-1.opsi"
    opsi_pkg.write_bytes(b"opsi")
    opsi_dir = dest / "opsi"
    opsi_dir.mkdir(parents=True)
    (opsi_dir / opsi_pkg.name).write_bytes(b"opsi")
    installer = tmp_path / "opsi-client-agent-installer.exe"
    installer.write_bytes(b"client")
    opsi_client = capture_opsi_client_installer(installer, dest / "bootstrap")
    config = load_release_config(CONFIG)
    opsi_sha = sha256_file(opsi_dir / opsi_pkg.name)
    assemble(
        dest,
        config=config,
        work=work,
        hermes=hermes_meta,
        opsi={
            "productVersion": "1.7.1",
            "packageVersion": "1",
            "controllerRevision": "2",
            "artifactSha256": opsi_sha,
        },
        opsi_client=opsi_client,
        build_id="build-test",
        live_eligible=False,
    )
    verified = verify_client_release(dest)
    assert verified["schema"] == "smc.client-release.v1"
    assert verified["liveEligible"] is False
    assert verified["work"]["version"] == "0.7.4"
    assert (dest / "manifests" / "SHA256SUMS").is_file()


def test_build_all_requires_inputs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "tools.release.client.build_client_release.run_preflight",
        lambda *a, **k: {
            "smc": {"revision": "abc1234", "dirty": True, "liveEligible": False},
            "hermes": {"revision": "def5678", "version": "0.20.2", "liveEligible": False},
        },
    )
    work_src = tmp_path / "work-dist"
    work_src.mkdir()
    (work_src / "copilot-desktop-0.7.4-setup.exe").write_bytes(b"setup")
    (work_src / "copilot-desktop-0.7.4-portable.exe").write_bytes(b"portable")
    with pytest.raises(ValueError, match="hermes zip required"):
        build_all(
            config_path=CONFIG,
            output=tmp_path,
            allow_dirty=True,
            work_dist=work_src,
            hermes_zip=None,
        )
