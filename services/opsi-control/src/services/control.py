from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from core.auth import digest_payload
from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from db.repositories.interfaces import ActionRecord, PolicyRecord, RepositoryBundle, TargetRecord
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import (
    ActionCreateRequest,
    ActionStatus,
    ActionTargetView,
    ActionView,
    DiagnosticView,
    Operation,
    PolicyApplyRequest,
    TargetRef,
)
from workers.action_dispatcher import dispatch_queued
from workers.result_reconciler import parse_result_marker, reconcile_open


class InventoryService:
    def __init__(self, rpc: OpsiJsonRpc, product_id: str) -> None:
        self.rpc = rpc
        self.product_id = product_id

    async def list_clients(self) -> list[dict]:
        hosts = await self.rpc.call("host_getObjects", {"type": "OpsiClient"}, [])
        return [{"clientId": item.get("id"), "description": item.get("description") or ""} for item in hosts]

    async def get_client(self, client_id: str) -> dict:
        hosts = await self.rpc.call("host_getObjects", {"id": client_id}, [])
        if not hosts:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "client not found", status_code=404)
        item = hosts[0]
        return {"clientId": item.get("id"), "description": item.get("description") or ""}

    async def list_products(self) -> list[dict]:
        products = await self.rpc.call("productOnDepot_getObjects", {}, [])
        return [
            {
                "productId": item.get("productId"),
                "productVersion": item.get("productVersion"),
                "packageVersion": item.get("packageVersion"),
            }
            for item in products
            if item.get("productId") == self.product_id
        ]

    async def client_state(self, client_id: str) -> dict:
        await self.get_client(client_id)
        poc = await self.rpc.call(
            "productOnClient_getObjects", {"clientId": client_id, "productId": self.product_id}, []
        )
        installation = (poc[0].get("installationStatus") if poc else "") or "unknown"
        health = "UNKNOWN"
        if installation.lower() == "installed":
            health = "HEALTHY"
        elif installation.lower() in {"failed"}:
            health = "CRITICAL"
        now = datetime.now(UTC).isoformat()
        return {
            "schema": "smc.hermes.state.v1",
            "owner": "opsi",
            "clientId": client_id,
            "timestamp": now,
            "hermes": {"version": "unknown", "profile": "default"},
            "gateway": {"port": 8642, "reachable": health == "HEALTHY"},
            "config": {"revision": 0, "status": "UNKNOWN"},
            "health": health,
        }


