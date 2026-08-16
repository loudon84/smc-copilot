from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from core.auth import digest_payload
from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from db.repositories.interfaces import ActionRecord, PolicyRecord, RepositoryBundle, TargetRecord
from domain.inventory import EndpointBindingRecord
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
    def __init__(self, rpc: OpsiJsonRpc, product_id: str, store=None, collector=None) -> None:
        self.rpc = rpc
        self.product_id = product_id
        self.store = store
        self.collector = collector

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
        evidence = None
        if self.store is not None:
            getter = getattr(self.store, "get_controller_evidence", None)
            if getter:
                evidence = await getter(client_id)
        now = datetime.now(UTC)
        if not evidence:
            return {
                "schema": "smc.opsi.endpoint-controller-state.v2",
                "owner": "",
                "clientId": client_id,
                "timestamp": now.isoformat(),
                "hermes": {"version": "unknown", "profile": "default"},
                "gateway": {"port": 8642, "reachable": False},
                "config": {"revision": 0, "status": "UNKNOWN"},
                "health": "UNKNOWN",
                "stale": True,
                "commandSucceeded": None,
            }
        observed = evidence.get("observedAt") or evidence.get("timestamp")
        stale = False
        if observed:
            try:
                stamp = datetime.fromisoformat(str(observed).replace("Z", "+00:00"))
                stale = now - stamp > timedelta(hours=24)
            except ValueError:
                stale = True
        health = str(evidence.get("health") or "UNKNOWN")
        if stale:
            health = "UNKNOWN"
        return {
            "schema": "smc.opsi.endpoint-controller-state.v2",
            "owner": str(evidence.get("owner") or ""),
            "clientId": client_id,
            "timestamp": now.isoformat(),
            "hermes": {
                "version": evidence.get("runtimeVersion") or evidence.get("runtime_version") or "unknown",
                "profile": evidence.get("profile") or "default",
            },
            "gateway": {
                "port": int(evidence.get("port") or 8642),
                "reachable": bool(evidence.get("gatewayReachable") or evidence.get("gateway_reachable")),
            },
            "config": {"revision": int(evidence.get("configRevision") or 0), "status": "UNKNOWN"},
            "health": health,
            "controller": {
                "revision": evidence.get("controllerRevision") or evidence.get("controller_revision") or "",
                "digest": evidence.get("controllerDigest") or evidence.get("controller_digest") or "",
            },
            "runtime": {
                "version": evidence.get("runtimeVersion") or evidence.get("runtime_version") or "",
                "digest": evidence.get("runtimeDigest") or evidence.get("runtime_digest") or "",
            },
            "transaction": {
                "phase": evidence.get("transactionPhase") or evidence.get("transaction_phase") or "",
                "open": bool(evidence.get("openTransaction")),
            },
            "stale": stale,
        }

    async def put_binding(self, client_id: str, body, principal) -> dict:
        if self.store is None:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "inventory store required", status_code=412)
        current = await self.store.get_binding(client_id)
        revision = (current.revision + 1) if current else 1
        record = EndpointBindingRecord(
            client_id=client_id,
            user_sid=body.user_sid,
            user_account=body.user_account,
            evidence_ref=body.evidence_ref,
            revision=revision,
            approved_by=principal.subject,
            observed_at=datetime.now(UTC),
            reason=body.reason,
            change_ticket=body.change_ticket,
        )
        await self.store.put_binding(record)
        return {
            "clientId": client_id,
            "revision": revision,
            "bindingSource": "operator-binding",
            "redactedAccount": True,
        }

    async def put_evidence(self, client_id: str, body) -> dict:
        if self.store is None:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "inventory store required", status_code=412)
        await self.get_client(client_id)
        evidence = {
            "os": body.os,
            "lastSeenMinutes": body.last_seen_minutes,
            "owner": body.owner,
            "diskFreeMb": body.disk_free_mb,
            "gatewayHealthy": body.gateway_healthy,
            "previousVersion": body.previous_version,
            "previousDigest": body.previous_digest,
            "cliPath": body.cli_path,
            "cliVersion": body.cli_version,
            "bootstrapTask": body.bootstrap_task,
            "gatewayTask": body.gateway_task,
        }
        await self.store.put_evidence(client_id, evidence)
        snapshot = await self.collector.refresh(client_id) if self.collector else None
        if snapshot is None:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "inventory incomplete", status_code=412)
        return await self.inventory_evidence(client_id)

    async def refresh_inventory(self, client_id: str) -> dict:
        if self.collector is None:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "collector required", status_code=412)
        snapshot = await self.collector.refresh(client_id)
        if snapshot is None:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "inventory incomplete", status_code=412)
        return await self.inventory_evidence(client_id)

    async def inventory_evidence(self, client_id: str) -> dict:
        if self.store is None:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "inventory store required", status_code=412)
        snapshot = await self.store.get_snapshot(client_id)
        if snapshot is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "inventory evidence not found", status_code=404)
        return {
            "schema": "smc.opsi.endpoint-inventory.v1",
            "clientId": snapshot.client_id,
            "timestamp": snapshot.observed_at.isoformat(),
            "sourceTrustLevel": snapshot.trust_level,
            "os": snapshot.os,
            "diskFreeMb": snapshot.disk_free_mb,
            "owner": snapshot.owner,
            "baselineKind": snapshot.baseline_kind,
            "artifactDigest": snapshot.previous_digest or None,
            "cliVersion": snapshot.cli_version or None,
            "gatewayReachable": snapshot.gateway_healthy,
            "contentDigest": snapshot.content_digest,
            "redacted": True,
            "userBindingSource": snapshot.binding_source,
        }

    async def put_controller_evidence(self, client_id: str, body) -> dict:
        if self.store is None:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "inventory store required", status_code=412)
        await self.get_client(client_id)
        payload = body.model_dump(by_alias=True, exclude_none=True)
        payload["observedAt"] = (body.observed_at or datetime.now(UTC)).isoformat()
        await self.store.put_controller_evidence(client_id, payload)
        return await self.client_state(client_id)

    async def get_controller(self, client_id: str) -> dict:
        state = await self.client_state(client_id)
        controller = state.get("controller") or {}
        return {
            "clientId": client_id,
            "revision": controller.get("revision") or "",
            "digest": controller.get("digest") or "",
            "runtimeVersion": (state.get("runtime") or {}).get("version") or "",
            "health": state.get("health"),
            "owner": state.get("owner") or "",
            "stale": bool(state.get("stale")),
            "redacted": True,
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
