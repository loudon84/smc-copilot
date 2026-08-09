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
    # PRD v1.5 execution extensions
    default_instance: dict[str, Any] | None = Field(default=None, alias="defaultInstance")
    instances: dict[str, Any] | None = None


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


class InstanceHealthRuntimeInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: str | None = None
    executable_verified: bool = Field(default=False, alias="executableVerified")


class InstanceHealthProcessInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    state: str
    pid: int | None = None
    owned: bool = False


class InstanceHealthGatewayInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    port: int
    reachable: bool = False
    authenticated: bool = False
    healthy: bool = False
    latency_ms: float | None = Field(default=None, alias="latencyMs")


class InstanceHealthResponse(BaseModel):
    """PRD v1.5 Instance Health API v2."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    instance_id: str = Field(alias="instanceId")
    runtime: InstanceHealthRuntimeInfo
    process: InstanceHealthProcessInfo
    gateway: InstanceHealthGatewayInfo
    ownership_state: str | None = Field(default=None, alias="ownershipState")
    execution_eligible: bool | None = Field(default=None, alias="executionEligible")
    checked_at: str = Field(alias="checkedAt")


class InstanceStateDesired(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    state: str | None = None


class InstanceStateObserved(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    status: str | None = None
    healthy: bool | None = None
    process_state: str | None = Field(default=None, alias="processState")
    api_state: str | None = Field(default=None, alias="apiState")
    ownership_state: str | None = Field(default=None, alias="ownershipState")
    ownership_source: str | None = Field(default=None, alias="ownershipSource")
    pid: int | None = None
    launcher_pid: int | None = Field(default=None, alias="launcherPid")
    listener_pid: int | None = Field(default=None, alias="listenerPid")
    listener_create_time: float | None = Field(default=None, alias="listenerCreateTime")
    process_create_time: float | None = Field(default=None, alias="processCreateTime")
    last_health_check_at: str | None = Field(default=None, alias="lastHealthCheckAt")
    last_healthy_at: str | None = Field(default=None, alias="lastHealthyAt")


class InstanceStateRecovery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    restart_count: int = Field(default=0, alias="restartCount")
    consecutive_health_failures: int = Field(default=0, alias="consecutiveHealthFailures")
    consecutive_health_successes: int = Field(default=0, alias="consecutiveHealthSuccesses")
    last_error_code: str | None = Field(default=None, alias="lastErrorCode")
    last_error: str | None = Field(default=None, alias="lastError")


class InstanceStateResponse(BaseModel):
    """PRD v1.5 / v1.5.1 Desired / Observed / Recovery state."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    instance_id: str = Field(alias="instanceId")
    desired: InstanceStateDesired
    observed: InstanceStateObserved
    recovery: InstanceStateRecovery
    execution_eligible: bool | None = Field(default=None, alias="executionEligible")


class InstanceDiagnosticsResponse(BaseModel):
    """PRD v1.5.1/v1.5.2 Gateway diagnostics — never includes secrets."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    instance_id: str = Field(alias="instanceId")
    desired: InstanceStateDesired
    observed: InstanceStateObserved
    recovery: InstanceStateRecovery
    execution_eligible: bool | None = Field(default=None, alias="executionEligible")
    runtime_version: str | None = Field(default=None, alias="runtimeVersion")
    executable: str | None = None
    executable_error: str | None = Field(default=None, alias="executableError")
    profile: str | None = None
    port: int | None = None
    port_owner: dict[str, Any] | None = Field(default=None, alias="portOwner")
    gateway_log_path: str | None = Field(default=None, alias="gatewayLogPath")
    fingerprint: dict[str, Any] | None = None
    live_inspection: dict[str, Any] | None = Field(default=None, alias="liveInspection")
    safe_adoption_evidence: dict[str, Any] | None = Field(default=None, alias="safeAdoptionEvidence")
    launcher: dict[str, Any] | None = None
    listener: dict[str, Any] | None = None
    lineage: dict[str, Any] | None = None
    ownership: dict[str, Any] | None = None
    gateway: dict[str, Any] | None = None


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
