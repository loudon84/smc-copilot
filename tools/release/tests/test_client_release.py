from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

import pytest

from tools.release.client.release_inventory import scan_secrets
from tools.release.client.verify_client_release import verify_client_release

ROOT = Path(__file__).resolve().parents[2]
APPROVED_COMMIT = "29112bef099274229cadff79cdff7bf7b99c4b77"


def _write_config_v2(path: Path) -> Path:
    path.write_text(
        "\n".join(
            [
                "schema: smc.client-release.config.v2",
                "release:",
                '  version: "1.7.2"',
                "  channel: lab",
                "work:",
                "  enabled: true",
                "clientRuntime:",
                "  platform: windows",
                "  architecture: amd64",
                "  python:",
                '    version: "3.12"',
                '    range: ">=3.12,<3.13"',
                "  node:",
                '    version: "24.21.0"',
                '    range: ">=24.11,<25"',
                "hermes:",
                "  distribution: enterprise-native",
                "  source:",
                "    installUrl: http://git.superic.com/aiplatform/hermes-agent.git",
                "    repositoryHttp: http://git.superic.com/aiplatform/hermes-agent.git",
                "    allowedHosts:",
                "      - git.superic.com",
                "    defaultBranch: main",
                f'    approvedCommit: "{APPROVED_COMMIT}"',
                "    publicUpstreamAllowedOnEndpoint: false",
                "  update:",
                "    policy: follow-defaultBranch",
                "  compatibility:",
                '    minVersion: "0.21.0"',
                '    testedVersion: "0.21.0"',
                "  gateway:",
                '    host: "127.0.0.1"',
                "    port: 8642",
                "  policy:",
                '    version: "smc-managed-2"',
                "  bootstrap:",
                "    authMode: anonymous-internal",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return path


def _fake_install_ps1(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("# enterprise-fork install.ps1 fixture\nparam()\nWrite-Output 'ok'\n", encoding="utf-8")
    return path


def _inputs(tmp_path: Path) -> dict[str, Path]:
    work = tmp_path / "work-dist"
    work.mkdir()
    (work / "copilot-desktop-1.7.2-setup.exe").write_bytes(b"setup")
    (work / "copilot-desktop-1.7.2-portable.exe").write_bytes(b"portable")
    install_ps1 = _fake_install_ps1(tmp_path / "fork" / "install.ps1")
    config = _write_config_v2(tmp_path / "client-release.yaml")
    return {
        "config": config,
        "work": work,
        "install_ps1": install_ps1,
    }


def test_rb14_secret_scan_fails(tmp_path: Path):
    dest = tmp_path / "rel"
    dest.mkdir()
    (dest / ".env").write_text("SECRET=1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="secret"):
        scan_secrets(dest)


def test_assemble_succeeds_without_hermes_zip_or_opsi(tmp_path: Path, monkeypatch):
    from tools.release.client import build_client_release as bcr

    monkeypatch.setattr(
        bcr,
        "freeze_smc",
        lambda allow_dirty: {"revision": "a" * 40, "dirty": False, "liveEligible": True},
    )
    paths = _inputs(tmp_path)
    from tools.release.client.release_config import load_release_config

    cfg = load_release_config(paths["config"])
    dest = bcr.stage_root(tmp_path / "dist", str(cfg["release"]["version"]), "build-test")
    work = bcr.run_work(cfg, dest, work_dist=paths["work"])
    bootstrap = bcr.run_hermes_bootstrap(cfg, dest, install_ps1=paths["install_ps1"])
    manifest = bcr.assemble(
        dest,
        config=cfg,
        work=work,
        hermes_bootstrap=bootstrap,
        build_id="build-test",
        live_eligible=False,
    )
    assert "hermesBootstrap" in manifest
    assert "opsi" not in manifest
    assert not list(dest.glob("**/*.zip"))
    assert not list((dest / "opsi").glob("*")) if (dest / "opsi").exists() else True
    assert (dest / "hermes-bootstrap" / "install.ps1").is_file()
    assert (dest / "hermes-bootstrap" / "hermes-native-manifest.json").is_file()
    verified = verify_client_release(dest, require_signatures=False)
    assert verified["hermesBootstrap"]["installerSha256"] == bootstrap["installerSha256"]


def test_all_does_not_produce_opsi_or_hermes_zip(tmp_path: Path, monkeypatch):
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
        allow_dirty=True,
        work_dist=paths["work"],
        hermes_install_ps1=paths["install_ps1"],
    )
    manifest = json.loads((dest / "manifests" / "client-release.json").read_text(encoding="utf-8"))
    assert manifest["schema"] == "smc.client-release.v1"
    assert manifest["buildStatus"] == "success"
    assert manifest["certificationStatus"] == "uncertified"
    assert "hermesBootstrap" in manifest
    assert "opsi" not in manifest
    assert "opsiClientAgent" not in manifest
    assert "hermesInstaller" not in manifest
    assert not list(dest.rglob("*.opsi"))
    assert not list(dest.rglob("*.fixture.zip"))
    assert not list(dest.rglob("hermes-*.zip"))
    assert not list(dest.rglob("hermes-windows-amd64.zip"))
    assert not list(dest.rglob("*.whl"))
    assert (dest / "work" / "copilot-desktop-1.7.2-setup.exe").is_file()
    assert (dest / "hermes-bootstrap" / "install.ps1").is_file()
    native = json.loads(
        (dest / "hermes-bootstrap" / "hermes-native-manifest.json").read_text(encoding="utf-8")
    )
    assert native["distribution"] == "enterprise-native"
    assert native["approvedCommit"] == APPROVED_COMMIT
    verify_client_release(dest, require_signatures=False)


def test_rb15_final_release_ready(tmp_path: Path, monkeypatch):
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
        allow_dirty=True,
        work_dist=paths["work"],
        hermes_install_ps1=paths["install_ps1"],
    )
    manifest = json.loads((dest / "manifests" / "client-release.json").read_text(encoding="utf-8"))
    assert manifest["liveEligible"] is False
    assert manifest["hermes"]["distribution"] == "enterprise-native"
    verified = verify_client_release(dest)
    assert verified["hermesBootstrap"]["approvedCommit"] == APPROVED_COMMIT


def test_missing_install_ps1_fails_clearly(tmp_path: Path, monkeypatch):
    from tools.release.client import build_client_release as bcr

    monkeypatch.setattr(
        bcr,
        "freeze_smc",
        lambda allow_dirty: {"revision": "a" * 40, "dirty": False, "liveEligible": True},
    )
    monkeypatch.delenv("HERMES_FORK_INSTALL_PS1", raising=False)
    monkeypatch.setattr(bcr, "DEFAULT_HERMES_FORK_INSTALL_PS1", tmp_path / "missing" / "install.ps1")
    paths = _inputs(tmp_path)
    with pytest.raises(SystemExit, match="enterprise install\\.ps1 not found"):
        bcr.build_all(
            config_path=paths["config"],
            output=tmp_path / "dist",
            allow_dirty=True,
            work_dist=paths["work"],
            hermes_install_ps1=None,
        )


def test_powershell_wrapper_stage_parity_with_python() -> None:
    from tools.release.client.build_client_release import STAGES

    wrapper = (ROOT.parent / "scripts" / "build-client-release.ps1").read_text(encoding="utf-8")
    match = re.search(r"ValidateSet\(([^)]+)\)", wrapper)
    assert match, "PowerShell ValidateSet missing"
    ps_stages = [part.strip().strip('"') for part in match.group(1).split(",")]
    assert tuple(ps_stages) == STAGES
    assert "hermes-bootstrap" in STAGES
    assert "hermes" not in STAGES
    assert "opsi-package" not in STAGES
    assert "runtime" not in STAGES


def test_verify_rejects_hermes_zip_payload(tmp_path: Path, monkeypatch):
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
        allow_dirty=True,
        work_dist=paths["work"],
        hermes_install_ps1=paths["install_ps1"],
    )
    bad = dest / "hermes" / "hermes-windows-amd64.zip"
    bad.parent.mkdir(parents=True, exist_ok=True)
    bad.write_bytes(b"forbidden-runtime")
    with pytest.raises(ValueError, match="forbidden runtime/OPSI payloads"):
        verify_client_release(dest)
