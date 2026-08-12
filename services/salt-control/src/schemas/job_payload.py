from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field

from schemas.common import CamelModel


class InstallPayload(CamelModel):
    kind: Literal["install"] = "install"
    artifact_url: str | None = None
    sha256: str | None = None
    version: str | None = None
    component: str = "hermes"


class UpgradePayload(CamelModel):
    kind: Literal["upgrade"] = "upgrade"
    artifact_url: str | None = None
    sha256: str | None = None
    version: str | None = None


class ConfigurePayload(CamelModel):
    kind: Literal["configure"] = "configure"
    config_revision: str | None = None
    desired: dict[str, Any] = Field(default_factory=dict)


class GatewayLifecyclePayload(CamelModel):
    kind: Literal["gateway"] = "gateway"
    action: Literal["start", "stop", "restart"] = "restart"


class ProbePayload(CamelModel):
    kind: Literal["probe"] = "probe"
    probe: Literal["health", "diagnose"] = "health"


class HandoverPayload(CamelModel):
    kind: Literal["handover"] = "handover"
    endpoint_id: str | None = None
    release_id: str | None = None
    config_revision: str | None = None


class RollbackPayload(CamelModel):
    kind: Literal["rollback"] = "rollback"
    previous_owner: str | None = None


class RemigratePayload(CamelModel):
    kind: Literal["remigrate"] = "remigrate"
    endpoint_id: str | None = None
    idempotency_key: str | None = None


JobPayload = Annotated[
    InstallPayload
    | UpgradePayload
    | ConfigurePayload
    | GatewayLifecyclePayload
    | ProbePayload
    | HandoverPayload
    | RollbackPayload
    | RemigratePayload,
    Field(discriminator="kind"),
]
