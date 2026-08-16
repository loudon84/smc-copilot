from __future__ import annotations

import json
from pathlib import Path

from schemas.models import ActionCreateRequest

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "contracts" / "opsi"


def _load(name: str) -> dict:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


def test_action_request_schema_has_user_binding():
    schema = _load("action-request.schema.json")
    target = schema["properties"]["targets"]["items"]["properties"]
    assert "userBinding" in target
    assert target["userBinding"]["properties"]["sid"]["pattern"] == "^S-1-[0-9-]+$"


def test_action_result_optional_observability():
    schema = _load("action-result.schema.json")
    assert "attempt" in schema["properties"]
    assert "propertyDigest" in schema["properties"]
    assert "opsiModificationTime" in schema["properties"]
    assert "parentRequestId" in schema["properties"]
    assert "resultKind" in schema["properties"]
    assert "contentSha256" in schema["properties"]


def test_three_way_action_request_example():
    example = {
        "schema": "smc.opsi.action-request.v1",
        "requestId": "req_contract1",
        "operation": "setup",
        "targets": [
            {
                "clientId": "client-a.example",
                "userBinding": {"sid": "S-1-5-21-1-2-3-1001", "account": "lab\\user-a"},
            }
        ],
        "hermesVersion": "0.22.0",
    }
    schema = _load("action-request.schema.json")
    assert example["schema"] == schema["properties"]["schema"]["const"]
    parsed = ActionCreateRequest.model_validate(example)
    dumped = parsed.model_dump(by_alias=True, exclude_none=True)
    assert dumped["targets"][0]["userBinding"]["sid"].startswith("S-1-")
