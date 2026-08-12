"""CI guards: production extensions must not violate PRD v2.1 forbidden items."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = ROOT / "extensions"
MASTER = ROOT / "master"
MANIFEST = ROOT / "manifest" / "client-manifest.example.json"
GATEWAY_SLS = ROOT / "states" / "gateway.sls"


def test_no_mock_backend_import_in_production_extensions() -> None:
    offenders = []
    import_re = re.compile(r"^\s*(from|import)\s+mock_backend\b", re.M)
    for path in EXTENSIONS.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if import_re.search(text):
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_production_master_auto_accept_false() -> None:
    security = (MASTER / "master.d" / "security.conf").read_text(encoding="utf-8")
    assert re.search(r"^auto_accept:\s*false\s*$", security, re.M)
    assert "auto_accept: true" not in security.lower().replace(" ", "")


def test_manifest_forbids_latest() -> None:
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert payload["salt"]["version"].lower() != "latest"
    assert "latest" not in payload["salt"]["installer"].lower()
    assert payload["salt"]["channel"] == "3008-lts"
    # Production client-manifest.json must not ship placeholders.
    prod = ROOT / "manifest" / "client-manifest.json"
    assert not prod.is_file(), "production client-manifest.json must come from signed release, not git"


def test_gateway_sls_has_no_system_user_fallback() -> None:
    text = GATEWAY_SLS.read_text(encoding="utf-8")
    assert "or 'System'" not in text
    assert "or \"System\"" not in text
    assert "user_name: System" not in text
    assert "waiting_user_binding" in text
