"""Agent Execution Kernel — single Hermes execution facade (PRD v1.3 §12)."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings, get_settings
from core.logging import get_logger
from runtime.execution.event import AgentExecutionEvent, AgentExecutionEventType
from runtime.execution.policy import tool_requires_approval
from runtime.execution.request import AgentExecutionRequest
from runtime.tasks.registry import get_test_hermes_adapter
from services.hermes_chat_event_mapper import HermesExecutionEvent
from services.hermes_chat_executor import HermesChatExecutionRequest, HermesChatExecutor

logger = get_logger(__name__)

_HERMES_TO_AGENT: dict[str, AgentExecutionEventType] = {
    "session": "session.started",
    "message_delta": "agent.message.delta",
    "message_completed": "agent.message.completed",
    "reasoning_delta": "reasoning.delta",
    "reasoning_completed": "reasoning.completed",
    "tool_started": "tool.started",
    "tool_progress": "tool.progress",
    "tool_completed": "tool.completed",
    "tool_failed": "tool.failed",
    "usage": "usage.updated",
    "clarify_requested": "interaction.clarify",
    "approval_requested": "interaction.approval",
    "completed": "execution.completed",
    "failed": "execution.failed",
    "cancelled": "execution.cancelled",
}

_STREAM_TO_AGENT: dict[str, AgentExecutionEventType] = {
    "agent.message.delta": "agent.message.delta",
    "agent.message.completed": "agent.message.completed",
    "reasoning.delta": "reasoning.delta",
    "reasoning.completed": "reasoning.completed",
    "tool.started": "tool.started",
    "tool.progress": "tool.progress",
    "tool.completed": "tool.completed",
    "tool.failed": "tool.failed",
    "session.started": "session.started",
    "usage.updated": "usage.updated",
    "chat.error": "execution.failed",
    "task.failed": "execution.failed",
    "execution.cancelled": "execution.cancelled",
    "run.usage_json": "usage.updated",
}


def _map_hermes(event: HermesExecutionEvent) -> AgentExecutionEvent:
    mapped = _HERMES_TO_AGENT.get(event.type, "agent.message.delta")
    return AgentExecutionEvent(type=mapped, payload=dict(event.payload))


# @lat: [[task-runtime#Agent Execution Kernel]]
class AgentExecutionKernel:
    """Wraps HermesChatExecutor (and test adapters) into a unified event stream."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        settings: Settings | None = None,
        chat_executor: HermesChatExecutor | None = None,
    ) -> None:
        self._session = session
        self._settings = settings or get_settings()
        self._chat_executor = chat_executor

    def _executor(self) -> HermesChatExecutor:
        return self._chat_executor or HermesChatExecutor(self._session, settings=self._settings)

    async def execute(
        self,
        request: AgentExecutionRequest,
        cancel: asyncio.Event,
    ) -> AsyncIterator[AgentExecutionEvent]:
        test_adapter = get_test_hermes_adapter()
        if test_adapter is not None and hasattr(test_adapter, "stream_run"):
            profile_id = request.profile_id or request.instance_id or "default"
            async for stream_event in test_adapter.stream_run(  # type: ignore[misc]
                profile_id,
                instructions=request.input,
                session_id=request.session_id,
                stream_id=request.execution_id,
            ):
                if cancel.is_set():
                    yield AgentExecutionEvent(type="execution.cancelled", payload={"message": "cancelled"})
                    return
                event_name = getattr(stream_event, "event_name", "agent.message.delta")
                data = getattr(stream_event, "data", {}) or {}
                mapped = _STREAM_TO_AGENT.get(str(event_name))
                if mapped is None:
                    mapped = "agent.message.delta"
                if mapped == "tool.started" and tool_requires_approval(
                    str(data.get("name") or data.get("tool") or ""),
                    request.approval_policy,
                ):
                    yield AgentExecutionEvent(type="interaction.approval", payload=dict(data))
                    continue
                yield AgentExecutionEvent(type=mapped, payload=dict(data) if isinstance(data, dict) else {})
            yield AgentExecutionEvent(type="execution.completed", payload={"executionId": request.execution_id})
            return

        instance_id = request.instance_id
        if not instance_id:
            yield AgentExecutionEvent(
                type="execution.failed",
                payload={"message": "instance_id required for HermesChatExecutor", "errorCode": "NO_INSTANCE"},
            )
            return

        hermes_req = HermesChatExecutionRequest(
            instance_id=instance_id,
            message=request.input if not request.messages else None,
            messages=request.messages,
            session_id=request.session_id,
            workspace_id=request.workspace_id,
            model_id=request.model_id,
            attachment_ids=list(request.attachment_ids or []),
            context=request.context,
            turn_id=request.execution_id,
        )
        async for hermes_event in self._executor().execute(hermes_req, cancel):
            agent_event = _map_hermes(hermes_event)
            if agent_event.type == "tool.started":
                tool_name = str(agent_event.payload.get("name") or agent_event.payload.get("tool") or "")
                if tool_requires_approval(tool_name, request.approval_policy):
                    yield AgentExecutionEvent(
                        type="interaction.approval",
                        payload={**agent_event.payload, "toolName": tool_name},
                    )
                    continue
            yield agent_event
