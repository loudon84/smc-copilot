from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ResolvedProfile(BaseModel):
    profile_id: str
    name: str
    display_name: str | None = None
    gateway_port: int | None = None
    base_url: str | None = None
    status: str
    healthy: bool


class ResolvedInstance(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    instance_id: str = Field(alias="instanceId")
    name: str
    profile_name: str = Field(alias="profileName")
    runtime_version: str | None = Field(default=None, alias="runtimeVersion")
    gateway_port: int = Field(alias="gatewayPort")
    status: str
    healthy: bool


class ChatModelCapabilities(BaseModel):
    vision: bool | None = None
    reasoning: bool | None = None
    tools: bool | None = None


class ChatModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    label: str
    provider: str | None = None
    base_url: str | None = Field(default=None, alias="baseUrl")
    available: bool = True
    is_default: bool = Field(default=False, alias="isDefault")
    capabilities: ChatModelCapabilities | None = None
    source: str = "hermes-model-options"
    # Legacy alias kept for Desktop / older clients.
    is_current: bool = Field(default=False, alias="isCurrent")


class ChatDefaultModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider: str
    model_id: str = Field(alias="modelId")
    base_url: str | None = Field(default=None, alias="baseUrl")


class ChatGatewayVirtualInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    virtual_model: str | None = Field(default=None, alias="virtualModel")


class ChatModelListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    profile_id: str | None = Field(default=None, alias="profileId")
    instance_id: str | None = Field(default=None, alias="instanceId")
    models: list[ChatModel]
    default_model: ChatDefaultModel | None = Field(default=None, alias="defaultModel")
    gateway: ChatGatewayVirtualInfo | None = None
    status: str | None = None
    raw: dict[str, Any] | None = None


class ProfileChatModelConfig(BaseModel):
    profile_id: str
    provider: str
    model_id: str
    model_label: str | None = None
    base_url: str | None = None
    updated_at: str
    source: str | None = None


class InstanceChatModelConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    instance_id: str = Field(alias="instanceId")
    provider: str
    model_id: str = Field(alias="modelId")
    model_label: str | None = Field(default=None, alias="modelLabel")
    base_url: str | None = Field(default=None, alias="baseUrl")
    updated_at: str = Field(alias="updatedAt")
    source: str | None = None


class SetProfileChatModelConfigPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider: str = "auto"
    model_id: str = Field(alias="modelId")
    model_label: str | None = Field(default=None, alias="modelLabel")
    base_url: str | None = Field(default=None, alias="baseUrl")


class SetInstanceChatModelConfigPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider: str = "auto"
    model_id: str = Field(alias="modelId")
    model_label: str | None = Field(default=None, alias="modelLabel")
    base_url: str | None = Field(default=None, alias="baseUrl")


class WorkspaceChatMessage(BaseModel):
    role: str
    content: str


class WorkspaceChatSendPayload(BaseModel):
    workspace_id: str
    session_id: str
    stream_id: str | None = None
    model: str | None = None
    messages: list[WorkspaceChatMessage]
    attachments: list[str] = Field(default_factory=list)
    stream: bool = True


class WorkspaceChatStreamScope(BaseModel):
    stream_id: str
    profile_id: str
    workspace_id: str
    session_id: str


class WorkspaceChatChunkEvent(WorkspaceChatStreamScope):
    content: str


class WorkspaceChatToolProgressEvent(WorkspaceChatStreamScope):
    name: str
    label: str | None = None


class WorkspaceChatUsageEvent(WorkspaceChatStreamScope):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class WorkspaceChatDoneEvent(WorkspaceChatStreamScope):
    resolved_session_id: str | None = None


class WorkspaceChatSessionMessage(BaseModel):
    id: int
    role: str
    content: str
    timestamp: int


class WorkspaceChatSessionMessagesResponse(BaseModel):
    messages: list[WorkspaceChatSessionMessage]


class WorkspaceChatErrorEvent(WorkspaceChatStreamScope):
    message: str
    details: dict[str, Any] | None = None


class WorkspaceChatSendResponse(BaseModel):
    stream_id: str


class WorkspaceChatAbortResponse(BaseModel):
    ok: bool = True
