"""Typed Salt invocation builder — only allowlisted functions/args (v2.4.2)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from core.errors import ErrorCode, SaltControlError
from schemas.job_payload import JobPayload
from services.artifact_invocation import ArtifactInvocation

JobOperation = Literal[
    "install",
    "upgrade",
    "configure",
    "start",
    "stop",
    "restart",
    "health",
    "diagnose",
    "rollback",
    "handover",
    "remigrate",
]


@dataclass(frozen=True)
class SaltInvocation:
    function: str
    arg: list[Any]
    kwarg: dict[str, Any]
    timeout_seconds: float
    mutation: bool


OPERATION_FUNCTIONS: dict[str, str] = {
    "install": "smc_hermes.install",
    "upgrade": "smc_hermes.upgrade",
    "configure": "smc_hermes.apply_config",
    "start": "smc_hermes.gateway_start",
    "stop": "smc_hermes.gateway_stop",
    "restart": "smc_hermes.restart",
    "health": "smc_hermes.health",
    "diagnose": "smc_hermes.doctor",
    "rollback": "smc_handover.rollback",
    "handover": "smc_handover.migrate",
    "remigrate": "smc_handover.remigrate",
}


def function_for_operation(operation: str) -> str:
    if operation not in OPERATION_FUNCTIONS:
        raise SaltControlError(ErrorCode.VALIDATION_ERROR, f"unsupported operation: {operation}", status_code=400)
    return OPERATION_FUNCTIONS[operation]


def build_invocation(
    operation: str,
    payload: JobPayload | None = None,
    artifact: ArtifactInvocation | None = None,
) -> SaltInvocation:
    """Map control-plane operation + typed payload to a Salt local_async call."""
    p = payload
    if operation == "install":
        if artifact is None:
            raise SaltControlError(
                ErrorCode.VALIDATION_ERROR, "install requires trusted artifact metadata", status_code=400
            )
        kw: dict[str, Any] = {
            "version": artifact.version,
            "artifact_url": artifact.artifact_url,
            "artifact_sha256": artifact.artifact_sha256,
            "artifact_signature": artifact.artifact_signature,
            "key_id": artifact.key_id,
            "public_key": artifact.public_key,
        }
        if artifact.hermes_home:
            kw["hermes_home"] = artifact.hermes_home
        return SaltInvocation("smc_hermes.install", [], kw, 600.0, True)

    if operation == "upgrade":
        if artifact is None:
            raise SaltControlError(
                ErrorCode.VALIDATION_ERROR, "upgrade requires trusted artifact metadata", status_code=400
            )
        kw = {
            "version": artifact.version,
            "artifact_url": artifact.artifact_url,
            "artifact_sha256": artifact.artifact_sha256,
            "artifact_signature": artifact.artifact_signature,
            "key_id": artifact.key_id,
            "public_key": artifact.public_key,
        }
        if artifact.hermes_home:
            kw["hermes_home"] = artifact.hermes_home
        return SaltInvocation("smc_hermes.upgrade", [], kw, 600.0, True)

    if operation == "configure":
        kw = {}
        if p is not None and getattr(p, "kind", None) == "configure":
            if not p.config:
                raise SaltControlError(ErrorCode.VALIDATION_ERROR, "configure requires config", status_code=400)
            kw["config"] = p.config
            if p.hermes_home:
                kw["hermes_home"] = p.hermes_home
            if p.config_revision:
                kw["note"] = p.config_revision
        else:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "configure requires config payload", status_code=400)
        return SaltInvocation("smc_hermes.apply_config", [], kw, 300.0, True)

    if operation == "start":
        return SaltInvocation("smc_hermes.gateway_start", [], {}, 180.0, True)
    if operation == "stop":
        return SaltInvocation("smc_hermes.gateway_stop", [], {}, 180.0, True)
    if operation == "restart":
        return SaltInvocation("smc_hermes.restart", [], {}, 180.0, True)
    if operation == "health":
        return SaltInvocation("smc_hermes.health", [], {}, 60.0, False)
    if operation == "diagnose":
        return SaltInvocation("smc_hermes.doctor", [], {}, 180.0, False)
    if operation == "rollback":
        kw = {}
        if p is not None and getattr(p, "kind", None) == "rollback":
            if p.previous_owner:
                kw["previous_owner"] = p.previous_owner
        return SaltInvocation("smc_handover.rollback", [], kw, 600.0, True)
    if operation == "handover":
        kw = {}
        if p is not None and getattr(p, "kind", None) == "handover":
            if p.endpoint_id:
                kw["endpoint_id"] = p.endpoint_id
            if p.release_id:
                kw["release_id"] = p.release_id
            if p.config_revision:
                kw["config_revision"] = p.config_revision
        return SaltInvocation("smc_handover.migrate", [], kw, 900.0, True)
    if operation == "remigrate":
        kw = {}
        if p is not None and getattr(p, "kind", None) == "remigrate":
            if p.endpoint_id:
                kw["endpoint_id"] = p.endpoint_id
            if p.idempotency_key:
                kw["idempotency_key"] = p.idempotency_key
        return SaltInvocation("smc_handover.remigrate", [], kw, 900.0, True)

    raise SaltControlError(ErrorCode.VALIDATION_ERROR, f"unsupported operation: {operation}", status_code=400)
