from __future__ import annotations

import hashlib
import re
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

PRODUCT = Path(__file__).resolve().parents[1] / "products" / "smc-hermes-agent"


def test_control_toml_localboot_and_allowlist():
    text = (PRODUCT / "OPSI" / "control.toml").read_text(encoding="utf-8")
    assert 'id = "smc-hermes-agent"' in text
    assert 'type = "localboot"' in text
    spec = spec_from_file_location("control_schema", PRODUCT / "packaging" / "control_schema.py")
    assert spec and spec.loader
    schema = module_from_spec(spec)
    spec.loader.exec_module(schema)
    data = schema.validate_control_schema(PRODUCT / "OPSI" / "control.toml")
    version = schema.product_version(data)
    assert version.lower() != "latest"
    assert "latest is forbidden" in text.lower() or "exact" in text.lower()
    for op in ("status", "collect-log", "apply-config", "restart-gateway", "diagnose", "repair", "reconcile-controller"):
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
        if "Invoke-Expression" in text or re.search(r"\biex\b", text, re.I):
            offenders.append(str(path))
        if "Stop-Process -Name python" in text:
            offenders.append(str(path))
    assert offenders == []


def test_redaction_covers_bearer():
    module = (PRODUCT / "scripts" / "common" / "SmcOpsi.psm1").read_text(encoding="utf-8")
    assert "REDACTED" in module
    assert "bearer" in module.lower()


def test_property_isolation_model():
    dispatcher = Path(__file__).resolve().parents[3] / "services" / "opsi-control" / "src" / "workers" / "action_dispatcher.py"
    text = dispatcher.read_text(encoding="utf-8")
    assert "objectId" in text
    assert "values" in text


def test_smoke_package_is_not_opsi_suffix(tmp_path):
    spec = spec_from_file_location("makepackage", PRODUCT / "packaging" / "makepackage.py")
    assert spec and spec.loader
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    archive = module.build_smoke(tmp_path)
    assert archive.suffixes[-2:] == [".smoke", ".zip"] or archive.name.endswith(".smoke.zip")
    assert not archive.name.endswith(".opsi")
    hashlib.sha256(archive.read_bytes()).hexdigest()
    source_pub = PRODUCT / "CLIENT_DATA" / "keys" / "release-public-key.pem"
    if source_pub.exists():
        after = source_pub.read_bytes()
        assert after
