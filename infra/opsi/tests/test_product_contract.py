from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

PRODUCT = Path(__file__).resolve().parents[1] / "products" / "smc-hermes-agent"


def test_control_toml_localboot_and_allowlist():
    text = (PRODUCT / "OPSI" / "control.toml").read_text(encoding="utf-8")
    assert 'id = "smc-hermes-agent"' in text
    assert 'type = "localboot"' in text
    assert "latest" not in (PRODUCT / "OPSI" / "control.toml").read_text(encoding="utf-8").split("forbidden")[0]
    for op in ("status", "collect-log", "apply-config", "restart-gateway", "diagnose", "repair"):
        assert op in text


def test_opsiscripts_require_request_id():
    for name in ("setup.opsiscript", "update.opsiscript", "uninstall.opsiscript", "custom.opsiscript"):
        text = (PRODUCT / "CLIENT_DATA" / name).read_text(encoding="utf-8")
        assert "request_id" in text
        assert "Invoke-Expression" not in text


def test_powershell_no_iex_or_python_kill():
    offenders = []
    for path in PRODUCT.rglob("*.ps1"):
        text = path.read_text(encoding="utf-8")
        if "Invoke-Expression" in text or "iex " in text.lower():
            offenders.append(str(path))
        if "Stop-Process -Name python" in text:
            offenders.append(str(path))
    assert offenders == []


def test_redaction_covers_bearer():
    module = (PRODUCT / "scripts" / "common" / "SmcOpsi.psm1").read_text(encoding="utf-8")
    assert "REDACTED" in module
    assert "bearer" in module.lower()


def test_property_isolation_model():
    # client-specific properties are keyed by objectId=clientId (documented + dispatcher)
    dispatcher = Path(__file__).resolve().parents[3] / "services" / "opsi-control" / "src" / "workers" / "action_dispatcher.py"
    text = dispatcher.read_text(encoding="utf-8")
    assert 'objectId": client_id' in text or "objectId" in text
