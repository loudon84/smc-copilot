from __future__ import annotations

import json
from pathlib import Path

from integrations.dto import product_on_client_from_wire, property_from_wire

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "opsi-4.3"


def test_opsi_43_fixtures_use_values_list():
    props = json.loads((FIXTURES / "productPropertyState_getObjects.json").read_text(encoding="utf-8"))
    assert props
    for item in props:
        assert "values" in item
        assert isinstance(item["values"], list)
        normalized = property_from_wire(item)
        assert normalized.object_id.endswith(".example.test")
        assert "password" not in json.dumps(item).lower()
        assert "hostkey" not in json.dumps(item).lower()


def test_product_on_client_fixture_fields():
    items = json.loads((FIXTURES / "productOnClient_getObjects.json").read_text(encoding="utf-8"))
    mapped = product_on_client_from_wire(items[0])
    assert mapped.action_request == "none"
    assert mapped.installation_status == "not_installed"


def test_log_read_fixture_instlog():
    payload = json.loads((FIXTURES / "log_read.json").read_text(encoding="utf-8"))
    assert payload["logType"] == "instlog"
    assert payload["maxSize"] == 262144
    assert "SMC_ACTION_RESULT" in payload["body"]


def test_readme_not_live_proven():
    meta = json.loads((FIXTURES / "README.json").read_text(encoding="utf-8"))
    assert meta["liveProven"] is False
    assert meta["source"] == "mock_verified"
