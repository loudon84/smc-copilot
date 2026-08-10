from __future__ import annotations

import sqlite3
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
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
from integrations.hermes.client_factory import HermesGatewayClientFactory
from runtime.hermes_profile_paths import profile_home
from schemas.chat import (
    ChatModelListResponse,
    InstanceChatModelConfig,
    SetInstanceChatModelConfigPayload,
    WorkspaceChatSendPayload,
    WorkspaceChatSessionMessage,
    WorkspaceChatSessionMessagesResponse,
)
from services.attachment_service import AttachmentService
from services.chat_stream_service import _ACTIVE_STREAMS, abort_stream, register_stream
from services.configuration_service import HermesConfigAdapter
from services.hermes_chat_event_mapper import HermesExecutionEvent
from services.hermes_chat_executor import HermesChatExecutionRequest, HermesChatExecutor
from services.hermes_model_catalog_service import (
    HermesModelCatalogService,
    is_gateway_virtual_model_id,
)
from services.instance_ref_resolver import InstanceRefResolver
from services.sse_helpers import format_sse


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


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

    def _catalog(self) -> HermesModelCatalogService:
        return HermesModelCatalogService(
            self._session,
            settings=self._app_settings,
            factory=self._factory(),
        )

    async def list_models(
        self,
        instance_id: str,
        *,
        refresh: bool = False,
    ) -> ChatModelListResponse:
        """Return Hermes Execution Model catalog (PRD v1.5.4).

        Source: Hermes ``/api/model/options`` + ``config.yaml`` default.
        Gateway ``/v1/models`` virtual aliases are diagnostics-only.
        """
        inst = await self._resolver.require_instance(instance_id)
        config = await self._settings_repo.get_by_instance_id(instance_id)
        current_id = config.model_id if config else None
        return await self._catalog().build_catalog(
            inst,
            refresh=refresh,
            current_model_id=current_id,
        )

    async def get_model_options(
        self,
        instance_id: str,
        *,
        refresh: bool = False,
    ) -> ChatModelListResponse:
        return await self.list_models(instance_id, refresh=refresh)

    async def get_model_config(self, instance_id: str) -> InstanceChatModelConfig | None:
        await self._resolver.require_instance(instance_id)
        row = await self._settings_repo.get_by_instance_id(instance_id)
        if row is None:
            # Seed default when Instance is already ready but never configured.
            return await self.ensure_default_model_config(instance_id)
        # PRD v1.5.4 §21: reconcile legacy gateway virtual model bindings.
        reconciled = await self._reconcile_virtual_model_binding(instance_id, row)
        if reconciled is not None:
            return reconciled
        return InstanceChatModelConfig(
            instance_id=row.instance_id or instance_id,
            provider=row.provider,
            model_id=row.model_id,
            model_label=row.model_label,
            base_url=row.base_url,
            updated_at=row.updated_at,
            source="profile_chat_settings",
        )

    async def ensure_default_model_config(self, instance_id: str) -> InstanceChatModelConfig | None:
        """Persist a default model-config once when Instance is ready (PRD v1.5.4).

        Seed **only** from Hermes ``config.yaml`` (execution model SOT).
        Never seed from Gateway ``/v1/models`` virtual aliases.
        Never overwrite an existing non-virtual user-saved config.
        """
        inst = await self._resolver.require_instance(instance_id)
        existing = await self._settings_repo.get_by_instance_id(instance_id)
        if existing is not None:
            reconciled = await self._reconcile_virtual_model_binding(instance_id, existing)
            if reconciled is not None:
                return reconciled
            return InstanceChatModelConfig(
                instance_id=existing.instance_id or instance_id,
                provider=existing.provider,
                model_id=existing.model_id,
                model_label=existing.model_label,
                base_url=existing.base_url,
                updated_at=existing.updated_at,
                source="profile_chat_settings",
            )

        resolved = self._catalog().resolve_default_model(inst.profile_name)
        if resolved is None:
            return None

        saved = await self.set_model_config(
            instance_id,
            SetInstanceChatModelConfigPayload(
                provider=resolved.provider or "auto",
                model_id=resolved.model_id,
                model_label=resolved.model_label,
                base_url=resolved.base_url,
            ),
        )
        return InstanceChatModelConfig(
            instance_id=saved.instance_id,
            provider=saved.provider,
            model_id=saved.model_id,
            model_label=saved.model_label,
            base_url=saved.base_url,
            updated_at=saved.updated_at,
            source="hermes-config",
        )

    async def _reconcile_virtual_model_binding(
        self,
        instance_id: str,
        existing: ProfileChatSettings,
    ) -> InstanceChatModelConfig | None:
        """Replace gateway virtual model bindings with config.yaml execution default.

        Only migrates rows whose ``model_id`` is a Gateway Virtual Model
        (e.g. ``smc-copilot``). Real user selections are never overwritten.
        """
        mid = (existing.model_id or "").strip()
        if not mid:
            return None
        inst = await self._resolver.require_instance(instance_id)
        catalog = self._catalog()
        virtual_ids = await catalog.list_gateway_virtual_model_ids(inst)
        # Always treat smc-copilot as virtual even if /v1/models is unreachable.
        virtual_ids = set(virtual_ids) | {"smc-copilot"}
        if mid not in virtual_ids:
            return None
        resolved = catalog.resolve_default_model(inst.profile_name)
        if resolved is None or not resolved.model_id or resolved.model_id in virtual_ids:
            return None
        if resolved.model_id == mid:
            return None
        return await self.set_model_config(
            instance_id,
            SetInstanceChatModelConfigPayload(
                provider=resolved.provider or "auto",
                model_id=resolved.model_id,
                model_label=resolved.model_label,
                base_url=resolved.base_url,
            ),
        )

    async def set_model_config(
        self, instance_id: str, body: SetInstanceChatModelConfigPayload
    ) -> InstanceChatModelConfig:
        inst = await self._resolver.require_instance(instance_id)
        model_id = body.model_id.strip()
        if not model_id:
            raise ChatApiError(
                "model_id is required",
                code="MODEL_CONFIG_INVALID",
                http_status=400,
            )
        if is_gateway_virtual_model_id(model_id):
            raise ChatApiError(
                "Gateway virtual model cannot be set as execution default",
                code="MODEL_CONFIG_INVALID",
                http_status=400,
                details={"modelId": model_id},
            )

        provider = (body.provider or "auto").strip() or "auto"
        base_url = (body.base_url or "").strip().rstrip("/") or None
        if provider == "auto" and base_url:
            provider = "custom"

        # Persist Hermes config.yaml execution default (SOT for Agent runtime).
        self._write_hermes_default_model(
            inst.profile_name,
            provider=provider,
            model_id=model_id,
            base_url=base_url,
        )

        now = _utc_now()
        existing = await self._settings_repo.get_by_instance_id(instance_id)
        profile_id = await self._resolve_profile_id_for_settings(inst, existing)
        row = ProfileChatSettings(
            profile_id=profile_id,
            instance_id=instance_id,
            provider=provider,
            model_id=model_id,
            model_label=body.model_label or model_id,
            base_url=base_url,
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
            source="hermes-config",
        )

    def _write_hermes_default_model(
        self,
        profile_name: str,
        *,
        provider: str,
        model_id: str,
        base_url: str | None,
    ) -> None:
        """Write model.default / provider / base_url into Hermes ``config.yaml``."""
        adapter = HermesConfigAdapter(self._app_settings)
        current = adapter.read(profile_name)
        current["provider"] = provider
        current["default"] = model_id
        model_section = current.get("model") if isinstance(current.get("model"), dict) else {}
        next_model = {
            **model_section,
            "provider": provider,
            "default": model_id,
        }
        if base_url:
            next_model["base_url"] = base_url
        elif "base_url" in next_model and not base_url:
            # Keep existing base_url when caller omitted it.
            pass
        current["model"] = next_model
        platforms = current.get("platforms") if isinstance(current.get("platforms"), dict) else {}
        api_server = platforms.get("api_server") if isinstance(platforms.get("api_server"), dict) else {}
        platforms = {
            **platforms,
            "api_server": {
                "host": api_server.get("host") or "127.0.0.1",
                "port": api_server.get("port") or 8642,
            },
        }
        current["platforms"] = platforms
        if "smart_model_routing" not in current:
            current["smart_model_routing"] = {"enabled": False}
        if "streaming" not in current:
            current["streaming"] = True
        adapter.write(profile_name, current)

    async def _resolve_profile_id_for_settings(
        self,
        inst: HermesInstance,
        existing: ProfileChatSettings | None,
    ) -> str:
        """Resolve a profiles.id that satisfies profile_chat_settings FK.

        Instance-native Runtime may have HermesInstance without a legacy Profile row.
        Create a minimal shadow Profile when missing so chat settings can persist.
        """
        from db.models.profile import Profile
        from utils.paths import profile_dir

        if existing is not None and existing.profile_id:
            if self._profiles is None or await self._profiles.get_by_id(existing.profile_id):
                return existing.profile_id

        if self._profiles is not None:
            profile = await self._profiles.get_by_name(inst.profile_name)
            if profile is not None:
                return profile.id
            # Shadow profile for FK only — does not take Gateway ownership.
            shadow = Profile(
                name=inst.profile_name,
                type="default",
                hermes_home=str(self._app_settings.hermes_home_path),
                profile_path=str(profile_dir(self._app_settings, inst.profile_name)),
                gateway_port=inst.gateway_port,
                enabled=True,
                auto_start=False,
                status="stopped",
            )
            created = await self._profiles.create(shadow)
            return created.id

        raise ChatApiError(
            "No Profile repository available to resolve chat settings FK",
            code="MODEL_CONFIG_INVALID",
            http_status=500,
            details={"instanceId": inst.id, "profileName": inst.profile_name},
        )

    async def resolve_default_model(self, instance_id: str, session_model: str | None) -> str | None:
        """Resolve chat model id for a turn — delegates to HermesChatExecutor (single SOT).

        Never fall back to Gateway virtual model aliases.
        """
        return await HermesChatExecutor(
            self._session,
            settings=self._app_settings,
            settings_repo=self._settings_repo,
            profile_repo=self._profiles,
        ).resolve_default_model(instance_id, session_model)

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
        """Compatibility adapter: HermesChatExecutor → legacy chat.* SSE strings."""
        # @lat: [[chat-sessions#Instance Chat]]
        stream_id = body.stream_id or f"stream_{uuid.uuid4().hex}"
        cancel = register_stream(stream_id)
        scope = {
            "stream_id": stream_id,
            "instance_id": instance_id,
            "workspace_id": body.workspace_id,
            "session_id": body.session_id,
        }
        resolved_session_id: str | None = None

        try:
            executor = HermesChatExecutor(
                self._session,
                settings=self._app_settings,
                settings_repo=self._settings_repo,
                profile_repo=self._profiles,
            )
            request = HermesChatExecutionRequest(
                instance_id=instance_id,
                messages=[{"role": m.role, "content": m.content} for m in body.messages],
                session_id=body.session_id,
                workspace_id=body.workspace_id,
                model_id=body.model,
                attachment_ids=list(body.attachments or []),
            )
            async for event in executor.execute(request, cancel):
                if event.type == "session":
                    sid = event.payload.get("sessionId")
                    if isinstance(sid, str) and sid.strip():
                        resolved_session_id = sid.strip()
                for sse in _legacy_sse_from_execution_event(event, scope, stream_id):
                    yield sse
                if event.type in ("failed", "cancelled"):
                    return

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

    async def list_session_messages(self, instance_id: str, session_id: str) -> WorkspaceChatSessionMessagesResponse:
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


