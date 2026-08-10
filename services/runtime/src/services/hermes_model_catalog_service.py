"""Hermes Execution Model Catalog (PRD v1.5.4).

Available models SOT: Hermes ``GET /api/model/options``.
Current default model SOT: ``~/.hermes/config.yaml`` via HermesLocalConfigService.

Gateway ``/v1/models`` virtual aliases (e.g. ``smc-copilot``) must never seed
execution model-config or Desktop model pickers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.config import Settings, get_settings
from core.errors import (
    ChatApiError,
    hermes_model_options_unavailable,
    model_catalog_parse_failed,
)
from db.models.runtime import HermesInstance
from integrations.hermes.client import HermesClientError
from integrations.hermes.client_factory import HermesGatewayClientFactory
from schemas.chat import (
    ChatDefaultModel,
    ChatGatewayVirtualInfo,
    ChatModel,
    ChatModelCapabilities,
    ChatModelListResponse,
)
from services.hermes_local_config_service import HermesLocalConfigService

# @lat: [[chat-sessions#Hermes Model Catalog (v1.5.4)]]

# Known Gateway Virtual Model aliases — never send as execution ``model``.
GATEWAY_VIRTUAL_MODEL_IDS = frozenset({"smc-copilot"})


def is_gateway_virtual_model_id(model_id: str | None, *, extra: set[str] | None = None) -> bool:
    """True when ``model_id`` is a Gateway virtual alias (not an execution model)."""
    mid = (model_id or "").strip()
    if not mid:
        return False
    if mid in GATEWAY_VIRTUAL_MODEL_IDS:
        return True
    if extra and mid in extra:
        return True
    return False


@dataclass(frozen=True)
class ResolvedExecutionModel:
    provider: str
    model_id: str
    base_url: str | None = None
    model_label: str | None = None


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_str(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _map_capabilities(raw: Any) -> ChatModelCapabilities | None:
    """Map only fields Hermes actually returns — never invent capabilities."""
    data = _as_dict(raw)
    if not data:
        return None
    vision = data.get("vision")
    reasoning = data.get("reasoning")
    tools = data.get("tools")
    if not isinstance(vision, bool) and not isinstance(reasoning, bool) and not isinstance(tools, bool):
        return None
    return ChatModelCapabilities(
        vision=vision if isinstance(vision, bool) else None,
        reasoning=reasoning if isinstance(reasoning, bool) else None,
        tools=tools if isinstance(tools, bool) else None,
    )


def _append_model(
    models: list[ChatModel],
    *,
    model_id: str,
    label: str | None,
    provider: str | None,
    base_url: str | None,
    available: bool,
    capabilities: ChatModelCapabilities | None,
    source: str,
) -> None:
    mid = model_id.strip()
    if not mid:
        return
    if any(m.id == mid and (m.provider or "") == (provider or "") for m in models):
        return
    models.append(
        ChatModel(
            id=mid,
            label=(label or mid).strip() or mid,
            provider=provider,
            base_url=base_url,
            available=available,
            is_default=False,
            is_current=False,
            capabilities=capabilities,
            source=source,
        )
    )


def normalize_model_options(raw: dict[str, Any]) -> list[ChatModel]:
    """Normalize Hermes ``/api/model/options`` payload into Runtime ChatModel list."""
    models: list[ChatModel] = []

    # Shape A: { "models": [ {id, provider, ...}, ... ] }
    flat = raw.get("models")
    if isinstance(flat, list):
        for item in flat:
            obj = _as_dict(item)
            mid = _as_str(obj.get("id") or obj.get("modelId") or obj.get("model_id") or obj.get("name"))
            if not mid:
                continue
            provider = _as_str(obj.get("provider") or obj.get("providerId") or obj.get("provider_id"))
            label = _as_str(obj.get("label") or obj.get("displayName") or obj.get("display_name") or obj.get("name"))
            base_url = _as_str(obj.get("baseUrl") or obj.get("base_url"))
            available = obj.get("available")
            _append_model(
                models,
                model_id=mid,
                label=label,
                provider=provider,
                base_url=base_url,
                available=True if not isinstance(available, bool) else available,
                capabilities=_map_capabilities(obj.get("capabilities") or obj.get("caps")),
                source="hermes-model-options",
            )

    # Shape B: { "providers": [ { id, models: [...] }, ... ] }
    providers = raw.get("providers") or raw.get("options")
    if isinstance(providers, list):
        for prov in providers:
            pobj = _as_dict(prov)
            provider = _as_str(pobj.get("id") or pobj.get("provider") or pobj.get("name"))
            base_url = _as_str(pobj.get("baseUrl") or pobj.get("base_url"))
            nested = pobj.get("models") or pobj.get("options") or pobj.get("items")
            if not isinstance(nested, list):
                # Provider entry itself may be a model option.
                mid = _as_str(pobj.get("id") or pobj.get("modelId") or pobj.get("model_id") or pobj.get("name"))
                if mid and provider and mid != provider:
                    _append_model(
                        models,
                        model_id=mid,
                        label=_as_str(pobj.get("label") or pobj.get("name")),
                        provider=provider,
                        base_url=base_url,
                        available=True,
                        capabilities=_map_capabilities(pobj.get("capabilities")),
                        source="hermes-model-options",
                    )
                continue
            for item in nested:
                if isinstance(item, str):
                    _append_model(
                        models,
                        model_id=item,
                        label=item,
                        provider=provider,
                        base_url=base_url,
                        available=True,
                        capabilities=None,
                        source="hermes-model-options",
                    )
                    continue
                obj = _as_dict(item)
                mid = _as_str(obj.get("id") or obj.get("modelId") or obj.get("model_id") or obj.get("name"))
                if not mid:
                    continue
                item_provider = _as_str(obj.get("provider")) or provider
                available = obj.get("available")
                _append_model(
                    models,
                    model_id=mid,
                    label=_as_str(obj.get("label") or obj.get("displayName") or obj.get("name")),
                    provider=item_provider,
                    base_url=_as_str(obj.get("baseUrl") or obj.get("base_url")) or base_url,
                    available=True if not isinstance(available, bool) else available,
                    capabilities=_map_capabilities(obj.get("capabilities") or obj.get("caps")),
                    source="hermes-model-options",
                )

    return models


class HermesModelCatalogService:
    """Normalize Hermes model options + config.yaml into Runtime catalog."""

    def __init__(
        self,
        session,
        settings: Settings | None = None,
        *,
        factory: HermesGatewayClientFactory | None = None,
        local_config: HermesLocalConfigService | None = None,
    ) -> None:
        self._session = session
        self._settings = settings or get_settings()
        self._factory = factory or HermesGatewayClientFactory(self._settings, session)
        self._local_config = local_config or HermesLocalConfigService(self._settings)

    def resolve_default_model(self, profile_name: str | None = "default") -> ResolvedExecutionModel | None:
        """Resolve current execution default from Hermes ``config.yaml`` SOT."""
        cfg = self._local_config.read_config(profile_name)
        if not cfg.valid or not isinstance(cfg.data, dict):
            return None
        data = cfg.data
        model_section = data.get("model") if isinstance(data.get("model"), dict) else {}
        default = (
            (model_section or {}).get("default")
            or data.get("default")
            or (model_section or {}).get("model")
        )
        model_id = _as_str(default)
        if not model_id:
            return None
        provider = _as_str((model_section or {}).get("provider") or data.get("provider")) or "auto"
        base_url = _as_str((model_section or {}).get("base_url") or data.get("base_url"))
        return ResolvedExecutionModel(
            provider=provider,
            model_id=model_id,
            base_url=base_url,
            model_label=model_id,
        )

    async def list_gateway_virtual_model_ids(self, inst: HermesInstance) -> set[str]:
        """Return Gateway Virtual Model ids from ``/v1/models`` (diagnostics / reconcile)."""
        try:
            client = await self._factory.create_for_instance(inst.id, require_key=False)
            raw_models, _raw = await client.list_models()
        except Exception:
            return set()
        ids: set[str] = set()
        for item in raw_models:
            obj = _as_dict(item)
            mid = _as_str(obj.get("id") or obj.get("name"))
            if mid:
                ids.add(mid)
        return ids

    async def build_catalog(
        self,
        inst: HermesInstance,
        *,
        refresh: bool = False,
        current_model_id: str | None = None,
    ) -> ChatModelListResponse:
        """Build execution model catalog for ``GET /chat/models``."""
        default = self.resolve_default_model(inst.profile_name)
        gateway_virtual: str | None = None
        try:
            virtual_ids = await self.list_gateway_virtual_model_ids(inst)
            if virtual_ids:
                # Prefer smc-copilot when present; else first id for diagnostics.
                gateway_virtual = "smc-copilot" if "smc-copilot" in virtual_ids else next(iter(virtual_ids))
        except Exception:
            gateway_virtual = None

        try:
            client = await self._factory.create_for_instance(inst.id, require_key=False)
            healthy = await client.health_check()
            if not healthy:
                status = (
                    "gateway_not_running"
                    if getattr(inst, "status", None) != "running"
                    else "gateway_health_failed"
                )
                return ChatModelListResponse(
                    instance_id=inst.id,
                    models=[],
                    default_model=(
                        ChatDefaultModel(
                            provider=default.provider,
                            model_id=default.model_id,
                            base_url=default.base_url,
                        )
                        if default
                        else None
                    ),
                    gateway=ChatGatewayVirtualInfo(virtual_model=gateway_virtual),
                    status=status,
                )

            raw = await client.list_model_options(refresh=refresh)
        except HermesClientError as exc:
            # Gateway may still answer /v1/models while /api/model/options is missing.
            raise hermes_model_options_unavailable(
                str(exc),
                instance_id=inst.id,
                degraded="model_catalog",
            ) from exc
        except ChatApiError:
            raise
        except Exception as exc:
            raise model_catalog_parse_failed(
                str(exc),
                instance_id=inst.id,
            ) from exc

        try:
            models = normalize_model_options(raw)
        except Exception as exc:
            raise model_catalog_parse_failed(
                str(exc),
                instance_id=inst.id,
            ) from exc

        # Drop Gateway virtual aliases if they leaked into options payload.
        if gateway_virtual:
            models = [m for m in models if m.id != gateway_virtual]
        models = [m for m in models if m.id != "smc-copilot"]

        default_model_payload: ChatDefaultModel | None = None
        if default is not None:
            default_model_payload = ChatDefaultModel(
                provider=default.provider,
                model_id=default.model_id,
                base_url=default.base_url,
            )
            matched = False
            for m in models:
                if m.id == default.model_id and (
                    not default.provider
                    or not m.provider
                    or m.provider == default.provider
                    or default.provider in ("auto", "hermes")
                ):
                    m.is_default = True
                    m.is_current = True
                    matched = True
                    break
            if not matched:
                # §20: config default missing from dynamic catalog → unavailable entry
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

        if current_model_id:
            for m in models:
                if m.id == current_model_id:
                    m.is_current = True
                    break

        if models and not any(m.is_current for m in models):
            models[0].is_current = True
            if not any(m.is_default for m in models):
                models[0].is_default = True

        return ChatModelListResponse(
            instance_id=inst.id,
            models=models,
            default_model=default_model_payload,
            gateway=ChatGatewayVirtualInfo(virtual_model=gateway_virtual),
            status="ok",
            raw=raw,
        )
