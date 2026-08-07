"""Pydantic schemas for WorkTask Domain SOT (PRD v1.3)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

WorkTaskTypeLiteral = Literal[
    "chat",
    "expert",
    "expert_team",
    "web",
    "workflow",
    "coding",
    "business",
    "remote_assignment",
]


class WorkTaskCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1)
    description: str | None = None
    task_type: WorkTaskTypeLiteral = Field(default="coding", alias="taskType")
    priority: int = 0
    source: str = "local"
    source_task_id: str | None = Field(default=None, alias="sourceTaskId")
    assignment_id: str | None = Field(default=None, alias="assignmentId")
    profile_id: str | None = Field(default=None, alias="profileId")
    instance_id: str | None = Field(default=None, alias="instanceId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")
    parent_task_id: str | None = Field(default=None, alias="parentTaskId")
    chat_run_id: str | None = Field(default=None, alias="chatRunId")
    instructions: str | None = None
    payload: dict[str, Any] | None = None
    approval_policy: dict[str, Any] | None = Field(default=None, alias="approvalPolicy")
    workspace_policy: dict[str, Any] | None = Field(default=None, alias="workspacePolicy")
    tool_policy: dict[str, Any] | None = Field(default=None, alias="toolPolicy")
    data_policy: dict[str, Any] | None = Field(default=None, alias="dataPolicy")
    deadline: datetime | None = None
    created_by: str | None = Field(default=None, alias="createdBy")


class WorkTaskPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    description: str | None = None
    task_type: WorkTaskTypeLiteral | None = Field(default=None, alias="taskType")
    priority: int | None = None
    profile_id: str | None = Field(default=None, alias="profileId")
    instance_id: str | None = Field(default=None, alias="instanceId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")
    chat_run_id: str | None = Field(default=None, alias="chatRunId")
    instructions: str | None = None
    payload: dict[str, Any] | None = None
    approval_policy: dict[str, Any] | None = Field(default=None, alias="approvalPolicy")
    workspace_policy: dict[str, Any] | None = Field(default=None, alias="workspacePolicy")
    tool_policy: dict[str, Any] | None = Field(default=None, alias="toolPolicy")
    data_policy: dict[str, Any] | None = Field(default=None, alias="dataPolicy")
    deadline: datetime | None = None
    result_summary: str | None = Field(default=None, alias="resultSummary")


class WorkTaskAssignBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    profile_id: str = Field(alias="profileId", min_length=1)
    instance_id: str | None = Field(default=None, alias="instanceId")


class WorkTaskResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    source: str
    source_task_id: str | None = Field(default=None, alias="sourceTaskId")
    assignment_id: str | None = Field(default=None, alias="assignmentId")
    title: str
    description: str | None = None
    task_type: str = Field(alias="taskType")
    priority: int
    status: str
    profile_id: str | None = Field(default=None, alias="profileId")
    instance_id: str | None = Field(default=None, alias="instanceId")
    assigned_profile_id: str | None = Field(default=None, alias="assignedProfileId")
    assigned_instance_id: str | None = Field(default=None, alias="assignedInstanceId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")
    active_run_id: str | None = Field(default=None, alias="activeRunId")
    chat_run_id: str | None = Field(default=None, alias="chatRunId")
    parent_task_id: str | None = Field(default=None, alias="parentTaskId")
    instructions: str | None = None
    payload: dict[str, Any] | None = None
    approval_policy: dict[str, Any] | None = Field(default=None, alias="approvalPolicy")
    workspace_policy: dict[str, Any] | None = Field(default=None, alias="workspacePolicy")
    tool_policy: dict[str, Any] | None = Field(default=None, alias="toolPolicy")
    data_policy: dict[str, Any] | None = Field(default=None, alias="dataPolicy")
    result_summary: str | None = Field(default=None, alias="resultSummary")
    error_code: str | None = Field(default=None, alias="errorCode")
    error_message: str | None = Field(default=None, alias="errorMessage")
    created_by: str | None = Field(default=None, alias="createdBy")
    legacy_source_id: str | None = Field(default=None, alias="legacySourceId")
    deadline: datetime | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")


class WorkTaskListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[WorkTaskResponse]
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class TaskRunResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    task_id: str = Field(alias="taskId")
    run_number: int = Field(alias="runNumber")
    status: str
    chat_run_id: str | None = Field(default=None, alias="chatRunId")
    hermes_session_id: str | None = Field(default=None, alias="hermesSessionId")
    gateway_instance_id: str | None = Field(default=None, alias="gatewayInstanceId")
    lease_id: str | None = Field(default=None, alias="leaseId")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    finished_at: datetime | None = Field(default=None, alias="finishedAt")
    exit_reason: str | None = Field(default=None, alias="exitReason")
    usage: dict[str, Any] | None = None
    error_code: str | None = Field(default=None, alias="errorCode")
    error_detail: str | None = Field(default=None, alias="errorDetail")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class TaskEventResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    task_id: str = Field(alias="taskId")
    run_id: str = Field(alias="runId")
    sequence: int
    event_type: str = Field(alias="eventType")
    schema_version: str = Field(default="1", alias="schemaVersion")
    payload: dict[str, Any] | None = None
    payload_artifact_id: str | None = Field(default=None, alias="payloadArtifactId")
    visibility: str = "internal"
    redaction_status: str = Field(default="redacted", alias="redactionStatus")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class TaskStartResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(alias="taskId")
    run_id: str | None = Field(default=None, alias="runId")
    status: str = "queued"


class TaskApprovalResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    task_id: str = Field(alias="taskId")
    run_id: str | None = Field(default=None, alias="runId")
    tool_call_id: str | None = Field(default=None, alias="toolCallId")
    status: str
    payload: dict[str, Any] | None = None
    resolved_at: datetime | None = Field(default=None, alias="resolvedAt")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class TaskArtifactResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    task_id: str = Field(alias="taskId")
    run_id: str | None = Field(default=None, alias="runId")
    artifact_type: str = Field(alias="artifactType")
    local_path: str | None = Field(default=None, alias="localPath")
    checksum: str | None = None
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    content_type: str | None = Field(default=None, alias="contentType")
    upload_status: str = Field(default="pending", alias="uploadStatus")
    remote_url: str | None = Field(default=None, alias="remoteUrl")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class TaskInteractionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    task_id: str = Field(alias="taskId")
    run_id: str | None = Field(default=None, alias="runId")
    interaction_type: str = Field(alias="interactionType")
    status: str
    prompt: dict[str, Any] | None = None
    payload: dict[str, Any] | None = None
    response: dict[str, Any] | None = None
    resolved_at: datetime | None = Field(default=None, alias="resolvedAt")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class TaskInteractionResolveBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    response: dict[str, Any] | None = None


class TaskArtifactOpenResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    local_path: str = Field(alias="localPath")


class TaskArtifactSaveAsBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    destination_path: str = Field(alias="destinationPath", min_length=1)


class TaskSnapshotResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task: WorkTaskResponse
    active_run: TaskRunResponse | None = Field(default=None, alias="activeRun")
    events: list[TaskEventResponse] = Field(default_factory=list)
    approvals: list[TaskApprovalResponse] = Field(default_factory=list)
    interactions: list[TaskInteractionResponse] = Field(default_factory=list)
    artifacts: list[TaskArtifactResponse] = Field(default_factory=list)
    runtime: dict[str, Any] = Field(default_factory=dict)
