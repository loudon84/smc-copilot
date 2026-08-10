from __future__ import annotations

from datetime import UTC, datetime

from core.config import Settings, get_settings
from core.constants import GatewayStatus
from core.errors import ChatApiError, gateway_health_failed, gateway_not_running
from db.models.chat_settings import ProfileChatSettings
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from integrations.hermes.client import HermesClientError
from integrations.hermes.client_factory import HermesGatewayClientFactory
from schemas.chat import (
    ChatModel,
    ChatModelListResponse,
    ProfileChatModelConfig,
    SetProfileChatModelConfigPayload,
)
from services.hermes_model_catalog_service import HermesModelCatalogService, normalize_model_options
from services.profile_ref_resolver import ProfileRefResolver


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


class ChatModelService:
    def __init__(
        self,
        profile_repo: ProfileRepository,
        settings_repo: ChatSettingsRepository,
        *,
        settings: Settings | None = None,
    ) -> None:
        self._profiles = profile_repo
        self._settings = settings_repo
        self._app_settings = settings or get_settings()
        self._resolver = ProfileRefResolver(profile_repo, settings=self._app_settings)

    def _factory(self) -> HermesGatewayClientFactory:
        return HermesGatewayClientFactory(self._app_settings, self._profiles._session)

    async def list_models(self, profile_id: str) -> ChatModelListResponse:
        """Hermes Execution Model catalog for legacy profile chat routes (PRD v1.5.4)."""
        profile = await self._resolver.require_profile(profile_id)
        if profile.status != GatewayStatus.RUNNING.value:
            return ChatModelListResponse(
                profile_id=profile_id,
                models=[],
                status="gateway_not_running",
            )

        client = await self._factory().create_for_profile_name(
            profile.name, profile.gateway_port, require_key=False
        )
        healthy = await client.health_check()
        if not healthy:
            return ChatModelListResponse(
                profile_id=profile_id,
                models=[],
                status="gateway_health_failed",
            )

        config = await self._settings.get(profile_id)
        current_id = config.model_id if config else None
        default = HermesModelCatalogService(
            self._profiles._session,
            settings=self._app_settings,
            factory=self._factory(),
        ).resolve_default_model(profile.name)

        try:
            raw = await client.list_model_options(refresh=False)
            models = normalize_model_options(raw)
        except HermesClientError as exc:
            raise ChatApiError(
                str(exc),
                code="HERMES_MODEL_OPTIONS_UNAVAILABLE",
                details={"profile_id": profile_id, "degraded": "model_catalog"},
                http_status=502,
            ) from exc

        models = [m for m in models if m.id != "smc-copilot"]
        if default is not None:
            matched = False
            for m in models:
                if m.id == default.model_id:
                    m.is_default = True
                    m.is_current = True
                    matched = True
                    break
            if not matched:
                models.insert(
                    0,
                    ChatModel(
                        id=default.model_id,
                        label=default.model_label or default.model_id,
                        provider=default.provider,
                        base_url=default.base_url,
                        available=False,
                        is_default=True,
                        is_current=True,
                        source="hermes-config",
                    ),
                )
        if current_id:
            for m in models:
                if m.id == current_id:
                    m.is_current = True
                    break
        if models and not any(m.is_current for m in models):
            models[0].is_current = True

        return ChatModelListResponse(profile_id=profile_id, models=models, status="ok", raw=raw)

    async def get_model_config(self, profile_id: str) -> ProfileChatModelConfig | None:
        await self._resolver.require_profile(profile_id)
        row = await self._settings.get(profile_id)
        if row is None:
            return None
        return ProfileChatModelConfig(
            profile_id=row.profile_id,
            provider=row.provider,
            model_id=row.model_id,
            model_label=row.model_label,
            base_url=row.base_url,
            updated_at=row.updated_at,
        )

    async def set_model_config(self, profile_id: str, body: SetProfileChatModelConfigPayload) -> ProfileChatModelConfig:
        await self._resolver.require_profile(profile_id)
        if not body.model_id.strip():
            raise ChatApiError(
                "model_id is required",
                code="MODEL_CONFIG_INVALID",
                http_status=400,
            )
        now = _utc_now()
        existing = await self._settings.get(profile_id)
        row = ProfileChatSettings(
            profile_id=profile_id,
            provider=body.provider or "auto",
            model_id=body.model_id.strip(),
            model_label=body.model_label,
            base_url=body.base_url,
            is_default=1,
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        saved = await self._settings.upsert(row)
        return ProfileChatModelConfig(
            profile_id=saved.profile_id,
            provider=saved.provider,
            model_id=saved.model_id,
            model_label=saved.model_label,
            base_url=saved.base_url,
            updated_at=saved.updated_at,
        )

    async def resolve_default_model(self, profile_id: str, session_model: str | None) -> str | None:
        if session_model and session_model.strip():
            return session_model.strip()
        config = await self.get_model_config(profile_id)
        if config is not None:
            return config.model_id
        listed = await self.list_models(profile_id)
        if listed.models:
            return listed.models[0].id
        return None

    async def ensure_gateway_ready(self, profile_id: str) -> None:
        profile = await self._resolver.require_profile(profile_id)
        if profile.status != GatewayStatus.RUNNING.value:
            raise gateway_not_running(profile_id=profile_id, state=profile.status)
        client = await self._factory().create_for_profile_name(profile.name, profile.gateway_port, require_key=False)
        healthy = await client.health_check()
        if not healthy:
            raise gateway_health_failed(profile_id=profile_id)
