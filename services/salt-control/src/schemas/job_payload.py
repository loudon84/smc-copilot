from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import ConfigDict, Field

from schemas.common import CamelModel, to_camel


class _StrictCamel(CamelModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        ser_json_by_alias=True,
        extra="forbid",
    )


class InstallPayload(_StrictCamel):
    kind: Literal["install"] = "install"
    version: str | None = None
    component: str = "hermes"
    hermes_home: str | None = None


class UpgradePayload(_StrictCamel):
    kind: Literal["upgrade"] = "upgrade"
    version: str | None = None
    component: str = "hermes"
    hermes_home: str | None = None


class ConfigurePayload(_StrictCamel):
    kind: Literal["configure"] = "configure"
    config: dict[str, Any] = Field(default_factory=dict)
    hermes_home: str | None = None
    config_revision: str | None = None


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
