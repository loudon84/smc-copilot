from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import httpx

from core.config import Settings, get_settings
from core.errors import ChatApiError, gateway_health_failed, gateway_not_running
from core.runtime_enums import InstanceStatus
from db.models.chat_settings import ProfileChatSettings
from db.models.runtime import HermesInstance
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from integrations.hermes.client import HermesClientError
from integrations.hermes.client_factory import HermesGatewayClientFactory
from runtime.hermes_profile_paths import profile_home
from schemas.chat import (
    ChatModel,
    ChatModelListResponse,
    InstanceChatModelConfig,
    SetInstanceChatModelConfigPayload,
    WorkspaceChatSendPayload,
    WorkspaceChatSessionMessage,
    WorkspaceChatSessionMessagesResponse,
)
from services.attachment_service import AttachmentService
from services.chat_stream_service import _ACTIVE_STREAMS, abort_stream, register_stream
from services.gateway_credential_service import GatewayCredentialService
from services.instance_ref_resolver import InstanceRefResolver
from services.sse_helpers import format_sse


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _infer_provider(model_id: str, raw: dict[str, Any]) -> str | None:
    owned = raw.get("owned_by")
    if isinstance(owned, str) and owned:
        return owned
    if "/" in model_id:
        return model_id.split("/", 1)[0]
    return None


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


