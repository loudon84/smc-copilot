"""Scenario-driven Mock Hermes adapter for v1.3 E2E tests."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from runtime.tasks.hermes_adapter import InstanceContext, StreamEvent


class ScenarioHermesRuntimeAdapter:
    """Fake Hermes adapter that emits scripted stream events per scenario name."""

    def __init__(self, scenario: str = "happy") -> None:
        self.scenario = scenario
        self.cancelled_runs: list[str] = []

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
        return f"run-{profile_id}-{self.scenario}", session_id

    async def stream_run(
        self,
        profile_id: str,
        *,
        instructions: str,
        session_id: str | None = None,
        stream_id: str | None = None,
    ) -> AsyncIterator[StreamEvent]:
        scenario = self.scenario
        if scenario == "happy":
            yield StreamEvent(event_name="agent.message.delta", data={"delta": f"mock:{instructions[:24]}"})
            yield StreamEvent(event_name="agent.message.completed", data={"streamId": stream_id})
        elif scenario == "message_delta":
            yield StreamEvent(event_name="agent.message.delta", data={"delta": "part-1"})
            yield StreamEvent(event_name="agent.message.delta", data={"delta": " part-2"})
            yield StreamEvent(event_name="agent.message.completed", data={"streamId": stream_id})
        elif scenario == "tool":
            yield StreamEvent(event_name="tool.started", data={"name": "read_file", "toolCallId": "tc-1"})
            yield StreamEvent(event_name="tool.completed", data={"name": "read_file", "toolCallId": "tc-1"})
            yield StreamEvent(event_name="agent.message.completed", data={"streamId": stream_id})
        elif scenario == "usage":
            yield StreamEvent(event_name="agent.message.delta", data={"delta": "ok"})
            yield StreamEvent(event_name="usage.updated", data={"usage": {"promptTokens": 3, "completionTokens": 5}})
            yield StreamEvent(event_name="agent.message.completed", data={"streamId": stream_id})
        elif scenario == "approval":
            yield StreamEvent(
                event_name="tool.started",
                data={"name": "shell_exec", "tool": "shell_exec", "toolCallId": "tc-approval"},
            )
        elif scenario == "fail":
            yield StreamEvent(event_name="chat.error", data={"message": "hermes_failed"})
        elif scenario == "cancel":
            yield StreamEvent(event_name="agent.message.delta", data={"delta": "partial"})
            yield StreamEvent(event_name="execution.cancelled", data={"message": "cancelled"})
        else:
            yield StreamEvent(event_name="agent.message.delta", data={"delta": f"unknown:{scenario}"})
            yield StreamEvent(event_name="agent.message.completed", data={"streamId": stream_id})

    async def cancel_run(self, profile_id: str, run_id: str | None = None, stream_id: str | None = None) -> None:
        if run_id:
            self.cancelled_runs.append(run_id)
        return None

    async def get_session(self, profile_id: str, session_id: str) -> dict[str, Any]:
        return {"id": session_id, "status": "completed"}
