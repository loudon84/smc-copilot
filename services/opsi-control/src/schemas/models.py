from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class ActionStatus(StrEnum):
    CREATED = "CREATED"
    QUEUED = "QUEUED"
    DISPATCHED = "DISPATCHED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    UNKNOWN = "UNKNOWN"


class HealthStatus(StrEnum):
    HEALTHY = "HEALTHY"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    OFFLINE = "OFFLINE"
    UNKNOWN = "UNKNOWN"


class ConfigStatus(StrEnum):
    CURRENT = "CURRENT"
    OUTDATED = "OUTDATED"
    APPLYING = "APPLYING"
    FAILED = "FAILED"
    UNKNOWN = "UNKNOWN"


class Operation(StrEnum):
    SETUP = "setup"
    UPDATE = "update"
    UNINSTALL = "uninstall"
    STATUS = "status"
    COLLECT_LOG = "collect-log"
    APPLY_CONFIG = "apply-config"
    RESTART_GATEWAY = "restart-gateway"
    DIAGNOSE = "diagnose"
    REPAIR = "repair"


CUSTOM_OPERATIONS = {
    Operation.STATUS,
    Operation.COLLECT_LOG,
    Operation.APPLY_CONFIG,
    Operation.RESTART_GATEWAY,
    Operation.DIAGNOSE,
    Operation.REPAIR,
}


class TargetRef(CamelModel):
    client_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")


class ActionCreateRequest(CamelModel):
    schema_: Literal["smc.opsi.action-request.v1"] = Field(default="smc.opsi.action-request.v1", alias="schema")
    request_id: str = Field(min_length=12, max_length=80, pattern=r"^req_[A-Za-z0-9_-]{8,64}$")
    operation: Operation
    targets: list[TargetRef] = Field(min_length=1, max_length=200)
    hermes_version: str | None = Field(default=None, max_length=64)
    config_revision: int | None = Field(default=None, ge=0, le=1_000_000)
    auto_repair_level: int | None = Field(default=None, ge=0, le=4)
    note: str | None = Field(default=None, max_length=256)


class ActionTargetView(CamelModel):
    client_id: str
    status: ActionStatus
    error_code: str | None = None
    message: str | None = None


class ActionView(CamelModel):
    request_id: str
    operation: Operation
    status: ActionStatus
    payload_digest: str
    targets: list[ActionTargetView]
    created_at: datetime


class ActionResultView(CamelModel):
    schema_: Literal["smc.opsi.action-result.v1"] = Field(default="smc.opsi.action-result.v1", alias="schema")
    request_id: str
    client_id: str
    status: ActionStatus
    timestamp: datetime
    sha256: str | None = None
    bytes: int | None = None
    redacted: bool = True
    error_code: str | None = None
    message: str | None = None
    user_context: str | None = None


class ClientView(CamelModel):
    client_id: str
    description: str = ""
    last_seen: datetime | None = None


class ProductView(CamelModel):
    product_id: str
    product_version: str
    package_version: str


class EndpointStateView(CamelModel):
    schema_: Literal["smc.hermes.state.v1"] = Field(default="smc.hermes.state.v1", alias="schema")
    owner: Literal["opsi"] = "opsi"
    client_id: str
    timestamp: datetime
    hermes_version: str | None = None
    health: HealthStatus = HealthStatus.UNKNOWN
    config_status: ConfigStatus = ConfigStatus.UNKNOWN
    config_revision: int | None = None
    gateway_port: int | None = None
    gateway_reachable: bool | None = None


class PolicyApplyRequest(CamelModel):
    schema_: Literal["smc.opsi.managed-config.v1"] = Field(default="smc.opsi.managed-config.v1", alias="schema")
    revision: int = Field(ge=1, le=1_000_000)
    client_ids: list[str] = Field(min_length=1, max_length=200)
    keys: dict[str, int | str | bool]


class DiagnosticFileView(CamelModel):
    name: str
    sha256: str
    bytes: int


class DiagnosticView(CamelModel):
    schema_: Literal["smc.hermes.diagnostic.v1"] = Field(default="smc.hermes.diagnostic.v1", alias="schema")
    request_id: str
    client_id: str
    issue_code: str
    severity: str
    recommended_action: str
    redacted: bool = True
    files: list[DiagnosticFileView] = Field(default_factory=list)