class ActionService:
    def __init__(self, repos: RepositoryBundle, rpc: OpsiJsonRpc, settings: Settings) -> None:
        self.repos = repos
        self.rpc = rpc
        self.settings = settings

    async def create(self, body: ActionCreateRequest, actor_id: str) -> ActionView:
        digest = digest_payload(body.model_dump(by_alias=True, exclude_none=True))
        existing = await self.repos.actions.get(body.request_id)
        if existing is not None:
            if existing.payload_digest != digest:
                raise OpsiControlError(ErrorCode.CONFLICT, "request_id payload mismatch", status_code=409)
            return await self.get(body.request_id)
        now = datetime.now(UTC)
        record = ActionRecord(
            request_id=body.request_id,
            operation=body.operation,
            payload_digest=digest,
            status=ActionStatus.QUEUED,
            actor_id=actor_id,
            created_at=now,
            updated_at=now,
            deadline=now + timedelta(hours=4),
            payload_json=json.dumps(body.model_dump(by_alias=True, exclude_none=True), sort_keys=True),
            hermes_version=body.hermes_version,
            config_revision=body.config_revision,
            auto_repair_level=body.auto_repair_level,
        )
        await self.repos.actions.put(record)
        for target in body.targets:
            binding = target.user_binding
            await self.repos.targets.put(
                TargetRecord(
                    request_id=body.request_id,
                    client_id=target.client_id,
                    status=ActionStatus.QUEUED,
                    user_sid=binding.sid if binding else "",
                    user_account=binding.account if binding else "",
                )
            )
        await self.repos.audit.add(body.request_id, actor_id, "action.created", body.operation.value)
        return await self.get(body.request_id)

    async def dispatch_once(self) -> int:
        return await dispatch_queued(self.repos, self.rpc, self.settings.product_id)

    async def reconcile_once(self) -> int:
        return await reconcile_open(self.repos, self.rpc, self.settings.product_id)

    async def get(self, request_id: str) -> ActionView:
        record = await self.repos.actions.get(request_id)
        if record is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "action not found", status_code=404)
        targets = await self.repos.targets.list_for_request(request_id)
        return ActionView(
            request_id=record.request_id,
            operation=record.operation,
            status=record.status,
            payload_digest=record.payload_digest,
            created_at=record.created_at,
            updated_at=record.updated_at,
            targets=[
                ActionTargetView(
                    client_id=item.client_id,
                    status=item.status,
                    error_code=item.error_code or None,
                    message=item.message or None,
                    attempt=item.attempt,
                    user_binding=item.user_binding,
                )
                for item in targets
            ],
        )

    async def results(self, request_id: str) -> list[dict]:
        await self.get(request_id)
        stored = await self.repos.results.list_for_request(request_id)
        if stored:
            return [
                {
                    "schema": "smc.opsi.action-result.v1",
                    "requestId": item.request_id,
                    "clientId": item.client_id,
                    "status": item.status.value,
                    "timestamp": item.updated_at.isoformat(),
                    "sha256": item.sha256 or None,
                    "bytes": item.bytes,
                    "redacted": item.redacted,
                    "errorCode": item.error_code or None,
                    "message": item.body[:512] if item.body else None,
                    "attempt": None,
                    "propertyDigest": None,
                    "opsiModificationTime": None,
                }
                for item in stored
            ]
        targets = await self.repos.targets.list_for_request(request_id)
        out = []
        for target in targets:
            log = await self.rpc.call("log_read", "instlog", target.client_id, 262144)
            marker = parse_result_marker(str(log or ""), request_id, target.client_id)
            out.append(
                {
                    "schema": "smc.opsi.action-result.v1",
                    "requestId": request_id,
                    "clientId": target.client_id,
                    "status": (marker or {}).get("status") or target.status.value,
                    "timestamp": datetime.now(UTC).isoformat(),
                    "sha256": (marker or {}).get("sha256"),
                    "redacted": True,
                }
            )
        return out


class PolicyService:
    def __init__(self, action_service: ActionService, repos: RepositoryBundle) -> None:
        self.action_service = action_service
        self.repos = repos

    async def apply(self, body: PolicyApplyRequest, actor_id: str) -> ActionView:
        payload = body.model_dump(by_alias=True, exclude_none=True)
        digest = digest_payload(payload)
        await self.repos.policies.put(
            PolicyRecord(
                revision=body.revision,
                payload_digest=digest,
                payload_json=json.dumps(payload, sort_keys=True, separators=(",", ":")),
            )
        )
        request = ActionCreateRequest(
            request_id=f"req_pol_{body.revision:06d}_{actor_id[:8]}",
            operation=Operation.APPLY_CONFIG,
            targets=[TargetRef(client_id=client_id) for client_id in body.client_ids],
            config_revision=body.revision,
        )
        view = await self.action_service.create(request, actor_id)
        stored = await self.repos.policies.get(body.revision)
        if stored:
            stored.request_id = view.request_id
            await self.repos.policies.put(stored)
        return view


class DiagnosticService:
    def __init__(self, repos: RepositoryBundle) -> None:
        self.repos = repos

    async def get(self, request_id: str) -> DiagnosticView:
        record = await self.repos.diagnostics.get(request_id)
        if record is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "diagnostic not found", status_code=404)
        files = json.loads(record.files_json or "[]")
        return DiagnosticView(
            request_id=record.request_id,
            client_id=record.client_id,
            issue_code=record.issue_code,
            severity=record.severity,
            recommended_action=record.recommended_action,
            files=files,
            manifest_digest=record.manifest_digest or None,
        )
