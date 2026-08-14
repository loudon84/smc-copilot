from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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

SETUP_UPDATE = {Operation.SETUP, Operation.UPDATE}


class UserBinding(CamelModel):
    sid: str = Field(min_length=8, max_length=184, pattern=r"^S-1-[0-9-]+$")
    account: str = Field(min_length=1, max_length=128)


class TargetRef(CamelModel):
    client_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    user_binding: UserBinding | None = None


class ActionCreateRequest(CamelModel):
    schema_: Literal["smc.opsi.action-request.v1"] = Field(default="smc.opsi.action-request.v1", alias="schema")
    request_id: str = Field(min_length=12, max_length=80, pattern=r"^req_[A-Za-z0-9_-]{8,64}$")
    operation: Operation
    targets: list[TargetRef] = Field(min_length=1, max_length=200)
    hermes_version: str | None = Field(default=None, max_length=64)
    config_revision: int | None = Field(default=None, ge=0, le=1_000_000)
    auto_repair_level: int | None = Field(default=None, ge=0, le=4)
    note: str | None = Field(default=None, max_length=256)

    @model_validator(mode="after")
    def _require_user_binding_for_setup_update(self) -> ActionCreateRequest:
        if self.operation in SETUP_UPDATE:
            missing = [t.client_id for t in self.targets if t.user_binding is None]
            if missing:
                raise ValueError("setup/update require userBinding {sid, account} on every target")
            if not self.hermes_version or self.hermes_version.lower() == "latest":
                raise ValueError("setup/update require exact hermesVersion")
        return self


class ActionTargetView(CamelModel):
    client_id: str
    status: ActionStatus
    error_code: str | None = None
    message: str | None = None
    attempt: int | None = None
    user_binding: UserBinding | None = None


class ActionView(CamelModel):
    request_id: str
    operation: Operation
    status: ActionStatus
    payload_digest: str
    targets: list[ActionTargetView]
    created_at: datetime
    updated_at: datetime | None = None


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
    attempt: int | None = None
    property_digest: str | None = None
    opsi_modification_time: str | None = None


class ClientView(CamelModel):
    client_id: str
    description: str = ""
    last_seen: datetime | None = None


class ProductView(CamelModel):
    product_id: str
    product_version: str
    package_version: str


class HermesStateView(CamelModel):
    version: str | None = None
    profile: str | None = None


class GatewayStateView(CamelModel):
    port: int | None = None
    reachable: bool | None = None


class ConfigStateView(CamelModel):
    revision: int | None = None
    status: ConfigStatus = ConfigStatus.UNKNOWN


class EndpointStateView(CamelModel):
    schema_: Literal["smc.hermes.state.v1"] = Field(default="smc.hermes.state.v1", alias="schema")
    owner: Literal["opsi"] = "opsi"
    client_id: str
    timestamp: datetime
    hermes: HermesStateView = Field(default_factory=HermesStateView)
    gateway: GatewayStateView = Field(default_factory=GatewayStateView)
    config: ConfigStateView = Field(default_factory=ConfigStateView)
    health: HealthStatus = HealthStatus.UNKNOWN


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
    manifest_digest: str | None = None
