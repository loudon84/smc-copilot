"""Typed Salt invocation builder — only allowlisted functions/args (v2.4)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from core.errors import ErrorCode, SaltControlError
from schemas.job_payload import JobPayload

JobOperation = Literal[
    "install",
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


def build_invocation(operation: str, payload: JobPayload | None = None) -> SaltInvocation:
    """Map control-plane operation + typed payload to a Salt local_async call."""
    p = payload
    if operation == "install":
        kw: dict[str, Any] = {}
        if p is not None and getattr(p, "kind", None) == "install":
            if p.artifact_url:
                kw["url"] = p.artifact_url
            if p.sha256:
                kw["sha256"] = p.sha256
            if p.version:
                kw["version"] = p.version
        return SaltInvocation("smc_hermes.install", [], kw, 600.0, True)

    if operation == "configure":
        kw = {}
        if p is not None and getattr(p, "kind", None) == "configure":
            if p.config_revision:
                kw["revision"] = p.config_revision
            if p.desired:
                kw["desired"] = p.desired
        return SaltInvocation("smc_hermes.apply_config", [], kw, 300.0, True)

    if operation == "start":
        return SaltInvocation("smc_hermes.gateway_restart", [], {"action": "start"}, 180.0, True)
    if operation == "stop":
        return SaltInvocation("smc_hermes.gateway_restart", [], {"action": "stop"}, 180.0, True)
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
