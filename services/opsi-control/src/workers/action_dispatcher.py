from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Any

from core.auth import digest_payload
from core.errors import ErrorCode, OpsiControlError
from db.repositories.interfaces import RepositoryBundle
from domain.product_release import compat_holds
from integrations.dto import ProductPropertyState, property_from_wire, property_to_wire
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import CUSTOM_OPERATIONS, SETUP_UPDATE, ActionStatus, Operation

MAX_ATTEMPTS = 5


def opsi_action_for(operation: Operation) -> str:
    if operation in {Operation.SETUP, Operation.UPDATE, Operation.UNINSTALL}:
        return operation.value
    if operation in CUSTOM_OPERATIONS:
        return "custom"
    raise OpsiControlError(ErrorCode.VALIDATION_ERROR, f"unsupported operation: {operation}", status_code=400)


def _prop(product_id: str, property_id: str, client_id: str, value: str) -> dict[str, Any]:
    return property_to_wire(
        ProductPropertyState(product_id=product_id, property_id=property_id, object_id=client_id, values=[value])
    )


async def _require_client(rpc: OpsiJsonRpc, client_id: str) -> None:
    hosts = await rpc.call("host_getObjects", {"id": client_id, "type": "OpsiClient"}, [])
    if not hosts:
        raise OpsiControlError(ErrorCode.NOT_FOUND, "client not found", status_code=404)


async def _require_product(
    rpc: OpsiJsonRpc,
    product_id: str,
    hermes_version: str | None,
    release: dict[str, Any] | None = None,
) -> None:
    products = await rpc.call("productOnDepot_getObjects", {}, [])
    matches = [item for item in products if item.get("productId") == product_id]
    if not matches:
        raise OpsiControlError(ErrorCode.NOT_FOUND, "product not on depot", status_code=404)
    if not hermes_version:
        return
    if release:
        product_version = str(release.get("productVersion") or "")
        package_version = str(release.get("packageVersion") or "")
        if product_version and not any(
            item.get("productVersion") == product_version and str(item.get("packageVersion")) == package_version
            for item in matches
        ):
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "depot product release mismatch", status_code=400)
        runtimes = release.get("runtimes") or []
        runtime = next((item for item in runtimes if str(item.get("version")) == hermes_version), None)
        if runtime is None:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "hermes version not in release catalog", status_code=400)
        compat = str(runtime.get("controllerCompat") or "1")
        revision = str(release.get("controllerRevision") or release.get("controller", {}).get("revision") or "1")
        try:
            if not compat_holds(compat, revision):
                raise OpsiControlError(
                    ErrorCode.VALIDATION_ERROR, "controller/runtime compatibility failed", status_code=400
                )
        except ValueError as exc:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, str(exc), status_code=400) from exc
        return
    # Product and Hermes versions are independent; presence on depot is sufficient without a catalog.
    _ = hermes_version


async def dispatch_target(
    *,
    rpc: OpsiJsonRpc,
    product_id: str,
    request_id: str,
    client_id: str,
    operation: Operation,
    hermes_version: str | None,
    config_revision: int | None,
    auto_repair_level: int | None,
    user_sid: str = "",
    user_account: str = "",
    config_payload: str = "",
    config_digest: str = "",
    ack_token: str = "",
    release: dict[str, Any] | None = None,
) -> str:
    await _require_client(rpc, client_id)
    await _require_product(
        rpc,
        product_id,
        hermes_version if operation in SETUP_UPDATE else None,
        release=release,
    )
    if operation in SETUP_UPDATE and (not user_sid or not user_account):
        raise OpsiControlError(
            ErrorCode.VALIDATION_ERROR, "setup/update require verified user binding", status_code=400
        )
    if operation in CUSTOM_OPERATIONS and operation != Operation.STATUS:
        pass

    properties: list[dict[str, Any]] = [
        _prop(product_id, "request_id", client_id, request_id),
        _prop(product_id, "client_id", client_id, client_id),
    ]
    if operation in CUSTOM_OPERATIONS:
        properties.append(_prop(product_id, "custom_operation", client_id, operation.value))
    if hermes_version:
        properties.append(_prop(product_id, "hermes_version", client_id, hermes_version))
    if config_revision is not None:
        properties.append(_prop(product_id, "config_revision", client_id, str(config_revision)))
    if config_payload:
        encoded = base64.urlsafe_b64encode(config_payload.encode("utf-8")).decode("ascii").rstrip("=")
        properties.append(_prop(product_id, "config_payload", client_id, encoded))
    if config_digest:
        properties.append(_prop(product_id, "config_digest", client_id, config_digest))
    if auto_repair_level is not None:
        properties.append(_prop(product_id, "auto_repair_level", client_id, str(auto_repair_level)))
    if user_sid:
        properties.append(_prop(product_id, "managed_user_sid", client_id, user_sid))
    if user_account:
        properties.append(_prop(product_id, "managed_user_account", client_id, user_account))
    if ack_token:
        properties.append(_prop(product_id, "ack_token", client_id, ack_token))

    await rpc.call("productPropertyState_updateObjects", properties)
    verified = await rpc.call("productPropertyState_getObjects", {"objectId": client_id, "productId": product_id}, [])
    by_prop = {property_from_wire(item).property_id: property_from_wire(item).value for item in verified}
    expected = {item["propertyId"]: item["values"][0] for item in properties if item["values"]}
    for key, value in expected.items():
        if by_prop.get(key) != value:
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "property read-back mismatch", status_code=502)
    digest = digest_payload(expected)
    action = opsi_action_for(operation)
    await rpc.call(
        "productOnClient_updateObjects",
        [
            {
                "productId": product_id,
                "clientId": client_id,
                "actionRequest": action,
            }
        ],
    )
    read_back = await rpc.call("productOnClient_getObjects", {"clientId": client_id, "productId": product_id}, [])
    if not read_back or str(read_back[0].get("actionRequest")) != action:
        raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "actionRequest read-back mismatch", status_code=502)
    return digest