def _legacy_sse_from_execution_event(
    event: HermesExecutionEvent,
    scope: dict[str, str],
    stream_id: str,
) -> list[str]:
    """Map HermesExecutionEvent → legacy Workspace chat.* SSE strings."""
    if event.type == "message_delta":
        content = str(event.payload.get("content") or "")
        if not content:
            return []
        return [
            format_sse(
                event_id=stream_id,
                event_name="chat.chunk",
                data={**scope, "content": content},
            )
        ]
    if event.type == "tool_progress" or event.type == "tool_started":
        return [
            format_sse(
                event_id=stream_id,
                event_name="chat.tool_progress",
                data={
                    **scope,
                    "name": str(event.payload.get("name") or "tool"),
                    "label": str(event.payload.get("label") or event.payload.get("name") or "tool"),
                },
            )
        ]
    if event.type == "usage":
        return [
            format_sse(
                event_id=stream_id,
                event_name="chat.usage",
                data={
                    **scope,
                    "prompt_tokens": int(event.payload.get("promptTokens") or 0),
                    "completion_tokens": int(event.payload.get("completionTokens") or 0),
                    "total_tokens": int(event.payload.get("totalTokens") or 0),
                },
            )
        ]
    if event.type in ("failed", "cancelled"):
        code = "CHAT_STREAM_ABORTED" if event.type == "cancelled" else str(event.payload.get("errorCode") or "CHAT_STREAM_FAILED")
        return [
            format_sse(
                event_id=stream_id,
                event_name="chat.error",
                data={
                    **scope,
                    "message": str(event.payload.get("message") or "Stream error"),
                    "details": {"code": code, **(event.payload.get("details") or {})},
                },
            )
        ]
    return []
