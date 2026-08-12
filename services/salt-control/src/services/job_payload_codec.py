from __future__ import annotations

from typing import Any

from db.repositories.interfaces import ControlJobRecord
from schemas.job import JobCreateRequest
from schemas.job_payload import (
    ConfigurePayload,
    GatewayLifecyclePayload,
    HandoverPayload,
    InstallPayload,
    JobPayload,
    ProbePayload,
    RemigratePayload,
    RollbackPayload,
    UpgradePayload,
)


def payload_from_create(body: JobCreateRequest) -> dict[str, Any]:
    if body.payload is not None:
        return body.payload.model_dump(mode="json", by_alias=True)
    return _default_payload_dict(body)


def _default_payload_dict(body: JobCreateRequest) -> dict[str, Any]:
    op = body.operation
    if op == "install":
        return InstallPayload(version=body.release_id).model_dump(mode="json", by_alias=True)
    if op == "configure":
        return ConfigurePayload(config_revision=body.config_revision).model_dump(mode="json", by_alias=True)
    if op in {"start", "stop", "restart"}:
        return GatewayLifecyclePayload(action=op).model_dump(mode="json", by_alias=True)  # type: ignore[arg-type]
    if op in {"health", "diagnose"}:
        return ProbePayload(probe=op).model_dump(mode="json", by_alias=True)  # type: ignore[arg-type]
    if op == "handover":
        return HandoverPayload(
            endpoint_id=body.endpoint_id,
            release_id=body.release_id,
            config_revision=body.config_revision,
        ).model_dump(mode="json", by_alias=True)
    if op == "remigrate":
        return RemigratePayload(
            endpoint_id=body.endpoint_id,
            idempotency_key=body.idempotency_key,
        ).model_dump(mode="json", by_alias=True)
    if op == "rollback":
        return RollbackPayload().model_dump(mode="json", by_alias=True)
    return {"kind": op}


def decode_job_payload(record: ControlJobRecord) -> JobPayload | None:
    data = record.payload_json
    if not data:
        return None
    kind = data.get("kind")
    if kind == "install":
        return InstallPayload.model_validate(data)
    if kind == "upgrade":
        return UpgradePayload.model_validate(data)
    if kind == "configure":
        return ConfigurePayload.model_validate(data)
    if kind == "gateway":
        return GatewayLifecyclePayload.model_validate(data)
    if kind == "probe":
        return ProbePayload.model_validate(data)
    if kind == "handover":
        return HandoverPayload.model_validate(data)
    if kind == "rollback":
        return RollbackPayload.model_validate(data)
    if kind == "remigrate":
        return RemigratePayload.model_validate(data)
    return None
