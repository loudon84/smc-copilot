from __future__ import annotations

import json

from db.repositories.interfaces import ActionRecord
from schemas.v2.models import V2Operation


def is_v2_action(action: ActionRecord) -> bool:
    try:
        payload = json.loads(action.payload_json or "{}")
    except json.JSONDecodeError:
        return False
    return payload.get("schema") == "smc.opsi.action-request.v2"


def v2_operation(action: ActionRecord) -> V2Operation:
    payload = json.loads(action.payload_json or "{}")
    return V2Operation(str(payload["operation"]))
