from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

PRODUCT = Path(__file__).resolve().parents[1] / "products" / "smc-hermes-agent"


def _load_lifecycle():
    import sys

    sys.path.insert(0, str(PRODUCT))
    from controller.lifecycle import (  # noqa: PLC0415
        checkpoint_journal,
        complete_user_command,
        decode_config_payload,
        enqueue_user_command,
        fake_programdata,
        install_controller_bundle,
        install_runtime_slot,
        resolve_active_cli,
        resume_or_rollback,
        restore_previous_owner,
        start_journal,
        two_phase_uninstall,
        write_json,
        write_ownership,
    )

    return {
        "checkpoint_journal": checkpoint_journal,
        "complete_user_command": complete_user_command,
        "decode_config_payload": decode_config_payload,
        "enqueue_user_command": enqueue_user_command,
        "fake_programdata": fake_programdata,
        "install_controller_bundle": install_controller_bundle,
        "install_runtime_slot": install_runtime_slot,
        "resolve_active_cli": resolve_active_cli,
        "resume_or_rollback": resume_or_rollback,
        "restore_previous_owner": restore_previous_owner,
        "start_journal": start_journal,
        "two_phase_uninstall": two_phase_uninstall,
        "write_json": write_json,
        "write_ownership": write_ownership,
    }


def test_controller_survives_cache_delete(tmp_path):
    lc = _load_lifecycle()
    cache = tmp_path / "opsi-cache" / "scripts"
    cache.mkdir(parents=True)
    (cache / "Invoke-SmcEndpointController.ps1").write_text("# bootstrap\n", encoding="utf-8")
    layout = lc["fake_programdata"](tmp_path / "programdata")
    installed = lc["install_controller_bundle"](layout, cache, "1", "ab" * 32)
    import shutil

    shutil.rmtree(cache)
    assert not cache.exists()
    assert (installed / "Invoke-SmcEndpointController.ps1").is_file()
    pointer = json.loads(layout.current_controller.read_text(encoding="utf-8"))
    assert pointer["path"] == str(installed)
    assert pointer["previous"] == ""


def test_journal_v2_captures_previous_owner_and_resumes(tmp_path):
    lc = _load_lifecycle()
    layout = lc["fake_programdata"](tmp_path / "programdata")
    journal = lc["start_journal"](
        layout,
        request_id="req_journal01",
        digest="aa" * 32,
        operation="setup",
        previous_owner="salt",
        previous_version="0.21.0",
    )
    assert journal["previousOwner"] == "salt"
    assert journal["previousVersion"] == "0.21.0"
    lc["checkpoint_journal"](layout, "req_journal01", "runtime_activated")
    resumed = lc["resume_or_rollback"](layout, "req_journal01")
    assert resumed["phase"] == "recovering"
    same = lc["start_journal"](
        layout,
        request_id="req_journal01",
        digest="aa" * 32,
        operation="setup",
        previous_owner="salt",
        previous_version="0.21.0",
    )
    assert same["desiredDigest"] == "aa" * 32
    with pytest.raises(ValueError, match="digest conflict"):
        lc["start_journal"](
            layout,
            request_id="req_journal01",
            digest="bb" * 32,
            operation="setup",
            previous_owner="salt",
            previous_version="0.21.0",
        )


def test_runtime_slot_is_immutable_and_resolver_uses_manifest(tmp_path):
    lc = _load_lifecycle()
    layout = lc["fake_programdata"](tmp_path / "programdata")
    extract = tmp_path / "extract"
    extract.mkdir()
    cli = extract / "hermes.exe"
    cli.write_bytes(b"CLI")
    digest = hashlib.sha256(b"payload").hexdigest()
    files = [{"path": "hermes.exe", "size": "3", "sha256": hashlib.sha256(b"CLI").hexdigest()}]
    slot = lc["install_runtime_slot"](layout, extract, "0.22.0", digest, files)
    assert "versions" in str(slot)
    resolved = lc["resolve_active_cli"](layout, "hermes.exe")
    assert resolved == slot / "hermes.exe"
    leftover = extract / "stale.bin"
    leftover.write_bytes(b"old")
    files_extra = files + [{"path": "stale.bin", "size": "3", "sha256": hashlib.sha256(b"old").hexdigest()}]
    slot2 = lc["install_runtime_slot"](layout, extract, "0.23.0", "cd" * 32, files_extra)
    assert slot2 != slot
    assert (slot / "hermes.exe").read_bytes() == b"CLI"