# @lat: [[chat-sessions#Instance Chat]]
class InstanceChatService:
    def __init__(
        self,
        session,
        settings_repo: ChatSettingsRepository,
        attachment_repo: ChatAttachmentRepository,
        workspace_repo: WorkspaceRepository,
        *,
        profile_repo: ProfileRepository | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._session = session
        self._settings_repo = settings_repo
        self._app_settings = settings or get_settings()
        self._resolver = InstanceRefResolver(session, settings=self._app_settings)
        self._profiles = profile_repo
        self._attachment_service = AttachmentService(
            profile_repo or ProfileRepository(session),
            attachment_repo,
            workspace_repo,
        )

    def _factory(self) -> HermesGatewayClientFactory:
        return HermesGatewayClientFactory(self._app_settings, self._session)

    async def list_models(self, instance_id: str) -> ChatModelListResponse:
        inst = await self._resolver.require_instance(instance_id)
        client = await self._factory().create_for_instance(inst.id, require_key=False)
        healthy = await client.health_check()
        if not healthy:
            if inst.status != InstanceStatus.RUNNING.value:
                return ChatModelListResponse(
                    instance_id=instance_id,
                    models=[],
                    status="gateway_not_running",
                )
            return ChatModelListResponse(
                instance_id=instance_id,
                models=[],
                status="gateway_health_failed",
            )

        config = await self._settings_repo.get_by_instance_id(instance_id)
        current_id = config.model_id if config else None

        try:
            raw_models, raw = await client.list_models()
        except HermesClientError as exc:
            raise ChatApiError(
                str(exc),
                code="MODEL_LIST_FAILED",
                details={"instance_id": instance_id},
                http_status=502,
            ) from exc

        models: list[ChatModel] = []
        for item in raw_models:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or item.get("name") or "").strip()
            if not model_id:
                continue
            models.append(
                ChatModel(
                    id=model_id,
                    label=str(item.get("name") or model_id),
                    provider=_infer_provider(model_id, item),
                    base_url=item.get("base_url") if isinstance(item.get("base_url"), str) else None,
                    source="gateway",
                    is_current=model_id == current_id,
                )
            )

        if models and not any(m.is_current for m in models):
            models[0].is_current = True

        return ChatModelListResponse(instance_id=instance_id, models=models, status="ok", raw=raw)

    async def get_model_options(self, instance_id: str) -> ChatModelListResponse:
        return await self.list_models(instance_id)

    async def get_model_config(self, instance_id: str) -> InstanceChatModelConfig | None:
        await self._resolver.require_instance(instance_id)
        row = await self._settings_repo.get_by_instance_id(instance_id)
        if row is None:
            return None
        return InstanceChatModelConfig(
            instance_id=row.instance_id or instance_id,
            provider=row.provider,
            model_id=row.model_id,
            model_label=row.model_label,
            base_url=row.base_url,
            updated_at=row.updated_at,
        )

    async def set_model_config(
        self, instance_id: str, body: SetInstanceChatModelConfigPayload
    ) -> InstanceChatModelConfig:
        inst = await self._resolver.require_instance(instance_id)
        if not body.model_id.strip():
            raise ChatApiError(
                "model_id is required",
                code="MODEL_CONFIG_INVALID",
                http_status=400,
            )
        now = _utc_now()
        existing = await self._settings_repo.get_by_instance_id(instance_id)
        profile_id = existing.profile_id if existing else instance_id
        if self._profiles is not None:
            profile = await self._profiles.get_by_name(inst.profile_name)
            if profile is not None:
                profile_id = profile.id
        row = ProfileChatSettings(
            profile_id=profile_id,
            instance_id=instance_id,
            provider=body.provider or "auto",
            model_id=body.model_id.strip(),
            model_label=body.model_label,
            base_url=body.base_url,
            is_default=1,
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        saved = await self._settings_repo.upsert_for_instance(instance_id, row)
        return InstanceChatModelConfig(
            instance_id=saved.instance_id or instance_id,
            provider=saved.provider,
            model_id=saved.model_id,
            model_label=saved.model_label,
            base_url=saved.base_url,
            updated_at=saved.updated_at,
        )

    async def resolve_default_model(self, instance_id: str, session_model: str | None) -> str | None:
        if session_model and session_model.strip():
            return session_model.strip()
        config = await self.get_model_config(instance_id)
        if config is not None:
            return config.model_id
        listed = await self.list_models(instance_id)
        if listed.models:
            return listed.models[0].id
        return None

    async def ensure_gateway_ready(self, instance_id: str) -> HermesInstance:
        inst = await self._resolver.require_instance(instance_id)
        client = await self._factory().create_for_instance(inst.id, require_key=False)
        healthy = await client.health_check()
        if not healthy:
            if inst.status != InstanceStatus.RUNNING.value:
                raise gateway_not_running(instance_id=instance_id, state=inst.status)
            raise gateway_health_failed(instance_id=instance_id)
        return inst

    async def stream_chat(
        self,
        instance_id: str,
        body: WorkspaceChatSendPayload,
    ) -> AsyncIterator[str]:
        stream_id = body.stream_id or f"stream_{uuid.uuid4().hex}"
        cancel = register_stream(stream_id)
        scope = {
            "stream_id": stream_id,
            "instance_id": instance_id,
            "workspace_id": body.workspace_id,
            "session_id": body.session_id,
        }

        try:
            inst = await self._resolver.require_deployed_instance(instance_id)
            await self.ensure_gateway_ready(instance_id)
            model = await self.resolve_default_model(instance_id, body.model)

            attachment_profile_id = await self._attachment_profile_id(inst)
            attachment_rows = await self._attachment_service.load_scoped(
                profile_id=attachment_profile_id,
                workspace_id=body.workspace_id,
                session_id=body.session_id,
                attachment_ids=body.attachments,
            )
            context_block = self._attachment_service.build_attachment_context(attachment_rows)

            messages: list[dict[str, str]] = [
                {"role": m.role, "content": m.content} for m in body.messages
            ]
            if context_block:
                messages.insert(0, {"role": "system", "content": context_block})

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
                self._app_settings, self._session
            ).optional_key_for_profile(inst.profile_name)
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            if body.session_id:
                headers["x-hermes-session-id"] = body.session_id

            url = f"http://127.0.0.1:{inst.gateway_port}/v1/chat/completions"
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

    def abort(self, stream_id: str) -> bool:
        return abort_stream(stream_id)

    async def list_session_messages(
        self, instance_id: str, session_id: str
    ) -> WorkspaceChatSessionMessagesResponse:
        inst = await self._resolver.require_instance(instance_id)
        home = profile_home(self._app_settings, inst.profile_name)
        if not home.is_dir():
            return WorkspaceChatSessionMessagesResponse(messages=[])

        db_path = home / "state.db"
        if not db_path.is_file():
            return WorkspaceChatSessionMessagesResponse(messages=[])

        try:
            conn = sqlite3.connect(str(db_path))
            try:
                rows = conn.execute(
                    """
                    SELECT id, role, content, timestamp
                    FROM messages
                    WHERE session_id = ? AND role IN ('user', 'assistant') AND content IS NOT NULL
                    ORDER BY timestamp, id
                    """,
                    (session_id,),
                ).fetchall()
            finally:
                conn.close()
        except sqlite3.Error:
            return WorkspaceChatSessionMessagesResponse(messages=[])

        messages = [
            WorkspaceChatSessionMessage(
                id=int(r[0]),
                role=str(r[1]),
                content=str(r[2]),
                timestamp=int(r[3]),
            )
            for r in rows
        ]
        return WorkspaceChatSessionMessagesResponse(messages=messages)

    async def _attachment_profile_id(self, inst: HermesInstance) -> str:
        if self._profiles is not None:
            profile = await self._profiles.get_by_name(inst.profile_name)
            if profile is not None:
                return profile.id
        return inst.id

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
