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
    RECONCILE_CONTROLLER = "reconcile-controller"


CUSTOM_OPERATIONS = {
    Operation.STATUS,
    Operation.COLLECT_LOG,
    Operation.APPLY_CONFIG,
    Operation.RESTART_GATEWAY,
    Operation.DIAGNOSE,
    Operation.REPAIR,
    Operation.RECONCILE_CONTROLLER,
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
    parent_request_id: str | None = Field(default=None, pattern=r"^req_[A-Za-z0-9_-]{8,64}$")
    result_kind: str | None = Field(default=None, max_length=32)

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
    parent_request_id: str | None = None
    result_kind: str | None = None
    content_sha256: str | None = None
    trust_level: str | None = None
    ack_token: str | None = None
    transaction_digest: str | None = None
    desired_digest: str | None = None
    observed_digest: str | None = None
    release_index_digest: str | None = None
    controller_digest: str | None = None
    runtime_manifest_digest: str | None = None


class BindingUpsertRequest(CamelModel):
    user_sid: str = Field(min_length=8, max_length=184, pattern=r"^S-1-[0-9-]+$")
    user_account: str = Field(min_length=1, max_length=128)
    evidence_ref: str = Field(min_length=3, max_length=256)
    reason: str = Field(min_length=3, max_length=256)
    change_ticket: str = Field(min_length=3, max_length=64)
    actor: str | None = None
    role: str | None = None

    @model_validator(mode="after")
    def _reject_forged_actor(self) -> BindingUpsertRequest:
        if self.actor is not None or self.role is not None:
            raise ValueError("actor/role must not be supplied in the body")
        return self


class InventoryEvidenceUpsertRequest(CamelModel):
    os: str = Field(min_length=1, max_length=64)
    last_seen_minutes: int = Field(ge=0, le=10_080)
    owner: str = Field(default="", max_length=32)
    disk_free_mb: int = Field(ge=0, le=10_000_000)
    gateway_healthy: bool = False
    previous_version: str = Field(default="", max_length=64)
    previous_digest: str = Field(default="", max_length=64)
    cli_path: str = Field(default="", max_length=256)
    cli_version: str = Field(default="", max_length=64)
    bootstrap_task: str = Field(default="", max_length=160)
    gateway_task: str = Field(default="", max_length=160)
    actor: str | None = None

    @model_validator(mode="after")
    def _reject_forged_actor(self) -> InventoryEvidenceUpsertRequest:
        if self.actor is not None:
            raise ValueError("actor must not be supplied in the body")
        if self.previous_digest and len(self.previous_digest) != 64:
            raise ValueError("previousDigest must be 64 hex chars")
        return self


class ControllerEvidenceUpsertRequest(CamelModel):
    schema_: Literal["smc.opsi.endpoint-controller-state.v2"] = Field(
        default="smc.opsi.endpoint-controller-state.v2", alias="schema"
    )
    owner: str = Field(default="", max_length=32)
    health: HealthStatus = HealthStatus.UNKNOWN
    controller_revision: str = Field(default="", max_length=64)
    controller_digest: str = Field(default="", max_length=64)
    runtime_version: str = Field(default="", max_length=64)
    runtime_digest: str = Field(default="", max_length=64)
    release_index_digest: str = Field(default="", max_length=64)
    transaction_phase: str = Field(default="", max_length=64)
    gateway_reachable: bool = False
    observed_at: datetime | None = None
    actor: str | None = None

    @model_validator(mode="after")
    def _reject_forged_actor(self) -> ControllerEvidenceUpsertRequest:
        if self.actor is not None:
            raise ValueError("actor must not be supplied in the body")
        return self


class ControllerView(CamelModel):
    client_id: str
    revision: str = ""
    digest: str = ""
    runtime_version: str = ""
    health: HealthStatus = HealthStatus.UNKNOWN
    owner: str = ""
    stale: bool = True
    redacted: bool = True


class ClientView(CamelModel):
    client_id: str
    description: str = ""
    last_seen: datetime | None = None


class ProductView(CamelModel):
    product_id: str
    product_version: str
    package_version: str
    controller_revision: str | None = None
    controller_digest: str | None = None
    runtime_versions: list[str] = Field(default_factory=list)
    release_index_digest: str | None = None
    verified: bool = False
    live_eligible: bool = False


class ProductReleaseUpsertRequest(CamelModel):
    schema_: Literal["smc.opsi.product-release.v1"] = Field(default="smc.opsi.product-release.v1", alias="schema")
    product_id: str = "smc-hermes-agent"
    product_version: str = Field(min_length=1, max_length=32)
    package_version: str = Field(min_length=1, max_length=16)
    controller: dict = Field(default_factory=dict)
    runtimes: list[dict] = Field(default_factory=list)
    verifier: dict = Field(default_factory=dict)
    source_revision: str = Field(default="unknownrev", min_length=7, max_length=64)
    build_id: str = Field(default="build-local", min_length=1, max_length=80)
    created_at: str = ""
    canonical_digest: str = Field(default="", max_length=64)
    signer_key_id: str = Field(default="", max_length=64)
    signature: str = Field(default="", min_length=0)
    live_eligible: bool = False
    verified: bool = False
    depot_readback: dict = Field(default_factory=dict)
    attestation_digest: str = Field(default="", max_length=64)

    @model_validator(mode="after")
    def _reject_smoke_live(self) -> ProductReleaseUpsertRequest:
        if self.live_eligible and self.signer_key_id.startswith("TEST-ONLY"):
            raise ValueError("smoke release cannot be live eligible")
        return self


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
    schema_: Literal["smc.opsi.endpoint-controller-state.v2"] = Field(
        default="smc.opsi.endpoint-controller-state.v2", alias="schema"
    )
    owner: str = ""
    client_id: str
    timestamp: datetime
    hermes: HermesStateView = Field(default_factory=HermesStateView)
    gateway: GatewayStateView = Field(default_factory=GatewayStateView)
    config: ConfigStateView = Field(default_factory=ConfigStateView)
    health: HealthStatus = HealthStatus.UNKNOWN
    controller: dict | None = None
    runtime: dict | None = None
    transaction: dict | None = None
    command_succeeded: bool | None = None
    stale: bool = False


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
