"""Production Master security / multimaster guards (v2.2 Phase 2)."""

from __future__ import annotations

from pathlib import Path

MASTER_ROOT = Path(__file__).resolve().parents[1] / "master"


def test_auto_accept_false() -> None:
    security = (MASTER_ROOT / "master.d" / "security.conf").read_text(encoding="utf-8")
    assert "auto_accept: false" in security
    assert "open_mode: false" in security


def test_failover_conf_present() -> None:
    failover = (MASTER_ROOT / "master.d" / "failover.conf").read_text(encoding="utf-8")
    assert "salt-a.internal" in failover
    assert "salt-b.internal" in failover
    assert "master_type: failover" in failover
    assert "random_master" in failover
    assert "master_alive_interval: 60" in failover
    assert "verify_master_pubkey_sign" in failover


def test_ext_pillar_uses_salt_control_config_names() -> None:
    text = (MASTER_ROOT / "master.d" / "ext-pillar.conf").read_text(encoding="utf-8")
    assert "salt_control_url" in text
    assert "token_file" in text
    assert "trusted_public_key_file" in text
    assert "secret-token" not in text.lower()
    assert "BEGIN PRIVATE" not in text


def test_fileserver_conf_readonly_note() -> None:
    text = (MASTER_ROOT / "master.d" / "fileserver.conf").read_text(encoding="utf-8")
    assert "versioned" in text.lower() or "readonly" in text.lower()
    assert "pillar_safe_render_error" in text


def test_no_private_key_files_in_master() -> None:
    forbidden_suffixes = {".pem", ".key", ".p8", ".pk8"}
    forbidden_names = {"master.pem", "master.key", "minion.pem"}
    offenders: list[str] = []
    for path in MASTER_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in forbidden_suffixes or path.name.lower() in forbidden_names:
            offenders.append(str(path.relative_to(MASTER_ROOT)))
        # Heuristic: PEM private key headers
        if path.suffix.lower() in {".conf", ".md", ".yml", ".yaml", ".txt"}:
            continue
        try:
            sample = path.read_bytes()[:200]
        except OSError:
            continue
        if b"BEGIN PRIVATE KEY" in sample or b"BEGIN RSA PRIVATE KEY" in sample:
            offenders.append(str(path.relative_to(MASTER_ROOT)))
    assert offenders == []
