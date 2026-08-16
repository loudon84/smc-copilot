#!/usr/bin/env python3
"""Validate OPSI JSON Schema files used by the Product."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "contracts" / "opsi"


def main() -> int:
    required = [
        "endpoint-state.schema.json",
        "action-request.schema.json",
        "action-result.schema.json",
        "diagnostic.schema.json",
        "managed-config.schema.json",
        "endpoint-inventory.schema.json",
        "runtime-artifact-manifest.schema.json",
    ]
    for name in required:
        path = SCHEMAS / name
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data.get("additionalProperties") is False
        assert "title" in data
    control = ROOT / "infra" / "opsi" / "products" / "smc-hermes-agent" / "OPSI" / "control.toml"
    text = control.read_text(encoding="utf-8")
    assert 'id = "smc-hermes-agent"' in text
    assert "latest" not in text.lower() or "forbidden" in text.lower()
    print("ok: opsi schemas and control.toml")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
