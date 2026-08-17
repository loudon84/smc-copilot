#!/usr/bin/env python3
"""Validate OPSI JSON Schema files used by the Product."""

from __future__ import annotations

import json
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "contracts" / "opsi"
CONTROL = ROOT / "infra" / "opsi" / "products" / "smc-hermes-agent" / "OPSI" / "control.toml"
CONTROL_SCHEMA = ROOT / "infra" / "opsi" / "products" / "smc-hermes-agent" / "packaging" / "control_schema.py"


def main() -> int:
    required = [
        "endpoint-state.schema.json",
        "action-request.schema.json",
        "action-result.schema.json",
        "diagnostic.schema.json",
        "managed-config.schema.json",
        "endpoint-inventory.schema.json",
        "runtime-artifact-manifest.schema.json",
        "endpoint-controller-manifest.schema.json",
        "endpoint-controller-state.schema.json",
        "endpoint-command.schema.json",
        "endpoint-transaction.schema.json",
        "product-release.schema.json",
        "runtime-profile.schema.json",
        "runtime-build.schema.json",
        "client-release.schema.json",
        "client-release-config.schema.json",
    ]
    for name in required:
        path = SCHEMAS / name
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data.get("additionalProperties") is False
        assert "title" in data
    text = CONTROL.read_text(encoding="utf-8")
    assert 'id = "smc-hermes-agent"' in text
    assert "latest" not in text.lower() or "forbidden" in text.lower()
    spec = spec_from_file_location("control_schema", CONTROL_SCHEMA)
    assert spec and spec.loader
    schema = module_from_spec(spec)
    spec.loader.exec_module(schema)
    schema.validate_control_schema(CONTROL, expected_product_version="1.7.2", expected_package_version="1")
    print("ok: opsi schemas and control.toml")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
