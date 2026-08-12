from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class BackendUserBinding:
    endpoint_id: str
    user_id: str
    windows_account: str
    windows_sid: str
    profile_dir: str
    revision: str


@dataclass
class BackendDesiredState:
    endpoint_id: str
    revision: str
    user_id: str
    hermes_home: str
    hermes_version: str
    artifact_ref: str
    ring: str
    desired_owner: str
    secrets: list[dict[str, str]] = field(default_factory=list)
    profiles: list[Any] = field(default_factory=list)
    mcp: dict[str, Any] = field(default_factory=dict)


class ManagementBackend(Protocol):
    async def get_binding(self, endpoint_id: str) -> BackendUserBinding | None: ...
    async def get_desired_state(self, endpoint_id: str) -> BackendDesiredState | None: ...
    @property
    def available(self) -> bool: ...


class FakeManagementBackend:
    def __init__(self) -> None:
        self.bindings: dict[str, BackendUserBinding] = {}
        self.desired: dict[str, BackendDesiredState] = {}
        self._available = True

    @property
    def available(self) -> bool:
        return self._available

    def set_available(self, value: bool) -> None:
        self._available = value

    def put_binding(self, binding: BackendUserBinding) -> None:
        self.bindings[binding.endpoint_id] = binding

    def put_desired(self, state: BackendDesiredState) -> None:
        self.desired[state.endpoint_id] = state

    async def get_binding(self, endpoint_id: str) -> BackendUserBinding | None:
        if not self._available:
            raise RuntimeError("management backend unavailable")
        return self.bindings.get(endpoint_id)

    async def get_desired_state(self, endpoint_id: str) -> BackendDesiredState | None:
        if not self._available:
            raise RuntimeError("management backend unavailable")
        return self.desired.get(endpoint_id)