def test_config_payload_digest_roundtrip_and_secret_fail_closed():
    lc = _load_lifecycle()
    import base64

    body = {"revision": 3, "keys": {"gateway_port": 8642, "managed_profile": "default"}}
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    digest = hashlib.sha256(raw).hexdigest()
    decoded = lc["decode_config_payload"](payload, digest)
    assert decoded["keys"]["gateway_port"] == 8642
    secret = {"revision": 1, "keys": {"api_key": "x"}}
    secret_raw = json.dumps(secret, separators=(",", ":"), sort_keys=True).encode("utf-8")
    secret_payload = base64.urlsafe_b64encode(secret_raw).decode("ascii").rstrip("=")
    with pytest.raises(ValueError, match="secret"):
        lc["decode_config_payload"](secret_payload, hashlib.sha256(secret_raw).hexdigest())


def test_user_command_wrong_digest_quarantines(tmp_path):
    lc = _load_lifecycle()
    layout = lc["fake_programdata"](tmp_path / "programdata")
    sid = "S-1-5-21-1-2-3-1001"
    lc["enqueue_user_command"](
        layout,
        sid,
        {
            "requestId": "req_user01aa",
            "clientId": "client-a.example",
            "sid": sid,
            "desiredDigest": "aa" * 32,
            "operation": "apply-config",
            "deadline": "",
        },
    )
    with pytest.raises(ValueError, match="tamper"):
        lc["complete_user_command"](layout, sid, "req_user01aa", "bb" * 32)
    quarantined = list((layout.root / "quarantine" / sid).glob("*.json"))
    assert quarantined


def test_owner_restore_and_uninstall_blocked_on_residual(tmp_path):
    lc = _load_lifecycle()
    layout = lc["fake_programdata"](tmp_path / "programdata")
    lc["write_ownership"](layout, current="opsi", previous="salt", pending="", revision=1)
    owner = layout.root.parent / "control-owner.json"
    lc["write_json"](owner, {"hermes": "opsi"})
    lc["restore_previous_owner"](layout)
    assert json.loads(owner.read_text(encoding="utf-8"))["hermes"] == "salt"
    blocked = lc["two_phase_uninstall"](layout, user_online=True, residual=True)
    assert blocked == "UNINSTALL_BLOCKED"
    lc["write_ownership"](layout, current="opsi", previous="salt", pending="", revision=2)
    status = lc["two_phase_uninstall"](layout, user_online=False, residual=False)
    assert status == "SUCCEEDED"
    assert not (layout.root / "controller").exists()
    tombstone = json.loads((layout.root / "results" / "uninstall-tombstone.json").read_text(encoding="utf-8"))
    assert tombstone["retainedUserData"] is True


def test_custom_opsiscript_reads_config_payload_and_sid():
    text = (PRODUCT / "CLIENT_DATA" / "custom.opsiscript").read_text(encoding="utf-8")
    assert "config_payload" in text
    assert "config_digest" in text
    assert "managed_user_sid" in text
    assert "managed_user_account" in text
    assert "reconcile-controller" in text


def test_status_does_not_hardcode_opsi_owner():
    status = (PRODUCT / "scripts" / "health" / "Get-HermesStatus.ps1").read_text(encoding="utf-8")
    assert 'owner     = "opsi"' not in status
    assert "Get-SmcControlOwner" in status
    assert "smc.opsi.endpoint-controller-state.v2" in status
    assert "ack" in status.lower()


def test_restart_and_repair_forbid_system_cli_fallback():
    restart = (PRODUCT / "scripts" / "gateway" / "Restart-Gateway.ps1").read_text(encoding="utf-8")
    assert "gateway restart" not in restart
    assert "ManagedUserSid" in restart
    repair = (PRODUCT / "scripts" / "repair" / "Repair-Hermes.ps1").read_text(encoding="utf-8")
    assert "ManagedUserSid" in repair
    adapter = (PRODUCT / "scripts" / "Invoke-SmcHermesAgent.ps1").read_text(encoding="utf-8")
    assert "USER_CONTEXT_PENDING" in adapter
    assert "apply-config" in adapter


def test_gateway_task_binds_home_profile_bind_port():
    register = (PRODUCT / "bootstrap" / "machine" / "Register-UserBootstrap.ps1").read_text(encoding="utf-8")
    assert "HERMES_HOME" in register
    assert "ManagedProfile" in register
    assert "127.0.0.1" in register
    assert "GatewayPort" in register
    init = (PRODUCT / "bootstrap" / "user" / "Initialize-HermesHome.ps1").read_text(encoding="utf-8")
    assert "GatewayPort" in init


def test_uninstall_restores_previous_owner():
    uninstall = (PRODUCT / "scripts" / "install" / "Uninstall-OpsiManaged.ps1").read_text(encoding="utf-8")
    assert "previous" in uninstall.lower()
    assert "control-owner.json" in uninstall
    assert "Never delete user Hermes data" in uninstall
