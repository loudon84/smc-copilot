from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "scripts" / "salt-migration-inventory.py"


def _inventory():
    spec = importlib.util.spec_from_file_location("salt_migration_inventory", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_broken_p0_p1_blockers_fail_code_gate_and_decision() -> None:
    inv = _inventory()
    gates = inv.evaluate_blockers(
        [
            {
                "id": "SALT-LOADER-001",
                "severity": "P0",
                "implementationStatus": "broken",
                "verificationStatus": "not_proven",
                "affectedCapabilities": ["runtime"],
                "tests": ["infra/salt/tests/test_salt_loader_contract.py"],
            }
        ]
    )
    assert gates["codeGate"] == "FAIL"
    assert gates["liveGate"] == "FAIL"
    assert gates["p0_p1"] == 1
    assert "SALT-LOADER-001" in gates["p0_p1_code_open"]
    go = {
        "api": True,
        "service": True,
        "loc": True,
        "p0_p1": not gates["p0_p1_code_open"] and not gates["p0_p1_live_open"],
        "codeGate": gates["codeGate"] == "PASS",
        "liveGate": gates["liveGate"] == "PASS",
    }
    assert (all(go.values()) and "GO" or "NO-GO") == "NO-GO"


def test_fixed_code_unproven_live_keeps_no_go() -> None:
    inv = _inventory()
    gates = inv.evaluate_blockers(
        [
            {
                "id": "PILLAR-CONTRACT-001",
                "severity": "P0",
                "implementationStatus": "fixed",
                "verificationStatus": "not_proven",
                "affectedCapabilities": ["sync"],
                "tests": ["infra/salt/tests/test_external_pillar_contract.py"],
            }
        ]
    )
    assert gates["codeGate"] == "PASS"
    assert gates["liveGate"] == "FAIL"
    assert gates["p0_p1_code_open"] == []
    assert gates["p0_p1_live_open"] == ["PILLAR-CONTRACT-001"]
    decision = "GO" if gates["codeGate"] == "PASS" and gates["liveGate"] == "PASS" else "NO-GO"
    assert decision == "NO-GO"


def test_missing_test_or_salt_source_cannot_stay_verified_full() -> None:
    inv = _inventory()
    classification, status, _, _ = inv.resolve_classification(
        "router",
        "runtime",
        "FULL",
        {
            ("router", "runtime"): {
                "classification": "FULL",
                "status": "verified",
                "salt_source": "infra/salt/extensions/_modules/does_not_exist.py",
                "tests": ["infra/salt/tests/test_does_not_exist.py"],
            }
        },
        REPO,
    )
    assert classification != "FULL"
    assert status == "unverified_missing_evidence"


def test_inventory_p0_p1_comes_from_manifest_not_hardcoded(tmp_path: Path) -> None:
    inv = _inventory()
    source = SCRIPT.read_text(encoding="utf-8")
    assert "p0_p1 = 0" not in source
    manifest = inv.load_manifest(REPO / "infra" / "salt" / "migration-capabilities.yaml")
    blockers = inv.load_blockers(manifest)
    assert blockers, "blockers[] must be present in Capability Manifest"
    ids = {str(item.get("id")) for item in blockers}
    assert {"SALT-LOADER-001", "PILLAR-CONTRACT-001", "JOB-CONTRACT-001", "IDENTITY-BINDING-001"} <= ids
    gates = inv.evaluate_blockers(blockers)
    assert gates["p0_p1"] == len([b for b in blockers if str(b.get("severity", "")).upper() in {"P0", "P1"}])
    assert gates["liveGate"] == "FAIL"
    report = {
        "generated_note": "test",
        "runtime_root": "services/runtime",
        "capabilities_path": "infra/salt/migration-capabilities.yaml",
        "p0_p1": gates["p0_p1"],
        "codeGate": gates["codeGate"],
        "liveGate": gates["liveGate"],
        "blockers": blockers,
        "go": {"api": True, "service": True, "loc": True, "decision": "NO-GO"},
        "entire": {
            "routers": {"count": 0},
            "services": {"count": 0},
            "loc": {"loc_weighted": 0},
        },
        "endpoint": {
            "routers": {"count": 0},
            "services": {"count": 0},
            "loc": {"loc_weighted": 0},
        },
        "items": [],
    }
    markdown = inv.render_md(report)
    assert "liveGate" in markdown
    assert "NO-GO" in markdown
    assert "0" != str(gates["p0_p1"]) or gates["liveGate"] == "FAIL"
    del tmp_path
