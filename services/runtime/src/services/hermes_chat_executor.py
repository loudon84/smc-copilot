"""Hermes chat executor — single owner of Hermes Gateway chat stream calls (PRD v1.2 §5)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings, get_settings
from core.errors import ChatApiError, gateway_health_failed, gateway_not_running
from core.runtime_enums import InstanceStatus
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from integrations.hermes.client_factory import HermesGatewayClientFactory
from services.attachment_service import AttachmentService
from services.gateway_credential_service import GatewayCredentialService
from services.hermes_chat_event_mapper import HermesExecutionEvent, parse_hermes_sse_block
from services.hermes_model_catalog_service import (
    GATEWAY_VIRTUAL_MODEL_IDS,
    HermesModelCatalogService,
    is_gateway_virtual_model_id,
)
from services.instance_ref_resolver import InstanceRefResolver

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class HermesChatExecutionRequest:
    instance_id: str
    message: str | None = None
    messages: list[dict[str, str]] | None = None
    session_id: str | None = None
    workspace_id: str | None = None
    model_id: str | None = None
    attachment_ids: list[str] = field(default_factory=list)
    context: dict[str, Any] | None = None
    turn_id: str | None = None


class HermesChatExecutor:
    """Execute a chat turn against Hermes Gateway and yield structured events.

    Used by ChatTurnWorker (durable path) and InstanceChatService (legacy SSE adapter).
    """

    def __init__(
        self,
        session: AsyncSession,
        *,
        settings: Settings | None = None,
        settings_repo: ChatSettingsRepository | None = None,
        attachment_repo: ChatAttachmentRepository | None = None,
        workspace_repo: WorkspaceRepository | None = None,
        profile_repo: ProfileRepository | None = None,
    ) -> None:
        self._session = session
        self._settings = settings or get_settings()
        self._settings_repo = settings_repo or ChatSettingsRepository(session)
        self._profiles = profile_repo or ProfileRepository(session)
        self._resolver = InstanceRefResolver(session, settings=self._settings)
        self._attachments = AttachmentService(
            self._profiles,
            attachment_repo or ChatAttachmentRepository(session),
            workspace_repo or WorkspaceRepository(session),
        )

    def _factory(self) -> HermesGatewayClientFactory:
        return HermesGatewayClientFactory(self._settings, self._session)

    async def ensure_gateway_ready(self, instance_id: str) -> Any:
        inst = await self._resolver.require_instance(instance_id)
        client = await self._factory().create_for_instance(inst.id, require_key=False)
        healthy = await client.health_check()
        if not healthy:
            if inst.status != InstanceStatus.RUNNING.value:
                raise gateway_not_running(instance_id=instance_id, state=inst.status)
            raise gateway_health_failed(instance_id=instance_id)
        return inst

    def _catalog(self) -> HermesModelCatalogService:
        return HermesModelCatalogService(self._session, self._settings)

    async def resolve_default_model(self, instance_id: str, session_model: str | None) -> str | None:
        """Resolve execution model for Gateway chat completions (PRD v1.5.4).

        Priority: non-virtual session override → profile_chat_settings (reconcile
        virtual bindings) → Hermes ``config.yaml`` via HermesModelCatalogService.

        Never falls back to Gateway ``/v1/models`` virtual aliases. Returns ``None``
        to omit ``payload.model`` so Hermes uses its local default (PRD §47).
        """
        # @lat: [[chat-sessions#Hermes Model Catalog (v1.5.4)]]
        if session_model and session_model.strip():
            candidate = session_model.strip()
            if not is_gateway_virtual_model_id(candidate):
                return candidate

        inst = await self._resolver.require_instance(instance_id)
        catalog = self._catalog()
        try:
            virtual_ids = await catalog.list_gateway_virtual_model_ids(inst)
        except Exception:
            virtual_ids = set()
        virtual_ids = set(virtual_ids) | set(GATEWAY_VIRTUAL_MODEL_IDS)

        row = await self._settings_repo.get_by_instance_id(instance_id)
        if row is not None and (row.model_id or "").strip():
            mid = row.model_id.strip()
            if mid not in virtual_ids:
                return mid
            # Virtual binding on the chat path: replace with config.yaml execution default.
            resolved = catalog.resolve_default_model(inst.profile_name)
            if resolved and resolved.model_id and resolved.model_id not in virtual_ids:
                row.provider = resolved.provider or row.provider or "auto"
                row.model_id = resolved.model_id
                row.model_label = resolved.model_label or resolved.model_id
                if resolved.base_url:
                    row.base_url = resolved.base_url
                row.updated_at = datetime.now(timezone.utc)
                await self._session.flush()
                return resolved.model_id
            return None

        resolved = catalog.resolve_default_model(inst.profile_name)
        if resolved and resolved.model_id and resolved.model_id not in virtual_ids:
            return resolved.model_id
        return None

    async def _attachment_profile_id(self, inst: Any) -> str:
        profile = await self._profiles.get_by_name(inst.profile_name)
        if profile is not None:
            return profile.id
        return inst.id

    async def execute(
        self,
        request: HermesChatExecutionRequest,
        cancel: asyncio.Event,
    ) -> AsyncIterator[HermesExecutionEvent]:
        # @lat: [[chat-sessions#Hermes Chat Executor]]
        inst = await self._resolver.require_deployed_instance(request.instance_id)
        await self.ensure_gateway_ready(request.instance_id)
        model = await self.resolve_default_model(request.instance_id, request.model_id)

        attachment_profile_id = await self._attachment_profile_id(inst)
        attachment_rows = await self._attachments.load_scoped(
            profile_id=attachment_profile_id,
            workspace_id=request.workspace_id or "",
            session_id=request.session_id or "",
            attachment_ids=list(request.attachment_ids or []),
        )
        context_block = self._attachments.build_attachment_context(attachment_rows)

        if request.messages:
            messages: list[dict[str, str]] = [dict(m) for m in request.messages]
        else:
            messages = [{"role": "user", "content": request.message or ""}]
        if context_block:
            messages.insert(0, {"role": "system", "content": context_block})

        payload: dict[str, Any] = {"messages": messages, "stream": True}
        if model:
            payload["model"] = model

        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        api_key = await GatewayCredentialService(self._settings, self._session).optional_key_for_profile(
            inst.profile_name
        )
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        if request.session_id:
            headers["x-hermes-session-id"] = request.session_id
        # PRD v1.6 FR-05 — pass real cwd to Hermes (not system-prompt text).
        cwd = None
        if isinstance(request.context, dict):
            cwd = request.context.get("cwd") or request.context.get("contextFolder")
        if cwd:
            headers["x-hermes-cwd"] = str(cwd)

        url = f"http://127.0.0.1:{inst.gateway_port}/v1/chat/completions"
        resolved_session_id: str | None = None
        message_parts: list[str] = []
        saw_terminal = False
        tool_count = 0

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    header_sid = response.headers.get("x-hermes-session-id")
                    if header_sid and str(header_sid).strip():
                        resolved_session_id = str(header_sid).strip()
                        yield HermesExecutionEvent(
                            type="session",
                            payload={"sessionId": resolved_session_id},
                        )

                    if response.status_code >= 400:
                        text = await response.aread()
                        yield HermesExecutionEvent(
                            type="failed",
                            payload={
                                "message": f"Chat stream failed: HTTP {response.status_code}",
                                "errorCode": "CHAT_STREAM_FAILED",
                                "details": {"body": text.decode(errors="replace")[:500]},
                            },
                        )
                        return

                    buffer = ""
                    async for chunk in response.aiter_text():
                        if cancel.is_set():
                            yield HermesExecutionEvent(
                                type="cancelled",
                                payload={"errorCode": "TURN_CANCELLED", "message": "aborted by client"},
                            )
                            return
                        buffer += chunk
                        while "\n\n" in buffer:
                            block, buffer = buffer.split("\n\n", 1)
                            for event in parse_hermes_sse_block(block):
                                if event.type == "message_delta":
                                    text_part = str(event.payload.get("content") or "")
                                    if text_part:
                                        message_parts.append(text_part)
                                if event.type.startswith("tool_"):
                                    tool_count += 1
                                if event.type in ("failed", "cancelled", "clarify_requested", "approval_requested"):
                                    saw_terminal = True
                                if request.turn_id and "turnId" not in event.payload:
                                    event.payload["turnId"] = request.turn_id
                                yield event
                                if event.type in ("failed", "cancelled", "clarify_requested", "approval_requested"):
                                    return

                    if buffer.strip():
                        for event in parse_hermes_sse_block(buffer):
                            if event.type == "message_delta":
                                text_part = str(event.payload.get("content") or "")
                                if text_part:
                                    message_parts.append(text_part)
                            if request.turn_id and "turnId" not in event.payload:
                                event.payload["turnId"] = request.turn_id
                            yield event
                            if event.type in ("failed", "cancelled"):
                                return

            if cancel.is_set():
                yield HermesExecutionEvent(
                    type="cancelled",
                    payload={"errorCode": "TURN_CANCELLED", "message": "aborted by client"},
                )
                return

            if not saw_terminal:
                full = "".join(message_parts)
                yield HermesExecutionEvent(
                    type="message_completed",
                    payload={
                        "content": full,
                        "text": full,
                        "turnId": request.turn_id,
                        "sessionId": resolved_session_id or request.session_id,
                    },
                )
                yield HermesExecutionEvent(
                    type="completed",
                    payload={
                        "turnId": request.turn_id,
                        "sessionId": resolved_session_id or request.session_id,
                        "modelId": model,
                        "toolCount": tool_count,
                    },
                )
        except ChatApiError as exc:
            yield HermesExecutionEvent(
                type="failed",
                payload={
                    "message": exc.message,
                    "errorCode": exc.code,
                    "details": exc.details or {},
                },
            )
        except httpx.HTTPError as exc:
            logger.warning("hermes chat http error: %s", exc)
            yield HermesExecutionEvent(
                type="failed",
                payload={
                    "message": str(exc),
                    "errorCode": "CHAT_STREAM_FAILED",
                },
            )
        except Exception as exc:  # noqa: BLE001 — surface as turn.failed
            logger.exception("hermes chat executor failed")
            yield HermesExecutionEvent(
                type="failed",
                payload={
                    "message": str(exc),
                    "errorCode": "TURN_FAILED",
                },
            )
