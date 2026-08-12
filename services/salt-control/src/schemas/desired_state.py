from __future__ import annotations

from typing import Any

from pydantic import Field

from schemas.common import CamelModel


class DesiredUser(CamelModel):
    user_id: str
    windows_account: str
    windows_sid: str
    profile_dir: str


class DesiredHermes(CamelModel):
    home: str
    version: str
    artifact_ref: str


class DesiredSecretRef(CamelModel):
    name: str
    ref: str


class DesiredRollout(CamelModel):
    ring: str
    desired_owner: str


class DesiredStateResponse(CamelModel):
    schema_: str = Field(default="smc.desired-state.v2", alias="schema")
    endpoint_id: str
    revision: str
    not_modified: bool = False
    user: DesiredUser | None = None
    hermes: DesiredHermes | None = None
    profiles: list[Any] = []
    mcp: dict[str, Any] = {}
    secrets: list[DesiredSecretRef] = []
    rollout: DesiredRollout | None = None