async def dispatch_queued(
    repos: RepositoryBundle, rpc: OpsiJsonRpc, product_id: str, worker_id: str = "dispatcher"
) -> int:
    await repos.heartbeats.touch(worker_id, "dispatcher")
    claimed = await repos.targets.claim_queued(worker_id)
    handled = 0
    for target in claimed:
        if target.attempt > MAX_ATTEMPTS:
            target.status = ActionStatus.FAILED
            target.error_code = ErrorCode.OPSI_UNAVAILABLE.value
            target.message = "bounded attempts exceeded"
            await repos.targets.put(target)
            await recompute_aggregate(repos, target.request_id)
            handled += 1
            continue
        action = await repos.actions.get(target.request_id)
        if action is None:
            continue
        config_payload = ""
        config_digest = ""
        ack_token = ""
        if action.config_revision is not None:
            policy = await repos.policies.get(action.config_revision)
            if policy:
                config_payload = policy.payload_json
                config_digest = policy.payload_digest
        inventory = getattr(repos, "inventory_store", None)
        getter = getattr(inventory, "get_result_ack", None) if inventory is not None else None
        if getter and action.operation == Operation.STATUS:
            ack_token = (await getter(target.request_id, target.client_id)) or ""
        release = None
        release_getter = getattr(inventory, "get_product_release", None) if inventory is not None else None
        if release_getter:
            release = await release_getter("smc-hermes-agent")
        try:
            digest = await dispatch_target(
                rpc=rpc,
                product_id=product_id,
                request_id=target.request_id,
                client_id=target.client_id,
                operation=action.operation,
                hermes_version=action.hermes_version,
                config_revision=action.config_revision,
                auto_repair_level=action.auto_repair_level,
                user_sid=target.user_sid,
                user_account=target.user_account,
                config_payload=config_payload,
                config_digest=config_digest,
                ack_token=ack_token,
                release=release,
            )
            target.status = ActionStatus.DISPATCHED
            target.dispatched = True
            target.property_digest = digest
            target.opsi_action = opsi_action_for(action.operation)
            target.last_observed_at = datetime.now(UTC)
            await repos.audit.add(target.request_id, worker_id, "target.dispatched", target.client_id)
        except OpsiControlError as exc:
            target.status = ActionStatus.FAILED
            target.error_code = exc.code
            target.message = exc.message
            await repos.audit.add(target.request_id, worker_id, "target.failed", exc.message)
        await repos.targets.put(target)
        await recompute_aggregate(repos, target.request_id)
        handled += 1
    return handled


async def recompute_aggregate(repos: RepositoryBundle, request_id: str) -> None:
    action = await repos.actions.get(request_id)
    if action is None:
        return
    targets = await repos.targets.list_for_request(request_id)
    if not targets:
        return
    statuses = {item.status for item in targets}
    if ActionStatus.QUEUED in statuses:
        action.status = ActionStatus.QUEUED
    elif ActionStatus.DISPATCHED in statuses or ActionStatus.RUNNING in statuses:
        action.status = ActionStatus.DISPATCHED if ActionStatus.DISPATCHED in statuses else ActionStatus.RUNNING
    elif ActionStatus.RUNNING in statuses:
        action.status = ActionStatus.RUNNING
    elif all(item.status == ActionStatus.SUCCEEDED for item in targets):
        action.status = ActionStatus.SUCCEEDED
    elif all(
        item.status in {ActionStatus.SUCCEEDED, ActionStatus.FAILED, ActionStatus.CANCELLED, ActionStatus.UNKNOWN}
        for item in targets
    ):
        if any(item.status == ActionStatus.FAILED for item in targets):
            action.status = ActionStatus.FAILED
        elif any(item.status == ActionStatus.UNKNOWN for item in targets):
            action.status = ActionStatus.UNKNOWN
        else:
            action.status = ActionStatus.SUCCEEDED
    if action.deadline and datetime.now(UTC) > action.deadline:
        open_like = {ActionStatus.QUEUED, ActionStatus.DISPATCHED, ActionStatus.RUNNING, ActionStatus.CREATED}
        if any(item.status in open_like for item in targets):
            action.status = ActionStatus.UNKNOWN
    action.aggregate_version += 1
    await repos.actions.put(action)
