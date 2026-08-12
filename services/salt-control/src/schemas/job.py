from __future__ import annotations

from typing import Literal

from schemas.common import CamelModel

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

JobStatus = Literal[
    "queued",
    "dispatching",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "expired",
]


class JobCreateRequest(CamelModel):
    endpoint_id: str
    minion_id: str
    operation: JobOperation
    idempotency_key: str
    config_revision: str | None = None
    release_id: str | None = None
    requested_by: str
    correlation_id: str | None = None


class JobResponse(CamelModel):
    job_id: str
    salt_jid: str | None = None
    status: JobStatus
    accepted_at: str
    duplicate: bool = False
    endpoint_id: str | None = None
    minion_id: str | None = None
    operation: str | None = None
    error_code: str | None = None
    correlation_id: str | None = None
    conflict_job_id: str | None = None


class EndpointStatusResponse(CamelModel):
    endpoint_id: str
    heartbeat: str | None = None
    last_job: dict | None = None
    rollout: dict | None = None
    deployment: dict | None = None
    current_release: str | None = None
    current_revision: str | None = None
    gateway_health: str | None = None
    migration_phase: str | None = None
    last_error: str | None = None
