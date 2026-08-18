from __future__ import annotations

import json
from datetime import UTC, datetime

from db.repositories.interfaces import RepositoryBundle
from db.repositories.v2_store import ClientSnapshotRecord
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import ActionStatus
from services.v2.action_utils import is_v2_action, v2_operation
from workers.action_dispatcher import recompute_aggregate


def _parse_status_body(body: str) -> dict:
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {"raw": body[:1024]}


async def reconcile_v2_open(
    repos: RepositoryBundle,
    rpc: OpsiJsonRpc,
    *,
    v2_clients,
    worker_id: str = "v2-reconciler",
) -> int:
    await repos.heartbeats.touch(worker_id, "v2-reconciler")
    actions = await repos.actions.list_open()
    handled = 0
    for action in actions:
        if not is_v2_action(action):
            continue
        targets = await repos.targets.list_for_request(action.request_id)
        for target in targets:
            if target.status not in {ActionStatus.SUCCEEDED, ActionStatus.FAILED, ActionStatus.UNKNOWN}:
                continue
            result = await repos.results.get(action.request_id, target.client_id)
            if result is None:
                continue
            if target.status != ActionStatus.SUCCEEDED:
                continue
            operation = v2_operation(action)
            payload = _parse_status_body(result.body)
            snapshot = ClientSnapshotRecord(
                client_id=target.client_id,
                reachable=True,
                payload_json=json.dumps(
                    {
                        "clientId": target.client_id,
                        "reachable": True,
                        "hermes": payload.get("hermes") or {"installed": True, "version": payload.get("version", "")},
                        "gateway": payload.get("gateway") or {},
                        "config": payload.get("config") or {},
                        "operation": operation.value,
                    }
                ),
                updated_at=datetime.now(UTC),
            )
            if v2_clients is not None:
                await v2_clients.put_snapshot(snapshot)
            await repos.audit.add(action.request_id, worker_id, "v2.snapshot.updated", target.client_id)
            handled += 1
        await recompute_aggregate(repos, action.request_id)
    return handled
