from __future__ import annotations

import hashlib
import json
import re

from core.auth import digest_payload
from db.repositories.interfaces import DiagnosticRecord, RepositoryBundle, ResultRecord
from integrations.dto import product_on_client_from_wire
from integrations.opsi_jsonrpc import INSTLOG_MAX, OpsiJsonRpc
from schemas.models import ActionStatus
from workers.action_dispatcher import recompute_aggregate

_MARKER = re.compile(
    r"SMC_ACTION_RESULT request_id=(?P<request_id>req_[A-Za-z0-9_-]+) "
    r"client_id=(?P<client_id>[A-Za-z0-9._-]+) "
    r"sha256=(?P<sha256>[a-fA-F0-9]{64}) "
    r"status=(?P<status>[A-Z_]+) "
    r"bytes=(?P<bytes>\d+) redacted=true"
)

_COMPACT = re.compile(
    r"SMC_DIAGNOSTIC request_id=(?P<request_id>req_[A-Za-z0-9_-]+) "
    r"client_id=(?P<client_id>[A-Za-z0-9._-]+) "
    r"index=(?P<index>\d+) total=(?P<total>\d+) digest=(?P<digest>[a-fA-F0-9]{64}) "
    r"chunk=(?P<chunk>[A-Za-z0-9+/=]+)"
)

SECRET_CANARY = ("api_key", "password", "bearer ", "secret")


def parse_result_marker(log_text: str, request_id: str, client_id: str) -> dict[str, str] | None:
    last: dict[str, str] | None = None
    for match in _MARKER.finditer(log_text):
        if match.group("request_id") == request_id and match.group("client_id") == client_id:
            last = match.groupdict()
    return last


def parse_compact_diagnostic(log_text: str, request_id: str, client_id: str) -> dict | None:
    chunks: dict[int, str] = {}
    digest = ""
    total = 0
    for match in _COMPACT.finditer(log_text):
        if match.group("request_id") != request_id or match.group("client_id") != client_id:
            continue
        digest = match.group("digest")
        total = int(match.group("total"))
        chunks[int(match.group("index"))] = match.group("chunk")
    if not chunks or total <= 0:
        return None
    ordered = "".join(chunks[i] for i in range(total) if i in chunks)
    if len(chunks) != total:
        return None
    try:
        body = json.loads(ordered)
    except json.JSONDecodeError:
        import base64

        body = json.loads(base64.b64decode(ordered).decode("utf-8"))
    encoded = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if hashlib.sha256(encoded).hexdigest() != digest:
        return None
    return body


async def reconcile_open(
    repos: RepositoryBundle, rpc: OpsiJsonRpc, product_id: str, worker_id: str = "reconciler"
) -> int:
    await repos.heartbeats.touch(worker_id, "reconciler")
    open_actions = await repos.actions.list_open()
    handled = 0
    for action in open_actions:
        targets = await repos.targets.list_for_request(action.request_id)
        for target in targets:
            if target.status in {ActionStatus.SUCCEEDED, ActionStatus.FAILED, ActionStatus.CANCELLED}:
                continue
            log = ""
            try:
                log = str(await rpc.call("log_read", "instlog", target.client_id, INSTLOG_MAX) or "")
            except Exception:
                continue
            if any(token in log.lower() for token in SECRET_CANARY):
                target.status = ActionStatus.FAILED
                target.error_code = "SECRET_LEAK"
                target.message = "secret canary in instlog"
                await repos.targets.put(target)
                await repos.audit.add(action.request_id, worker_id, "security.secret_canary", target.client_id)
                await recompute_aggregate(repos, action.request_id)
                handled += 1
                continue
            marker = parse_result_marker(log, action.request_id, target.client_id)
            if marker is None:
                try:
                    poc = await rpc.call(
                        "productOnClient_getObjects",
                        {"clientId": target.client_id, "productId": product_id},
                        [],
                    )
                    if poc:
                        mapped = product_on_client_from_wire(poc[0])
                        target.opsi_modification_time = mapped.modification_time or ""
                        target.last_observed_at = target.last_observed_at
                        if mapped.action_request not in {"", "none"}:
                            target.status = ActionStatus.RUNNING
                            await repos.targets.put(target)
                    await recompute_aggregate(repos, action.request_id)
                except Exception:
                    pass
                continue
            status = ActionStatus.UNKNOWN
            try:
                status = ActionStatus(marker["status"])
            except ValueError:
                status = ActionStatus.UNKNOWN
            if status == ActionStatus.SUCCEEDED and "USER_CONTEXT_PENDING" in log:
                status = ActionStatus.RUNNING
            bytes_n = int(marker.get("bytes") or 0)
            if bytes_n > 65_536:
                status = ActionStatus.FAILED
            await repos.results.put(
                ResultRecord(
                    request_id=action.request_id,
                    client_id=target.client_id,
                    status=status,
                    sha256=marker["sha256"],
                    body="",
                    redacted=True,
                    bytes=bytes_n,
                    error_code="" if status != ActionStatus.FAILED else "ADAPTER_FAILED",
                    body_digest=marker["sha256"],
                )
            )
            compact = None
            try:
                compact = parse_compact_diagnostic(log, action.request_id, target.client_id)
            except Exception:
                compact = None
            if compact:
                await repos.diagnostics.put(
                    DiagnosticRecord(
                        request_id=action.request_id,
                        client_id=target.client_id,
                        issue_code=str(compact.get("issueCode") or "COLLECTED"),
                        severity=str(compact.get("severity") or "INFO"),
                        recommended_action=str(compact.get("recommendedAction") or "review"),
                        files_json=json.dumps(compact.get("files") or []),
                        manifest_digest=str(compact.get("manifestDigest") or digest_payload(compact)),
                    )
                )
            target.status = status if status != ActionStatus.CREATED else ActionStatus.RUNNING
            target.property_digest = target.property_digest
            await repos.targets.put(target)
            await recompute_aggregate(repos, action.request_id)
            handled += 1
    return handled
