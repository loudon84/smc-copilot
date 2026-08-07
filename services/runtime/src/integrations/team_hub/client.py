"""Team Task Hub client.

DEPRECATED: Prefer ``integrations.service_center`` (Work Copilot Service Center) for
endpoint enrollment, desired-state sync, remote task v2, and experience delivery.
This module remains as a compatibility adapter for legacy Team Hub poll/claim/push
flows during the v1.5 migration window.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

import httpx

from core.errors import TeamHubError
from core.logging import get_logger
from integrations.team_hub.dto import RemoteAssignmentDTO

logger = get_logger(__name__)


@runtime_checkable
class TeamHubClient(Protocol):
    async def poll_assignments(self) -> list[RemoteAssignmentDTO]: ...
    async def claim_assignment(self, remote_task_id: str, assignment_id: str) -> bool: ...
    async def push_task_update(self, payload: dict[str, Any]) -> None: ...


class StubTeamHubClient:
    """Returns staged assignments; records push calls for tests.

    Deprecated compatibility stub — new code should use StubServiceCenterClient.
    """

    def __init__(self) -> None:
        self._queued: list[RemoteAssignmentDTO] = []
        self.pushed: list[dict[str, Any]] = []
        self.claimed: list[tuple[str, str]] = []

    def stage(self, *assignments: RemoteAssignmentDTO) -> None:
        self._queued.extend(assignments)

    def clear_queue(self) -> None:
        self._queued.clear()

    async def poll_assignments(self) -> list[RemoteAssignmentDTO]:
        out = list(self._queued)
        self._queued.clear()
        return out

    async def claim_assignment(self, remote_task_id: str, assignment_id: str) -> bool:
        self.claimed.append((remote_task_id, assignment_id))
        return True

    async def push_task_update(self, payload: dict[str, Any]) -> None:
        self.pushed.append(payload)
        logger.info("stub_team_hub_push", payload_keys=list(payload.keys()))


class HttpTeamHubClient:
    """Deprecated compatibility adapter.

    Prefer ``integrations.service_center`` / Remote Task Assignment v2.
    Paths remain placeholder until legacy Hub is retired.
    """

    def __init__(self, base_url: str, token: str, device_id: str, agent_id: str) -> None:
        self._base = base_url.rstrip("/")
        self._token = token
        self._device_id = device_id
        self._agent_id = agent_id

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {}
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    async def poll_assignments(self) -> list[RemoteAssignmentDTO]:
        url = f"{self._base}/api/v1/team-hub/assignments"
        params = {"device_id": self._device_id, "agent_id": self._agent_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._headers(), params=params)
            if resp.status_code >= 400:
                raise TeamHubError(f"poll failed: {resp.status_code} {resp.text}")
            data = resp.json()
        items = data.get("assignments") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return []
        out: list[RemoteAssignmentDTO] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            out.append(
                RemoteAssignmentDTO(
                    remote_task_id=str(it.get("remote_task_id") or it.get("task_id")),
                    assignment_id=str(it.get("assignment_id")),
                    title=str(it.get("title", "")),
                    description=it.get("description") if isinstance(it.get("description"), str) else None,
                    task_type=str(it.get("task_type", "coding_task")),
                    payload=it.get("payload") if isinstance(it.get("payload"), dict) else {},
                    source_agent_id=it.get("source_agent_id"),
                    target_agent_id=it.get("target_agent_id"),
                    workspace_id=it.get("workspace_id"),
                )
            )
        return out

    async def claim_assignment(self, remote_task_id: str, assignment_id: str) -> bool:
        url = f"{self._base}/api/v1/team-hub/assignments/claim"
        body = {
            "remote_task_id": remote_task_id,
            "assignment_id": assignment_id,
            "device_id": self._device_id,
            "agent_id": self._agent_id,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=self._headers(), json=body)
            if resp.status_code >= 400:
                raise TeamHubError(f"claim failed: {resp.status_code} {resp.text}")
        return True

    async def push_task_update(self, payload: dict[str, Any]) -> None:
        url = f"{self._base}/api/v1/team-hub/task-updates"
        body = {**payload, "device_id": self._device_id, "agent_id": self._agent_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=self._headers(), json=body)
            if resp.status_code >= 400:
                raise TeamHubError(f"push failed: {resp.status_code} {resp.text}")
