from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime, timedelta

from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from db.repositories.interfaces import ActionRecord, RepositoryBundle, ResultRecord, TargetRecord
from integrations.dto import host_control_from_wire
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import ActionStatus
from schemas.v2.models import V2Operation
from services.v2.action_utils import is_v2_action, v2_operation
from workers.action_dispatcher import _redact_and_cap, _waiting_lease, recompute_aggregate

RESULT_BODY_MAX = 65_536
_SECRET_RE = re.compile(r"api_key|password|bearer |secret", re.IGNORECASE)
HERMES_CLI = '"D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe"'

COMMAND_TEMPLATES: dict[V2Operation, str] = {
    V2Operation.STATUS: f"{HERMES_CLI} status",
    V2Operation.VERSION: f"{HERMES_CLI} --version",
    V2Operation.GATEWAY_STATUS: f"{HERMES_CLI} gateway status",
    V2Operation.GATEWAY_START: f"{HERMES_CLI} gateway start",
    V2Operation.GATEWAY_STOP: f"{HERMES_CLI} gateway stop",
    V2Operation.GATEWAY_RESTART: f"{HERMES_CLI} gateway restart",
    V2Operation.CONFIG_CHECK: f"{HERMES_CLI} config check",
    V2Operation.DOCTOR: f"{HERMES_CLI} doctor",
    V2Operation.CONFIG_APPLY: (
        'powershell -NoProfile -ExecutionPolicy Bypass -File '
        '"D:\\Programs\\SMC\\Hermes\\scripts\\HostOperations.ps1" -Operation config-apply'
    ),
    V2Operation.COLLECT_LOGS: (
        'powershell -NoProfile -ExecutionPolicy Bypass -File '
        '"D:\\Programs\\SMC\\Hermes\\scripts\\HostOperations.ps1" -Operation collect-logs'
    ),
    V2Operation.COLLECT_SESSIONS: (
        'powershell -NoProfile -ExecutionPolicy Bypass -File '
        '"D:\\Programs\\SMC\\Hermes\\scripts\\HostOperations.ps1" -Operation collect-sessions'
    ),
    V2Operation.UPDATE: (
        'powershell -NoProfile -ExecutionPolicy Bypass -File '
        '"D:\\Programs\\SMC\\Hermes\\scripts\\HostOperations.ps1" -Operation update'
    ),
    V2Operation.REPAIR: (
        'powershell -NoProfile -ExecutionPolicy Bypass -File '
        '"D:\\Programs\\SMC\\Hermes\\scripts\\HostOperations.ps1" -Operation repair'
    ),
}


def command_for_action(action: ActionRecord) -> str:
    operation = v2_operation(action)
    template = COMMAND_TEMPLATES.get(operation)
    if template is None:
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, f"unsupported v2 operation: {operation}", status_code=400)
    payload = json.loads(action.payload_json or "{}")
    if operation == V2Operation.CONFIG_APPLY:
        revision = payload.get("configRevision")
        if revision is None:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "configRevision required", status_code=400)
        return f'{template} -ConfigRevision {int(revision)}'
    if operation == V2Operation.COLLECT_LOGS:
        since = int(payload.get("sinceHours") or 24)
        max_bytes = int(payload.get("maxBytes") or 52_428_800)
        return f"{template} -SinceHours {since} -MaxBytes {max_bytes}"
    if operation == V2Operation.COLLECT_SESSIONS:
        session_id = str(payload.get("sessionId") or "")
        if not session_id:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "sessionId required", status_code=400)
        return f'{template} -SessionId "{session_id}"'
    if operation == V2Operation.UPDATE:
        release_version = str(payload.get("releaseVersion") or action.hermes_version or "")
        if not release_version or release_version.lower() in {"latest", "main", "master"}:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "exact releaseVersion required", status_code=400)
        return f'{template} -ReleaseVersion "{release_version}"'
    if operation == V2Operation.REPAIR:
        level = int(payload.get("repairLevel") or action.auto_repair_level or 1)
        return f"{template} -RepairLevel {level}"
    if ";" in template or "|" in template or "&" in template:
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "command injection rejected", status_code=400)
    return template


async def _put_result(
    repos: RepositoryBundle,
    target: TargetRecord,
    status: ActionStatus,
    *,
    body: str = "",
    error_code: str = "",
) -> str:
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest() if body else ""
    await repos.results.put(
        ResultRecord(
            request_id=target.request_id,
            client_id=target.client_id,
            status=status,
            sha256=digest,
            body=body,
            redacted=True,
            bytes=len(body.encode("utf-8")),
            error_code=error_code,
            body_digest=digest,
        )
    )
    return digest


