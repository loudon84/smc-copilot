"""Hermes Gateway runtime adapter (FR-501)."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import httpx

from core.config import Settings
from core.errors import GatewayError, HermesClientError
from core.logging import get_logger
from db.repositories.profile_repo import ProfileRepository
from integrations.hermes.client import HermesGatewayClient, extract_run_id
from integrations.hermes.client_factory import HermesGatewayClientFactory
from services.chat_stream_service import abort_stream, register_stream
from services.gateway_credential_service import GatewayCredentialService
from services.gateway_supervisor import GatewaySupervisor
from runtime.tasks.event_normalizer import normalize_hermes_sse, parse_sse_block

logger = get_logger(__name__)


@dataclass
class InstanceContext:
    profile_id: str
    profile_name: str
    instance_id: str | None
    gateway_port: int
    healthy: bool


@dataclass
class StreamEvent:
    event_name: str
    data: dict[str, Any]


# @lat: [[endpoint-sync#Work Task Execution#Hermes Runtime Adapter]]
class HermesRuntimeAdapter:
    def __init__(
        self,
        settings: Settings,
        session,
        supervisor: GatewaySupervisor,
    ) -> None:
        self._settings = settings
        self._session = session
        self._supervisor = supervisor
        self._profiles = ProfileRepository(session)

    async def ensure_instance(self, profile_id: str) -> InstanceContext:
        profile = await self._profiles.get_by_id(profile_id)
        if profile is None:
            profile = await self._profiles.get_by_name(profile_id)
        if profile is None:
            raise GatewayError(f"profile not found: {profile_id}")

        if profile.status != "running":
            await self._supervisor.start_profile(profile.id)

        client = await HermesGatewayClientFactory(self._settings, self._session).create_for_profile_name(
            profile.name,
            profile.gateway_port,
            require_key=False,
        )
        healthy = await client.health_check()
        return InstanceContext(
            profile_id=profile.id,
            profile_name=profile.name,
            instance_id=profile.id,
            gateway_port=profile.gateway_port,
            healthy=healthy,
        )

    async def health(self, profile_id: str) -> bool:
        try:
            ctx = await self.ensure_instance(profile_id)
            return ctx.healthy
        except Exception:
            return False

    async def start_run(
        self,
        profile_id: str,
        *,
        instructions: str,
        session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, str | None]:
        ctx = await self.ensure_instance(profile_id)
        client = await HermesGatewayClientFactory(self._settings, self._session).create_for_profile_name(
            ctx.profile_name,
            ctx.gateway_port,
            require_key=False,
        )
        run_data = await client.create_run(
            input_payload=instructions,
            metadata=metadata or {},
        )
        run_id = extract_run_id(run_data)
        return run_id, session_id

    async def stream_run(
        self,
        profile_id: str,
        *,
        instructions: str,
        session_id: str | None = None,
        stream_id: str | None = None,
    ) -> AsyncIterator[StreamEvent]:
        ctx = await self.ensure_instance(profile_id)
        sid = stream_id or f"task_{uuid.uuid4().hex}"
        cancel = register_stream(sid)

        messages = [{"role": "user", "content": instructions}]
        payload: dict[str, Any] = {"messages": messages, "stream": True}
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        api_key = await GatewayCredentialService(self._settings, self._session).optional_key_for_profile(
            ctx.profile_name
        )
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        if session_id:
            headers["x-hermes-session-id"] = session_id

        url = f"http://127.0.0.1:{ctx.gateway_port}/v1/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code >= 400:
                        text = await response.aread()
                        yield StreamEvent(
                            event_name="chat.error",
                            data={
                                "message": f"HTTP {response.status_code}",
                                "body": text.decode(errors="replace")[:500],
                            },
                        )
                        return

                    buffer = ""
                    async for chunk in response.aiter_text():
                        if cancel.is_set():
                            yield StreamEvent(event_name="chat.error", data={"message": "aborted"})
                            return
                        buffer += chunk
                        while "\n\n" in buffer:
                            block, buffer = buffer.split("\n\n", 1)
                            event_name, data = parse_sse_block(block)
                            for et, payload in normalize_hermes_sse(event_name, data):
                                yield StreamEvent(event_name=et, data=payload)

                    if buffer.strip():
                        event_name, data = parse_sse_block(buffer)
                        for et, payload in normalize_hermes_sse(event_name, data):
                            yield StreamEvent(event_name=et, data=payload)

            yield StreamEvent(event_name="agent.message.completed", data={"streamId": sid})
        finally:
            abort_stream(sid)

    async def cancel_run(self, profile_id: str, run_id: str | None = None, stream_id: str | None = None) -> None:
        if stream_id:
            abort_stream(stream_id)
        if not run_id:
            return
        ctx = await self.ensure_instance(profile_id)
        client = HermesGatewayClient(
            ctx.gateway_port,
            api_key=await GatewayCredentialService(self._settings, self._session).optional_key_for_profile(
                ctx.profile_name
            ),
        )
        try:
            await client.cancel_run(run_id)
        except HermesClientError:
            logger.info("hermes_cancel_run_failed", run_id=run_id)

    async def get_session(self, profile_id: str, session_id: str) -> dict[str, Any]:
        ctx = await self.ensure_instance(profile_id)
        client = HermesGatewayClient(
            ctx.gateway_port,
            api_key=await GatewayCredentialService(self._settings, self._session).optional_key_for_profile(
                ctx.profile_name
            ),
        )
        run_data = await client.get_run(session_id)
        return run_data if isinstance(run_data, dict) else {"id": session_id}
