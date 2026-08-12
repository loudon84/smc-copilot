from __future__ import annotations

from services.invocation import build_invocation


def test_returner_contract_items_payload_redacted():
    # Contract file shape expected by Salt Control JobReturnBatchRequest.
    sample = {
        "requestId": "r1",
        "items": [
            {
                "jid": "jid-1",
                "endpointId": "ep_1",
                "function": "smc_hermes.health",
                "success": True,
                "payloadRedacted": {"ok": True},
            }
        ],
    }
    assert "items" in sample
    assert "returns" not in sample
    assert "payloadRedacted" in sample["items"][0]
    assert "payload" not in sample["items"][0]


def test_invocation_handover_is_migrate_not_commit():
    inv = build_invocation("handover")
    assert inv.function == "smc_handover.migrate"
    assert inv.mutation is True
