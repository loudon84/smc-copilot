"""Worker management service (PRD FR-801)."""

from __future__ import annotations

from typing import Any

from workers.supervisor import WorkerSupervisor


class WorkerService:
    def __init__(self, supervisor: WorkerSupervisor) -> None:
        self._supervisor = supervisor

    def list_workers(self) -> list[dict[str, Any]]:
        return self._supervisor.snapshot()

    def get_worker(self, name: str) -> dict[str, Any] | None:
        state = self._supervisor.get_state(name)
        if state is None:
            return None
        return {
            "name": state.name,
            "status": state.status.value,
            "critical": state.critical,
            "lastStartedAt": state.last_started_at,
            "lastTickAt": state.last_tick_at,
            "lastSuccessAt": state.last_success_at,
            "lastErrorAt": state.last_error_at,
            "lastErrorCode": state.last_error_code,
            "consecutiveFailures": state.consecutive_failures,
            "nextRunAt": state.next_run_at,
            "paused": state.paused,
        }

    async def restart(self, name: str) -> bool:
        return await self._supervisor.restart(name)

    def pause(self, name: str) -> bool:
        return self._supervisor.pause(name)

    def resume(self, name: str) -> bool:
        return self._supervisor.resume(name)
