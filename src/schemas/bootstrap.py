from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BootstrapDefaultInstanceConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = "default"
    gateway_port: int = Field(default=8642, alias="gatewayPort")
    auto_start: bool = Field(default=True, alias="autoStart")


class BootstrapConfigRequest(BaseModel):
    """Installer bootstrap JSON (FR-19). Must not contain Provider API keys."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    tenant_id: str = Field(alias="tenantId")
    runtime_channel: str = Field(default="stable", alias="runtimeChannel")
    runtime_manifest_url: str | None = Field(default=None, alias="runtimeManifestUrl")
    hermes_manifest_url: str = Field(alias="hermesManifestUrl")
    require_auth: bool = Field(default=True, alias="requireAuth")
    allow_legacy_token: bool = Field(default=False, alias="allowLegacyToken")
    default_instance: BootstrapDefaultInstanceConfig = Field(
        default_factory=BootstrapDefaultInstanceConfig,
        alias="defaultInstance",
    )


class BootstrapAcceptedResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    status: str


class BootstrapJobResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    job_type: str = Field(alias="jobType")
    status: str
    phase: str | None = None
    progress: float = 0.0
    error_code: str | None = Field(default=None, alias="errorCode")
    error_message: str | None = Field(default=None, alias="errorMessage")
    result: dict | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")
