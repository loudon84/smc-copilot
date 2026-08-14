from __future__ import annotations

import re

from db.repositories.interfaces import RepositoryBundle, ResultRecord
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import ActionStatus

_MARKER = re.compile(
    r"SMC_ACTION_RESULT request_id=(?P<request_id>req_[A-Za-z0-9_-]+) "
    r"client_id=(?P<client_id>[A-Za-z0-9._-]+) "
    r"sha256=(?P<sha256>[a-fA-F0-9]{64}) "
    r"status=(?P<status>[A-Z]+) "
    r"bytes=(?P<bytes>\d+) redacted=true"
)


def parse_result_marker(log_text: str, request_id: str, client_id: str) -> dict[str, str] | None:
    for match in _MARKER.finditer(log_text):
        if match.group("request_id") == request_id and match.group("client_id") == client_id:
            return match.groupdict()
    return None


async def reconcile_open(repos: RepositoryBundle, rpc: OpsiJsonRpc) -> None:
    open_actions = await repos.actions.list_open()
    for action in open_actions:
        targets = await repos.targets.list_for_request(action.request_id)
        for target in targets:
            log = ""
            try:
                log = str(await rpc.call("log_read", target.client_id) or "")
            except Exception:
                continue
            marker = parse_result_marker(log, action.request_id, target.client_id)
            if marker is None:
                continue
            status = ActionStatus.UNKNOWN
            try:
                status = ActionStatus(marker["status"])
            except ValueError:
                status = ActionStatus.UNKNOWN
            await repos.results.put(
                ResultRecord(
                    request_id=action.request_id,
                    client_id=target.client_id,
                    status=status,
                    sha256=marker["sha256"],
                    body="",
                    redacted=True,
                )
            )
