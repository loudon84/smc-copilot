"""Pydantic schemas for Agent Slash Command Catalog / Execute (PRD v1.6 FR-01/FR-02)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatCommandItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str = ""
    category: str = "agent"
    target: str = "agent"
    allow_while_busy: bool = Field(default=True, alias="allowWhileBusy")
    supports_attachments: bool = Field(default=False, alias="supportsAttachments")
    args_hint: str | None = Field(default=None, alias="argsHint")


class ChatCommandsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    commands: list[ChatCommandItem] = Field(default_factory=list)
    rpc_ready: bool = Field(default=False, alias="rpcReady")


class ChatCommandExecuteBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    turn_id: str | None = Field(default=None, alias="turnId")
    session_id: str | None = Field(default=None, alias="sessionId")
    name: str = Field(min_length=1)
    args: str = ""


class ChatCommandExecuteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    result: Literal["handled", "send_prompt", "error"]
    output: str | None = None
    message: str | None = None
    prompt: str | None = None
    turn_id: str | None = Field(default=None, alias="turnId")
    details: dict[str, Any] = Field(default_factory=dict)


class ChatBackgroundTurnBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    parent_turn_id: str | None = Field(default=None, alias="parentTurnId")
    session_id: str | None = Field(default=None, alias="sessionId")
    message: str = Field(min_length=1)


class ChatBackgroundTurnResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    accepted: bool = True
    run_id: str = Field(alias="runId")
    turn_id: str = Field(alias="turnId")
    parent_run_id: str = Field(alias="parentRunId")
    parent_turn_id: str | None = Field(default=None, alias="parentTurnId")
    run_kind: Literal["background"] = Field(default="background", alias="runKind")
