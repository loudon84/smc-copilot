from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from core.config import Settings, get_settings
from core.errors import ChatApiError
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from schemas.chat import WorkspaceChatSendPayload
from services.attachment_service import AttachmentService
from services.chat_model_service import ChatModelService
from services.gateway_credential_service import GatewayCredentialService
from services.profile_ref_resolver import ProfileRefResolver
from services.sse_helpers import format_sse

_ACTIVE_STREAMS: dict[str, asyncio.Event] = {}


def register_stream(stream_id: str) -> asyncio.Event:
    cancel = asyncio.Event()
    _ACTIVE_STREAMS[stream_id] = cancel
    return cancel


def abort_stream(stream_id: str) -> bool:
    cancel = _ACTIVE_STREAMS.pop(stream_id, None)
    if cancel is None:
        return False
    cancel.set()
    return True


def _parse_tool_progress(event_type: str, data_line: str) -> tuple[str, str] | None:
    if event_type != "hermes.tool.progress":
        return None
    try:
        payload = json.loads(data_line)
        if not isinstance(payload, dict):
            return None
        name = str(payload.get("tool") or payload.get("name") or "tool")
        label = str(payload.get("label") or name)
        return name, label
    except json.JSONDecodeError:
        return None


# @lat: [[chat-sessions#Chat SSE 流]]
class ChatStreamService:
    def __init__(
        self,
        profile_repo: ProfileRepository,
        settings_repo: ChatSettingsRepository,
        attachment_repo: ChatAttachmentRepository,
        workspace_repo: WorkspaceRepository,
        *,
        settings: Settings | None = None,
    ) -> None:
        self._profiles = profile_repo
        self._app_settings = settings or get_settings()
        self._model_service = ChatModelService(profile_repo, settings_repo, settings=self._app_settings)
        self._attachment_service = AttachmentService(profile_repo, attachment_repo, workspace_repo)
        self._resolver = ProfileRefResolver(profile_repo, settings=self._app_settings)

    async def stream_chat(
        self,
        profile_id: str,
        body: WorkspaceChatSendPayload,
    ) -> AsyncIterator[str]:
        stream_id = body.stream_id or f"stream_{uuid.uuid4().hex}"
        cancel = register_stream(stream_id)
        scope = {
            "stream_id": stream_id,
            "profile_id": profile_id,
            "workspace_id": body.workspace_id,
            "session_id": body.session_id,
        }

        try:
            await self._resolver.require_deployed_profile(profile_id)
            await self._model_service.ensure_gateway_ready(profile_id)
            profile = await self._resolver.require_profile(profile_id)
            model = await self._model_service.resolve_default_model(profile_id, body.model)

            attachment_rows = await self._attachment_service.load_scoped(
                profile_id=profile_id,
                workspace_id=body.workspace_id,
                session_id=body.session_id,
                attachment_ids=body.attachments,
            )
            context_block = self._attachment_service.build_attachment_context(attachment_rows)

            messages: list[dict[str, str]] = [{"role": m.role, "content": m.content} for m in body.messages]
            if context_block:
                messages.insert(
                    0,
                    {"role": "system", "content": context_block},
                )

            payload: dict[str, Any] = {
                "messages": messages,
                "stream": True,
            }
            if model:
                payload["model"] = model

            headers = {
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            }
            api_key = await GatewayCredentialService(
                self._app_settings, self._profiles._session
            ).optional_key_for_profile(profile.name)
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            if body.session_id:
                headers["x-hermes-session-id"] = body.session_id

            url = f"http://127.0.0.1:{profile.gateway_port}/v1/chat/completions"
            resolved_session_id: str | None = None

            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    url,
                    json=payload,
                    headers=headers,
                ) as response:
                    header_sid = response.headers.get("x-hermes-session-id")
                    if header_sid and str(header_sid).strip():
                        resolved_session_id = str(header_sid).strip()

                    if response.status_code >= 400:
                        text = await response.aread()
                        raise ChatApiError(
                            f"Chat stream failed: HTTP {response.status_code}",
                            code="CHAT_STREAM_FAILED",
                            details={"body": text.decode(errors="replace")[:500]},
                            http_status=502,
                        )

                    buffer = ""
                    async for chunk in response.aiter_text():
                        if cancel.is_set():
                            yield format_sse(
                                event_id=stream_id,
                                event_name="chat.error",
                                data={
                                    **scope,
                                    "message": "Stream aborted",
                                    "details": {"code": "CHAT_STREAM_ABORTED"},
                                },
                            )
                            return
                        buffer += chunk
                        while "\n\n" in buffer:
                            block, buffer = buffer.split("\n\n", 1)
                            for event in self._process_block(block, scope):
                                yield event

                    if buffer.strip():
                        for event in self._process_block(buffer, scope):
                            yield event

            done_data = {**scope}
            if resolved_session_id:
                done_data["resolved_session_id"] = resolved_session_id
            yield format_sse(
                event_id=stream_id,
                event_name="chat.done",
                data=done_data,
            )
        except ChatApiError as exc:
            yield format_sse(
                event_id=stream_id,
                event_name="chat.error",
                data={
                    **scope,
                    "message": exc.message,
                    "details": {"code": exc.code, **(exc.details or {})},
                },
            )
        except httpx.HTTPError as exc:
            yield format_sse(
                event_id=stream_id,
                event_name="chat.error",
                data={
                    **scope,
                    "message": str(exc),
                    "details": {"code": "CHAT_STREAM_FAILED"},
                },
            )
        finally:
            _ACTIVE_STREAMS.pop(stream_id, None)

    def _process_block(self, block: str, scope: dict[str, str]) -> list[str]:
        events: list[str] = []
        event_type = ""
        data_line = ""
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_type = line[7:].strip()
            elif line.startswith("data: "):
                data_line = line[6:]

        if not data_line:
            return events

        if event_type:
            progress = _parse_tool_progress(event_type, data_line)
            if progress:
                name, label = progress
                events.append(
                    format_sse(
                        event_id=scope["stream_id"],
                        event_name="chat.tool_progress",
                        data={**scope, "name": name, "label": label},
                    )
                )
            return events

        if data_line == "[DONE]":
            return events

        try:
            parsed = json.loads(data_line)
        except json.JSONDecodeError:
            return events

        if isinstance(parsed, dict) and parsed.get("error"):
            err = parsed["error"]
            message = err.get("message") if isinstance(err, dict) else str(err)
            events.append(
                format_sse(
                    event_id=scope["stream_id"],
                    event_name="chat.error",
                    data={**scope, "message": message or "Provider error", "details": parsed},
                )
            )
            return events

        usage = parsed.get("usage") if isinstance(parsed, dict) else None
        if isinstance(usage, dict):
            events.append(
                format_sse(
                    event_id=scope["stream_id"],
                    event_name="chat.usage",
                    data={
                        **scope,
                        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                        "completion_tokens": int(usage.get("completion_tokens") or 0),
                        "total_tokens": int(usage.get("total_tokens") or 0),
                    },
                )
            )

        choice = parsed.get("choices", [{}])[0] if isinstance(parsed, dict) else {}
        delta = choice.get("delta", {}) if isinstance(choice, dict) else {}
        content = delta.get("content") if isinstance(delta, dict) else None
        if content:
            events.append(
                format_sse(
                    event_id=scope["stream_id"],
                    event_name="chat.chunk",
                    data={**scope, "content": content},
                )
            )
        return events
