"""Mock Hermes adapter for tests (no real Gateway)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from runtime.tasks.hermes_adapter import InstanceContext, StreamEvent


class MockHermesRuntimeAdapter:
    async def ensure_instance(self, profile_id: str) -> InstanceContext:
        return InstanceContext(
            profile_id=profile_id,
            profile_name=profile_id,
            instance_id=f"inst-{profile_id}",
            gateway_port=18742,
            healthy=True,
        )

    async def health(self, profile_id: str) -> bool:
        return True

    async def start_run(
        self,
        profile_id: str,
        *,
        instructions: str,
        session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, str | None]:
        return f"run-{profile_id}", session_id

    async def stream_run(
        self,
        profile_id: str,
        *,
        instructions: str,
        session_id: str | None = None,
        stream_id: str | None = None,
    ) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(event_name="agent.message.delta", data={"delta": f"mock:{instructions[:32]}"})
        yield StreamEvent(event_name="agent.message.completed", data={"streamId": stream_id})

    async def cancel_run(
        self, profile_id: str, run_id: str | None = None, stream_id: str | None = None
    ) -> None:
        return None

    async def get_session(self, profile_id: str, session_id: str) -> dict[str, Any]:
        return {"id": session_id, "status": "completed"}
