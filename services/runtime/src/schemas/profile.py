from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from core.constants import GatewayStatus, ProfileType


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    type: ProfileType = ProfileType.DEFAULT
    gateway_port: int | None = None
    enabled: bool = True
    auto_start: bool = False


class ProfileUpdate(BaseModel):
    name: str | None = None
    type: ProfileType | None = None
    gateway_port: int | None = None
    enabled: bool | None = None
    auto_start: bool | None = None


class ProfileResponse(BaseModel):
    id: str
    name: str
    type: str
    display_name: str | None = None
    role: str | None = None
    role_name: str | None = None
    description: str | None = None
    hermes_home: str
    profile_path: str
    gateway_port: int
    enabled: bool
    auto_start: bool
    status: str
    gateway_pid: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProfileStatusResponse(BaseModel):
    profile_id: str
    status: GatewayStatus
    gateway_port: int
    gateway_pid: int | None
    healthy: bool
    message: str | None = None
