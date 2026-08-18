from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import Field, model_validator

from schemas.models import ActionStatus, ActionTargetView, ActionView, CamelModel


class V2Operation(StrEnum):
    STATUS = "status"
    VERSION = "version"
    GATEWAY_STATUS = "gateway-status"
    GATEWAY_START = "gateway-start"
    GATEWAY_STOP = "gateway-stop"
    GATEWAY_RESTART = "gateway-restart"
    CONFIG_CHECK = "config-check"
    CONFIG_APPLY = "config-apply"
    DOCTOR = "doctor"
    COLLECT_LOGS = "collect-logs"
    COLLECT_SESSIONS = "collect-sessions"
    UPDATE = "update"
    REPAIR = "repair"


V2_COMMAND_OPERATIONS = frozenset(V2Operation)


class V2TargetRef(CamelModel):
    client_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")


class V2ActionCreateRequest(CamelModel):
    schema_: Literal["smc.opsi.action-request.v2"] = Field(default="smc.opsi.action-request.v2", alias="schema")
    request_id: str = Field(min_length=12, max_length=80, pattern=r"^req_[A-Za-z0-9_-]{8,64}$")
    operation: V2Operation
    targets: list[V2TargetRef] = Field(min_length=1, max_length=500)
    group_id: str | None = Field(default=None, max_length=128)
    concurrency: int = Field(default=1, ge=1, le=50)
    deadline_hours: int = Field(default=24, ge=1, le=168)
    release_version: str | None = Field(default=None, max_length=64)
    config_revision: int | None = Field(default=None, ge=1, le=1_000_000)
    repair_level: int | None = Field(default=None, ge=1, le=5)
    since_hours: int | None = Field(default=None, ge=1, le=168)
    max_bytes: int | None = Field(default=None, ge=1, le=52_428_800)
    max_count: int | None = Field(default=None, ge=1, le=500)
    session_id: str | None = Field(default=None, max_length=128)
    operator: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=3, max_length=256)

    @model_validator(mode="after")
    def _validate_payload(self) -> V2ActionCreateRequest:
        if self.operation == V2Operation.UPDATE:
            if not self.release_version or self.release_version.lower() in {"latest", "main", "master"}:
                raise ValueError("update requires exact releaseVersion")
        if self.operation == V2Operation.CONFIG_APPLY and self.config_revision is None:
            raise ValueError("config-apply requires configRevision")
        if self.operation == V2Operation.REPAIR and self.repair_level is None:
            raise ValueError("repair requires repairLevel")
        if self.operation == V2Operation.COLLECT_LOGS:
            if self.max_bytes is None:
                raise ValueError("collect-logs requires maxBytes")
        if self.operation == V2Operation.COLLECT_SESSIONS and not self.session_id:
            raise ValueError("collect-sessions requires sessionId")
        return self


class V2ActionView(ActionView):
    schema_: Literal["smc.opsi.action-view.v2"] = Field(default="smc.opsi.action-view.v2", alias="schema")


class V2ClientStatusView(CamelModel):
    client_id: str
    reachable: bool
    hermes: dict = Field(default_factory=dict)
    gateway: dict = Field(default_factory=dict)
    config: dict = Field(default_factory=dict)
    updated_at: str = ""


class V2ConfigCreateRequest(CamelModel):
    schema_: Literal["smc.opsi.config-artifact.v2"] = Field(default="smc.opsi.config-artifact.v2", alias="schema")
    revision: int = Field(ge=1, le=1_000_000)
    content_yaml: str = Field(min_length=1, max_length=262_144)
    operator: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=3, max_length=256)


class V2ConfigView(CamelModel):
    revision: int
    sha256: str
    artifact_id: str
    created_at: str
    created_by: str = ""


class V2ReleaseUpsertRequest(CamelModel):
    schema_: Literal["smc.opsi.hermes-release.v2"] = Field(default="smc.opsi.hermes-release.v2", alias="schema")
    release_version: str = Field(min_length=1, max_length=64)
    hermes_version: str = Field(min_length=1, max_length=32)
    smc_revision: str = Field(min_length=1, max_length=16)
    sha256: str = Field(min_length=64, max_length=64)
    manifest_sha256: str = Field(min_length=64, max_length=64)
    signer_key_id: str = Field(min_length=1, max_length=64)
    live_eligible: bool = False
    operator: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=3, max_length=256)

    @model_validator(mode="after")
    def _reject_latest(self) -> V2ReleaseUpsertRequest:
        forbidden = {"latest", "main", "master"}
        if self.release_version.lower() in forbidden or self.hermes_version.lower() in forbidden:
            raise ValueError("forbidden release version alias")
        if self.live_eligible and self.signer_key_id.startswith("TEST-ONLY"):
            raise ValueError("smoke release cannot be live eligible")
        return self


class V2ReleaseView(CamelModel):
    release_version: str
    hermes_version: str
    smc_revision: str
    sha256: str
    manifest_sha256: str
    signer_key_id: str
    artifact_id: str
    live_eligible: bool = False


class V2ArtifactView(CamelModel):
    artifact_id: str
    artifact_type: str
    request_id: str = ""
    client_id: str = ""
    sha256: str = ""
    size_bytes: int = 0
    status: str = "pending"


class V2ArtifactTokenRequest(CamelModel):
    artifact_id: str = Field(min_length=8, max_length=80)
    client_id: str = Field(min_length=1, max_length=128)
    request_id: str = Field(min_length=12, max_length=80)
    direction: Literal["upload", "download"]


class V2ArtifactTokenView(CamelModel):
    artifact_id: str
    token: str
    expires_at: str
    upload_url: str | None = None
    download_url: str | None = None


class V2BatchAggregateStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    PARTIAL_FAILURE = "PARTIAL_FAILURE"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class V2BatchActionView(CamelModel):
    request_id: str
    operation: V2Operation
    status: V2BatchAggregateStatus
    group_id: str | None = None
    targets_digest: str = ""
    concurrency: int = 1
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    pending: int = 0
    cancelled: int = 0


class V2CancelRequest(CamelModel):
    reason: str = Field(min_length=3, max_length=256)


def v2_action_target_view(target: ActionTargetView) -> ActionTargetView:
    return target


__all__ = [
    "ActionStatus",
    "V2ActionCreateRequest",
    "V2ActionView",
    "V2ArtifactTokenRequest",
    "V2ArtifactTokenView",
    "V2ArtifactView",
    "V2BatchActionView",
    "V2BatchAggregateStatus",
    "V2CancelRequest",
    "V2ClientStatusView",
    "V2ConfigCreateRequest",
    "V2ConfigView",
    "V2Operation",
    "V2ReleaseUpsertRequest",
    "V2ReleaseView",
    "V2TargetRef",
    "V2_COMMAND_OPERATIONS",
]
