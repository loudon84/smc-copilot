# Session model override

The in-chat (bottom) model picker selects a model for the **current conversation only** — it never rewrites `config.yaml`, so the Settings global default is preserved (#688), and carries the full model identity so cross-provider switches route correctly.

The override is held in renderer state on each `<Chat>` run ([[src/renderer/src/screens/Chat/Chat.tsx]]), persisted by session id, and sent with every message; it is cleared when the conversation is cleared/reset and is absent on a fresh chat, so new conversations start on the global default. This is distinct from the persisted [[model-context]] default that non-chat surfaces read.

## Strict chat picker from agent config

The Chat ModelPicker lists **only** models already declared in hermes-agent `config.yaml` for the active profile — not the desktop `models.json` library seed (`DEFAULT_MODELS`) and not live provider discovery (e.g. Ollama Cloud `/models`).

[[src/renderer/src/screens/Chat/hooks/useModelConfig.ts#useModelConfig]] loads via `hermesAPI.listConfiguredModels` → IPC `list-configured-models` → [[src/main/models.ts#listConfiguredAgentModels]]. That function unions:

1. `model.default` / `model.provider` / `model.base_url` from [[src/main/config.ts#getModelConfig]] (also accepts top-level `provider`/`default` when the `model:` block is missing)
2. Each `custom_providers:` entry — both its primary `model:` and every id under the nested `models:` map

Dedup key is `provider + model + normalized baseUrl`. The Providers screen still uses `listModels()` / `models.json` for managing the broader library; only the in-chat picker is strict.

When `desktop.json` connection mode is `remote` but the URL is loopback (`localhost` / `127.0.0.1`), the IPC handler still reads the **local** `config.yaml` — that setup talks to a local gateway while agent config remains on disk. True remote hosts still expose only the dashboard's active model. SSH legacy falls back to [[src/main/ssh-remote.ts#sshGetModelConfig]].

Named custom provider cards on the Providers screen import both the `providers:` dict and the legacy `custom_providers:` list into `providers.json` via [[src/main/providers-store.ts#listCustomProviders]] (hosts that map to a first-party brand key stay on their dedicated card).

## Two-pane picker grouped by display brand

The bottom [[src/renderer/src/screens/Chat/ModelPicker.tsx]] dropdown is a two-pane layout: a left **provider rail** filters a right **flat model list**, with a top search box (leading magnifier icon) narrowing both.

The panel is styled as a floating native surface — translucent glass (`backdrop-filter`) lifted on a soft ambient shadow rather than a hard border, a recessed search field, and a filled-tint selection instead of an outlined row — so it reads as a desktop popover, not a web form. Depth comes from light (elevation, highlight, inset), not strokes; all radii use `var(--radius-*)` so the squared-corners theme toggle is respected.

The rail has an "All models" entry plus one row per brand (logo + model count); each list row shows the model title, a `Provider · model-id` subtitle, and a check on the active model. The currently-selected model is sorted **first** within whatever filter is shown (exact provider+model+baseUrl match, then same provider+model), leaving the rest of the list in its original order.

Models are grouped by **display brand**, not the raw stored provider, so OpenAI-compatible providers persisted as `custom` (SMC Copilot, Groq, DeepSeek, …) get their own rail entry instead of one generic "OpenAI Compatible / Local" bucket. [[src/renderer/src/screens/Chat/hooks/useModelConfig.ts#groupModelsByProvider]] derives each group's key/label from [[src/renderer/src/constants.ts#displayBrandFromConfig]], which reverse-maps a `custom` model's `baseUrl` to a brand id via `OPENAI_COMPATIBLE_BASE_URLS` (same reverse-map the [[provider-setup]] active-model picker uses). A `custom` endpoint not in the map stays under "OpenAI Compatible / Local".

Crucially, each model row keeps its **raw** `provider`/`baseUrl` for selection — only the rail grouping/label is branded — so routing and the active-model check (`currentModel === m.model && currentProvider === m.provider`) are unchanged. The rail brand filter is display-only React state; picking "All models" or a brand never rewrites config. The rail logo is the brand's [[src/renderer/src/components/common/BrandLogo.tsx]] (`matchTheme`), with a generic fallback for unknown brands.

A **Configure** button is pinned at the bottom of the provider rail (below the scrollable brand list), replacing the old free-text model input: it closes the picker and dispatches the `navigation:goto` window event (detail `"providers"`) that [[src/renderer/src/screens/Layout/Layout.tsx]] listens for, taking the user to the Providers screen to manage keys and the model library.

## Full identity, not just the model name

The override is a `SessionModelOverride` (`{provider, model, baseUrl}`), not a bare model string — because switching across providers must change routing, not only the `model` field.

The picker builds it via [[src/renderer/src/screens/Chat/hooks/useModelConfig.ts#effectiveOverrideBaseUrl]], the same baseUrl rule `selectModel` applies (keep the URL only for `custom`/`ollama-cloud`; clear it for named providers that have a canonical base URL), so the session pick and a persisted save can't drift. It is threaded renderer → preload IPC → main `sendMessage` as `modelOverride`.

## Desktop-only persistence

The selected model/provider is saved in a desktop-owned table keyed by session id, without storing API keys.

[[src/main/session-model-override-store.ts]] holds `desktop_session_model_overrides` with `provider`, `model`, and `base_url` only. [[src/renderer/src/screens/Chat/Chat.tsx#Chat]] restores the saved value for a resumed session, applies it to the local picker with `persist:false`, and saves later changes once a gateway session id exists. Deleting a session removes the row through [[src/main/sessions.ts#deleteSessionRows]].

## Text-only legacy fallback routes via CLI

Local Chat no longer routes session overrides through a Hermes Python CLI fallback.

[[src/main/hermes.ts#shouldForceCliForSessionOverride]] is always `false`, so same-provider and cross-provider swaps stay on the gateway/API path. If the gateway is unavailable the turn errors closed.

## Attachment turns stay on session transport

Attachment turns use the gateway/API path, which preserves image parts and path refs through [[src/main/hermes.ts#buildUserContent]]. There is no CLI transport that could drop multimodal input.