async def dispatch_v2_target(
    *,
    rpc: OpsiJsonRpc,
    repos: RepositoryBundle,
    target: TargetRecord,
    action: ActionRecord,
    settings: Settings,
    worker_id: str,
) -> None:
    now = datetime.now(UTC)
    if action.deadline and now > action.deadline:
        target.status = ActionStatus.UNKNOWN
        target.error_code = "CLIENT_OFFLINE"
        target.message = "deadline exceeded while waiting for client"
        await _put_result(repos, target, ActionStatus.UNKNOWN, error_code="CLIENT_OFFLINE")
        await repos.audit.add(target.request_id, worker_id, "v2.target.unknown", target.client_id)
        return
    raw_reachable = await rpc.call("hostControlSafe_reachable", [target.client_id])
    reachable = host_control_from_wire("hostControlSafe_reachable", target.client_id, raw_reachable)
    if reachable.reachable is not True:
        target.status = ActionStatus.WAITING_CLIENT
        target.error_code = "CLIENT_OFFLINE"
        target.message = (reachable.error or "endpoint not reachable")[:512]
        target.dispatched = False
        target.lease_until = _waiting_lease(target.attempt)
        await _put_result(repos, target, ActionStatus.WAITING_CLIENT, error_code="CLIENT_OFFLINE")
        await repos.audit.add(target.request_id, worker_id, "v2.target.waiting_client", target.client_id)
        return
    command = command_for_action(action)
    if settings.opsi_env != "test" and _SECRET_RE.search(command):
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "command rejected", status_code=400)
    raw_execute = await rpc.call("hostControlSafe_execute", command, [target.client_id])
    executed = host_control_from_wire("hostControlSafe_execute", target.client_id, raw_execute)
    body = _redact_and_cap(executed.stdout)
    if len(body.encode("utf-8")) > RESULT_BODY_MAX:
        body = body[:RESULT_BODY_MAX]
    if not executed.success:
        target.status = ActionStatus.FAILED
        target.error_code = ErrorCode.OPSI_UNAVAILABLE.value
        target.message = (executed.error or "command failed")[:512]
        await _put_result(repos, target, ActionStatus.FAILED, body=body, error_code=target.error_code)
        await repos.audit.add(target.request_id, worker_id, "v2.target.failed", executed.error)
        return
    digest = await _put_result(repos, target, ActionStatus.SUCCEEDED, body=body)
    target.status = ActionStatus.SUCCEEDED
    target.dispatched = True
    target.error_code = ""
    target.message = body[:512]
    target.property_digest = digest
    target.opsi_action = "hostControlSafe_execute"
    target.last_observed_at = now
    await repos.audit.add(target.request_id, worker_id, "v2.target.dispatched", target.client_id)


async def dispatch_v2_queued(
    repos: RepositoryBundle,
    rpc: OpsiJsonRpc,
    settings: Settings,
    worker_id: str = "v2-dispatcher",
) -> int:
    await repos.heartbeats.touch(worker_id, "v2-dispatcher")
    claimed = await repos.targets.claim_queued(worker_id)
    handled = 0
    in_flight: dict[str, int] = {}
    for target in claimed:
        action = await repos.actions.get(target.request_id)
        if action is None or not is_v2_action(action):
            continue
        if action.status == ActionStatus.CANCELLED:
            target.status = ActionStatus.CANCELLED
            target.message = "action cancelled"
            await repos.targets.put(target)
            handled += 1
            continue
        payload = json.loads(action.payload_json or "{}")
        concurrency = int(payload.get("concurrency", 1))
        current = in_flight.get(action.request_id, 0)
        all_targets = await repos.targets.list_for_request(action.request_id)
        active = sum(
            1 for t in all_targets
            if t.status in {ActionStatus.QUEUED, ActionStatus.WAITING_CLIENT}
            and t.dispatched
            and t.client_id != target.client_id
        )
        if active + current >= concurrency:
            continue
        try:
            await dispatch_v2_target(
                rpc=rpc,
                repos=repos,
                target=target,
                action=action,
                settings=settings,
                worker_id=worker_id,
            )
        except OpsiControlError as exc:
            target.status = ActionStatus.FAILED
            target.error_code = exc.code
            target.message = exc.message
            await repos.audit.add(target.request_id, worker_id, "v2.target.failed", exc.message)
        await repos.targets.put(target)
        await recompute_aggregate(repos, target.request_id)
        in_flight[action.request_id] = current + 1
        handled += 1
    return handled
