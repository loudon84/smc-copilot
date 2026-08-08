from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from core.capabilities import RUNTIME_API_VERSION, RuntimeFeatureId


class RuntimeStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    service_version: str = Field(alias="serviceVersion")
    api_version: str = Field(alias="apiVersion")
    status: str
    checks: dict[str, str] = Field(default_factory=dict)
    hermes_installed: bool = Field(alias="hermesInstalled")
    active_hermes_version: str | None = Field(default=None, alias="activeHermesVersion")
    platform: str
    architecture: str
    features: list[RuntimeFeatureId]
    data_dir: str = Field(alias="dataDir")
    hermes_home: str = Field(alias="hermesHome")


class RuntimeDomainReadiness(BaseModel):
    """One readiness domain (service / execution / maintenance / expertMcp)."""

    model_config = ConfigDict(populate_by_name=True)

    ready: bool
    checks: dict[str, str] = Field(default_factory=dict)
    status: str | None = None
    chat_ready: bool | None = Field(default=None, alias="chatReady")
    task_ready: bool | None = Field(default=None, alias="taskReady")


class RuntimeReadinessResponse(BaseModel):
    """PRD v1.4 three-layer readiness — Desktop gates Chat/Task/MCP separately."""

    model_config = ConfigDict(populate_by_name=True)

    service: RuntimeDomainReadiness
    execution: RuntimeDomainReadiness
    maintenance: RuntimeDomainReadiness
    expert_mcp: RuntimeDomainReadiness = Field(alias="expertMcp")


class RuntimeCapabilitiesResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api_version: str = Field(default=RUNTIME_API_VERSION, alias="apiVersion")
    features: list[RuntimeFeatureId]


class RuntimeCompatibilityResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api_version: str = Field(alias="apiVersion")
    min_desktop_api: str = Field(default="1.0", alias="minDesktopApi")
    notes: list[str] = Field(default_factory=list)


class ToolchainOverride(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    python_path: str | None = Field(default=None, alias="pythonPath")
    node_path: str | None = Field(default=None, alias="nodePath")
    git_path: str | None = Field(default=None, alias="gitPath")
    venv_dir: str | None = Field(default=None, alias="venvDir")
    hermes_install_dir: str | None = Field(default=None, alias="hermesInstallDir")


class RuntimeInstallRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str = "latest"
    channel: str = "stable"
    force: bool = False
    create_default_instance: bool = Field(default=True, alias="createDefaultInstance")
    toolchain: ToolchainOverride | None = None


class RuntimeUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str = "latest"
    channel: str = "stable"
    instance_ids: list[str] | None = Field(default=None, alias="instanceIds")
    strategy: str = "rolling"
    toolchain: ToolchainOverride | None = None


class RuntimeUpdatePlanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str = "latest"
    channel: str = "stable"
    instance_ids: list[str] | None = Field(default=None, alias="instanceIds")
    strategy: str = "rolling"


class RuntimeCompatibilityFlags(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api: bool = True
    config: bool = True
    python: bool = True


class RuntimeUpdatePlanResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plan_id: str | None = Field(default=None, alias="planId")
    from_version: str | None = Field(default=None, alias="fromVersion")
    to_version: str = Field(alias="toVersion")
    affected_instances: list[dict[str, Any]] = Field(default_factory=list, alias="affectedInstances")
    compatibility: RuntimeCompatibilityFlags
    warnings: list[str] = Field(default_factory=list)


class RuntimeRollbackRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str | None = None
    mode: str = "all"
    instance_ids: list[str] | None = Field(default=None, alias="instanceIds")


class RuntimeJobCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_type: str = Field(alias="jobType")
    request: dict[str, Any] = Field(default_factory=dict)


class RuntimeJobResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    job_type: str = Field(alias="jobType")
    status: str
    phase: str | None = None
    progress: float = 0.0
    error_code: str | None = Field(default=None, alias="errorCode")
    error_message: str | None = Field(default=None, alias="errorMessage")
    result: dict[str, Any] | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")


class RuntimeJobAcceptedResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    status: str


class RuntimeVersionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    version: str
    channel: str
    install_path: str = Field(alias="installPath")
    executable_path: str = Field(alias="executablePath")
    python_path: str | None = Field(default=None, alias="pythonPath")
    checksum: str | None = None
    status: str
    metadata: dict | None = None
    installed_at: datetime | None = Field(default=None, alias="installedAt")
    activated_at: datetime | None = Field(default=None, alias="activatedAt")


class InstanceCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    profile_name: str | None = Field(default=None, alias="profileName")
    runtime_version: str | None = Field(default=None, alias="runtimeVersion")
    gateway_port: int | None = Field(default=None, alias="gatewayPort")
    auto_start: bool = Field(default=False, alias="autoStart")


class InstanceUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    auto_start: bool | None = Field(default=None, alias="autoStart")
    runtime_version: str | None = Field(default=None, alias="runtimeVersion")
    gateway_port: int | None = Field(default=None, alias="gatewayPort")


class InstanceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    profile_name: str = Field(alias="profileName")
    runtime_version: str | None = Field(default=None, alias="runtimeVersion")
    gateway_port: int = Field(alias="gatewayPort")
    status: str
    healthy: bool
    auto_start: bool = Field(alias="autoStart")
    pid: int | None = None
    last_error: str | None = Field(default=None, alias="lastError")
    executable_verified: bool | None = Field(default=None, alias="executableVerified")
    api_server_enabled: bool | None = Field(default=None, alias="apiServerEnabled")


class PairingStartResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    pairing_id: str = Field(alias="pairingId")
    challenge: str
    expires_at: datetime = Field(alias="expiresAt")


class PairingConfirmRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    challenge: str
    device_name: str = Field(default="desktop", alias="deviceName")


class PairingConfirmResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    device_id: str = Field(alias="deviceId")
    device_token: str = Field(alias="deviceToken")
    name: str


class DeviceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    status: str
    last_seen_at: datetime | None = Field(default=None, alias="lastSeenAt")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class SecretMetaResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    configured: bool
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class SecretPutRequest(BaseModel):
    value: str


class McpServerCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    transport: str = "stdio"
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    url: str | None = None
    enabled: bool = True


class McpServerResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    transport: str
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    url: str | None = None
    enabled: bool
    secret_configured: bool = Field(default=False, alias="secretConfigured")
    status: str = "unknown"
    last_test_at: datetime | None = Field(default=None, alias="lastTestAt")
    last_error: str | None = Field(default=None, alias="lastError")


class ConfigurationPatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    group: str | None = None
    values: dict[str, Any] = Field(default_factory=dict)
    apply: bool = False


class BackupCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    include_sessions: bool = Field(default=True, alias="includeSessions")
    include_skills: bool = Field(default=True, alias="includeSkills")
    include_memories: bool = Field(default=True, alias="includeMemories")
