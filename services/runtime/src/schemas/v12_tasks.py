from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LocalTaskCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    task_type: str = "coding_task"
    payload: dict | None = None
    workspace_id: str | None = None


class LocalTaskResponse(BaseModel):
    id: str
    title: str
    description: str | None = None
    task_type: str
    source: str
    remote_task_id: str | None = None
    assignment_id: str | None = None
    local_attempt_id: str
    target_profile_id: str | None = None
    workspace_id: str | None = None
    status: str
    priority: int
    payload_json: str | None = None
    result_json: str | None = None
    error_message: str | None = None
    hermes_run_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskEventResponse(BaseModel):
    id: str
    task_id: str
    run_id: str | None = None
    event_type: str
    message: str | None = None
    event_payload: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceCreate(BaseModel):
    name: str
    root_path: str
    type: str = "project"
    enabled: bool = True
    policy_json: str | None = None


class WorkspacePatch(BaseModel):
    name: str | None = None
    root_path: str | None = None
    type: str | None = None
    enabled: bool | None = None
    policy_json: str | None = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    root_path: str
    type: str
    enabled: bool
    policy_json: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApprovalResponse(BaseModel):
    id: str
    task_id: str
    action_type: str
    risk_level: str
    status: str
    requested_by: str | None = None
    approved_by: str | None = None
    reject_reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApprovalRejectBody(BaseModel):
    actor: str | None = None
    reason: str | None = None


class WorkspaceValidatePath(BaseModel):
    path: str


class WorkspaceValidateCommand(BaseModel):
    command: str


class BindProfileBody(BaseModel):
    profile_id: str = Field(min_length=1)


class ApprovalApproveBody(BaseModel):
    approved_by: str | None = None


class RoutingRuleOut(BaseModel):
    profile_type: str
    require_approval: bool = False


class TeamTaskBindingResponse(BaseModel):
    id: str
    remote_task_id: str
    assignment_id: str
    local_task_id: str
    sync_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskRoutingPatch(BaseModel):
    rules: dict[str, RoutingRuleOut]


class TaskRoutingRulesResponse(BaseModel):
    rules: dict[str, RoutingRuleOut]


class TaskWorkbenchSummary(BaseModel):
    profiles: dict[str, int]
    tasks: dict[str, int]
    approvals: dict[str, int]
    team_sync: dict[str, str | bool | int]


__all__ = [
    "ApprovalApproveBody",
    "ApprovalRejectBody",
    "ApprovalResponse",
    "BindProfileBody",
    "LocalTaskCreate",
    "LocalTaskResponse",
    "RoutingRuleOut",
    "TaskEventResponse",
    "TeamTaskBindingResponse",
    "TaskRoutingPatch",
    "TaskRoutingRulesResponse",
    "TaskWorkbenchSummary",
    "WorkspaceCreate",
    "WorkspacePatch",
    "WorkspaceResponse",
    "WorkspaceValidateCommand",
    "WorkspaceValidatePath",
]
