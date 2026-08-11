# Chatbox Project Semantic Overview

## Purpose

Chatbox is a **local-first, multi-provider AI chat client**, not a backend service or AI framework. It is a cross-platform GUI shell that routes user conversations to external LLM APIs, stores all data on-device, and exposes extensibility via provider plugins and MCP tool servers. It is explicitly **not** a model host, not a RAG framework, and not a general-purpose agent runtime.

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                            │
│  src/main/  — storage, KB, MCP stdio, OAuth callbacks       │
├──────────────────────┬──────────────────────────────────────┤
│  Preload Bridge      │  src/preload/  — contextBridge IPC   │
├──────────────────────┴──────────────────────────────────────┤
│  Renderer Process (Chromium / Capacitor / Browser)          │
│  src/renderer/  — React + Jotai + TanStack Router           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ stores/      │  │ packages/    │  │ routes/ + pages/  │ │
│  │ (state)      │  │ (AI pipeline)│  │ (UI)              │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  src/shared/  — types, provider registry, model classes     │
│  (imported by both main and renderer)                       │
└─────────────────────────────────────────────────────────────┘
```

**Runtime layer** — `src/main/main.ts`: window lifecycle, IPC handlers, native menus, OAuth callback server, `libsql` init, MCP stdio transport. [1](#0-0) 

**IPC bridge** — `src/preload/`: `contextBridge.exposeInMainWorld` is the only legal crossing point between main and renderer. All storage, file, and OAuth operations cross here. [2](#0-1) 

**Platform abstraction** — `src/renderer/platform/index.ts`: single interface that dispatches to Electron IPC, Capacitor plugins, or browser APIs depending on build target. All renderer code that needs native capability must go through this layer. 

**Provider registry** — `src/shared/providers/`: the AI dispatch layer. `defineProvider()` + side-effect imports in `index.ts` populate a `Map<string, ProviderDefinition>`. `getModel()` is the sole factory entry point. [3](#0-2) 

**Model class hierarchy** — `src/shared/models/`: `AbstractAISDKModel` → `OpenAICompatible` → concrete providers. All streaming, retry, and error normalization live here. [4](#0-3) 

**State layer** — `src/renderer/stores/`: Zustand for `settingsStore`, `chatStore`; Jotai atoms for transient UI state. These are the only sources of truth for session and settings data in the renderer. 

---

## Key Modules

`src/shared/providers/registry.ts` — `Map<string, ProviderDefinition>`, `defineProvider()`, `getProviderDefinition()`, `getAllProviders()`. Import order = UI display order. [5](#0-4) 

`src/shared/providers/index.ts` — side-effect import list (registration order), `getModel()` factory, `getProviderSettings()`, `getModelConfig()`. [6](#0-5) 

`src/shared/providers/definitions/models/` — concrete model classes. `AbstractAISDKModel` is the stable base; `OpenAICompatible` is the reusable OpenAI-protocol subclass. [7](#0-6) 

`src/shared/model-registry/` — shared layer for models.dev enrichment: `enrich.ts` (two-level match + field overwrite), `provider-mapping.ts` (single source of truth for Chatbox↔models.dev ID mapping). [8](#0-7) 

`src/renderer/packages/model-registry/fetch.ts` — three-tier cache: memory → Blob store → build-time snapshot. Concurrent fetches are deduplicated via shared Promise. [9](#0-8) 

`src/renderer/packages/model-calls/stream-text.ts` — AI call pipeline: OCR injection, system prompt, toolset assembly, then delegates to `ModelInterface.chatStream()`. [10](#0-9) 

`src/renderer/stores/session/stream-chunk-processor.ts` — stateful stream consumer. Converts `TextStreamPart` chunks into `MessageContentPart[]` mutations (`text`, `reasoning`, `tool-call`, `image`). [11](#0-10) 

`src/renderer/stores/chatStore.ts` — session CRUD, persistence via `StorageKeyGenerator.session(id)`, creation with inherited last-used model settings. [12](#0-11) 

`src/renderer/stores/settingsStore.ts` — global settings (providers, API keys, extensions, MCP). Platform-aware initialization for `documentParser`. [13](#0-12) 

`src/renderer/stores/sessionActions.ts` — `submitNewUserMessage`, thread refresh, fork creation. The only correct entry point for triggering generation. [14](#0-13) 

`src/main/knowledge-base/` — RAG subsystem init, `libsql` DB, background embedding workers. Desktop-only. 

`src/main/mcp/` — MCP stdio transport, process management. Exposed to renderer via IPC. 

`src/main/oauth/` — OAuth provider registry, IPC handlers, callback HTTP server, token refresh. Three flows: callback (OpenAI), code-paste (Anthropic), device-code (GitHub Copilot). Desktop-only. [15](#0-14) 

`src/shared/oauth/` — `mergeSharedOAuthProviderSettings()`, `resolveEffectiveApiKey()`, credential manager. Shared between main and renderer. [16](#0-15) 

---

## Lifecycle

1. **Main process init** — `src/main/main.ts`: create `BrowserWindow`, register IPC handlers, init `libsql` (KB), register MCP transport, register OAuth callback server, register deep-link protocol `chatbox://`.
2. **Renderer bootstrap** — `src/renderer/index.tsx`: mount React, wrap with `MantineProvider` + `MUIThemeProvider` + `NiceModal.Provider`, init TanStack Router.
3. **Settings hydration** — `settingsStore` loads from `electron-store` (desktop) or Capacitor SQLite (mobile); platform-aware defaults applied.
4. **Provider registry population** — side-effect imports in `src/shared/providers/index.ts` execute `defineProvider()` calls in order; registry `Map` is fully populated before any `getModel()` call.
5. **Model registry prefetch** — `prefetchModelRegistry()` fires in background; populates three-tier cache from models.dev; React components subscribe via `useSyncExternalStore`.
6. **Session restore** — `chatStore` rehydrates last active session from storage; router navigates to `/session/$sessionId`.
7. **Generation loop** — `submitNewUserMessage` → `generate()` → `streamText()` → `ModelInterface.chatStream()` → `processStreamChunk()` mutates `Message.contentParts` in real time → React re-renders.
8. **Persistence** — every session mutation is written to storage via `setItemNow(StorageKeyGenerator.session(id), ...)`.

---

## Extension Points

**New built-in provider** — add enum to `src/shared/types/provider.ts`, create `src/shared/providers/definitions/models/your-provider.ts` (extend `AbstractAISDKModel` or `OpenAICompatible`), create `src/shared/providers/definitions/your-provider.ts` with one `defineProvider()` call, add one side-effect import line to `src/shared/providers/index.ts`. 4 files total. [17](#0-16) 

**New user-defined provider** — no code change needed. `createCustomProviderModel()` in `src/shared/providers/utils.ts` dispatches by `ModelProviderType` (`OpenAI`, `Claude`, `Gemini`, `OpenAIResponses`). [18](#0-17) 

**New tool/skill** — implement a `ToolSet` and register it in the `streamText()` pipeline in `src/renderer/packages/model-calls/stream-text.ts`. The stream processor handles `tool-call`/`tool-result` parts automatically. [10](#0-9) 

**New MCP server** — user-facing: add server config to `settings.mcp.servers[]`. Code-facing: extend `src/main/mcp/` transport if a new transport type (beyond stdio) is needed.

**New platform target** — implement the `Platform` interface in `src/renderer/platform/` and set `CHATBOX_BUILD_PLATFORM` in the build environment. All renderer code already routes through the platform abstraction. 

**New route/page** — add a file under `src/renderer/routes/` following TanStack Router file-based conventions. Settings sub-pages go under `src/renderer/routes/settings/`.

**models.dev enrichment coverage** — add a new entry to `src/shared/model-registry/provider-mapping.ts`. This is the single source of truth for which providers participate in registry enrichment. [19](#0-18) 

---

## Constraints (Non-Negotiable Invariants)

**Provider ID global uniqueness** — `customProviders[].id` must never collide with any built-in provider ID. ID is simultaneously the settings storage key, runtime routing key, OAuth credential key, and settings-page navigation key. Collision causes silent control-plane ambiguity. [20](#0-19) 

**`defineProvider()` is the single data source** — a provider's ID, name, API type, default config, and model factory must all live in one `defineProvider()` call. Do not re-introduce scattered switch statements or separate config arrays. [21](#0-20) 

**Import order = display order** — `ChatboxAI` must remain the first import in `src/shared/providers/index.ts`. Reordering imports changes the UI provider list order. [22](#0-21) 

**OAuth shares credentials, not auth mode** — `mergeSharedOAuthProviderSettings()` only merges the OAuth token; `activeAuthMode` is always provider-local. Never write code that copies `activeAuthMode` across providers. [23](#0-22) 

**Anthropic OAuth `state` = PKCE verifier** — Anthropic's authorization page rejects standard `state`+`verifier` split. `state` must reuse the verifier value. This is locked by a test in `src/main/oauth/providers/anthropic.test.ts`. Do not "fix" this to standard PKCE. [24](#0-23) 

**models.dev registry overwrites capabilities/contextWindow/maxOutput** — these fields are treated as authoritative facts from the registry. Provider defaults are fallbacks only. Do not add logic that lets provider defaults win over registry data for these three fields. [25](#0-24) 

**New models discovered only when provider API succeeds** — `getDiscoveredModels()` must not append newly discovered models when the provider API call fell back to the registry. This prevents unvalidated models from appearing in fallback mode. [26](#0-25) 

**OAuth is desktop-only** — OAuth IPC, callback HTTP server, and token refresh are gated to the desktop platform. Web and mobile use API keys only. Do not call OAuth IPC from platform-agnostic code. [27](#0-26) 

**`snapshot.generated.ts` is auto-generated** — `src/shared/model-registry/snapshot.generated.ts` must never be manually edited. It is regenerated by the build-time snapshot script. [28](#0-27) 

**Platform abstraction is mandatory** — renderer code must never call `window.electron` or Capacitor plugins directly. All native capability access goes through `src/renderer/platform/index.ts`. This is what makes the same renderer bundle run on desktop, mobile, and web.

---

## Page Components

```
src/renderer/routes/
├── index.tsx                    — landing / empty state
├── session/$sessionId.tsx       — primary chat view (Header + MessageList + InputBox)
├── settings/
│   ├── route.tsx                — settings shell (split-view nav)
│   ├── chat.tsx                 — general chat settings
│   ├── provider/
│   │   ├── [providerId]/        — per-provider config pages
│   │   └── chatbox-ai/          — ChatboxAI license + subscription
│   └── ...                      — shortcuts, display, about
└── about.tsx                    — version / credits

src/renderer/pages/
├── SettingDialog/               — legacy modal-based settings (being migrated to routes)
├── PictureDialog.tsx            — image generation session view
├── SearchDialog.tsx             — global session search
└── RemoteDialogWindow.tsx       — remote/shared session window

src/renderer/modals/
└── SessionSettings.tsx          — per-session system prompt / temperature modal (NiceModal)
``` [29](#0-28) [30](#0-29) 

The `Sidebar.tsx` is a `SwipeableDrawer` (MUI) containing `SessionList`. It is the primary navigation surface. On small screens it becomes a temporary overlay; on desktop it is persistent. RTL layout (Arabic) flips the drawer anchor. [31](#0-30) 

Modal management uses `@ebay/nice-modal-react` — modals are invoked imperatively from store actions, not via prop drilling. `SessionSettings`, `CompressionModal`, and provider-specific dialogs follow this pattern. [32](#0-31) 

---

## What This System Is Not

- Not a backend: no server process, no multi-user session management, no persistent network endpoint.
- Not a model runtime: does not run inference; all AI calls are proxied to external APIs.
- Not a general agent framework: the "agent" loop is the `submitNewUserMessage` → `streamText` → tool-call cycle, scoped to a single session.
- Not a plugin marketplace: MCP servers are the extension mechanism for tools; there is no dynamic UI plugin system.

### Citations

**File:** src/main/main.ts (L1-37)
```typescript
/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, session, shell, Tray } from 'electron'
import electronDebug from 'electron-debug'
import log from 'electron-log/main'
import { autoUpdater } from 'electron-updater'
import os from 'os'
import path from 'path'
// @ts-expect-error - source-map-support doesn't have type definitions
import * as sourceMapSupport from 'source-map-support'
import type { ShortcutSetting } from 'src/shared/types'
import * as analystic from './analystic-node'
import * as autoLauncher from './autoLauncher'
import { handleDeepLink } from './deeplinks'
import { parseFile } from './file-parser'
import Locale from './locales'
import * as mcpIpc from './mcp/ipc-stdio-transport'
import MenuBuilder from './menu'
import * as proxy from './proxy'
import {
  delStoreBlob,
  getConfig,
  getSettings,
  getStoreBlob,
  listStoreBlobKeys,
  setStoreBlob,
  store,
} from './store-node'
```

**File:** src/renderer/preload.d.ts (L1-10)
```typescript
import { ElectronIPC } from '../shared/electron-types'

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electronAPI: ElectronIPC
  }
}


```

**File:** src/shared/providers/index.ts (L6-30)
```typescript
// ChatboxAI must be imported first to ensure it appears at the top of provider lists
// Import order determines display order in UI (side-effect registration into Map)
import './definitions/chatboxai'
import './definitions/openai'
import './definitions/openai-responses'
import './definitions/gemini'
import './definitions/claude'
import './definitions/deepseek'
import './definitions/qwen'
import './definitions/qwen-portal'
import './definitions/minimax'
import './definitions/moonshot'
import './definitions/siliconflow'
import './definitions/openrouter'
import './definitions/ollama'
import './definitions/lmstudio'
import './definitions/azure'
import './definitions/groq'
import './definitions/xai'
import './definitions/mistral-ai'
import './definitions/perplexity'
import './definitions/volcengine'
import './definitions/chatglm'
import './definitions/github-copilot'
import './definitions/bedrock'
```

**File:** src/shared/providers/index.ts (L128-191)
```typescript
export function getModel(
  settings: SessionSettings,
  globalSettings: Settings,
  config: Config,
  dependencies: ModelDependencies
): ModelInterface {
  console.debug('getModel (registry)', settings.provider, settings.modelId)

  const provider = settings.provider
  if (!provider) {
    throw new Error('Model provider must not be empty.')
  }

  // Check if provider is registered in the new registry
  const providerDefinition = getProviderDefinition(provider)

  if (providerDefinition) {
    // Provider is registered - use the new registry-based approach
    const { providerSetting, formattedApiHost, providerBaseInfo } = getProviderSettings(settings, globalSettings)
    const model = getModelConfig(settings, globalSettings, provider)
    const formattedApiPath = providerSetting.apiPath || providerBaseInfo.defaultSettings?.apiPath || ''
    const effectiveApiKey = resolveEffectiveApiKey(providerSetting, dependencies.platformType || 'desktop')

    const createConfig: CreateModelConfig = {
      settings,
      globalSettings,
      config,
      dependencies,
      providerSetting,
      formattedApiHost,
      formattedApiPath,
      model,
      effectiveApiKey,
    }

    return providerDefinition.createModel(createConfig)
  }

  // Provider not registered - check if it's a custom provider
  const { providerSetting, formattedApiHost, providerBaseInfo } = getProviderSettings(settings, globalSettings)
  const model = getModelConfig(settings, globalSettings, provider)

  if (providerBaseInfo.isCustom) {
    const formattedApiPath = providerSetting.apiPath || providerBaseInfo.defaultSettings?.apiPath || ''
    const effectiveApiKey = resolveEffectiveApiKey(providerSetting, dependencies.platformType || 'desktop')
    return createCustomProviderModel(
      {
        settings,
        globalSettings,
        config,
        dependencies,
        providerSetting,
        formattedApiHost,
        formattedApiPath,
        model,
        effectiveApiKey,
      },
      providerBaseInfo.type,
      dependencies
    )
  }

  throw new Error(`Cannot find model with provider: ${settings.provider}`)
}
```

**File:** src/shared/models/abstract-ai-sdk.ts (L41-64)
```typescript
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 5,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_FACTOR: 2,
} as const

function is5xxError(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    const statusCode = error.statusCode
    return statusCode !== undefined && statusCode >= 500 && statusCode < 600
  }
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: unknown }).statusCode
    return typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600
  }
  if (error instanceof ApiError && error.message) {
    const match = error.message.match(/Status Code (\d+)/)
    if (match) {
      const statusCode = parseInt(match[1], 10)
      return statusCode >= 500 && statusCode < 600
    }
  }
  return false
}
```

**File:** docs/technical/ai-providers.md (L9-13)
```markdown
设计目标：

- **单一数据源**：每个供应商的所有信息（ID、名称、API 类型、默认配置、模型工厂函数）集中在一个 `defineProvider()` 调用中，消除信息分散的问题。
- **可扩展性**：新增内置供应商只需 4 个文件改动；用户自建供应商通过 `createCustomProviderModel()` 动态支持。
- **关注点分离**：供应商定义（definition）与模型实现（model class）解耦，分别位于 `definitions/` 和 `definitions/models/`。
```

**File:** docs/technical/ai-providers.md (L19-41)
```markdown
### 核心机制

供应商系统的注册表位于 `src/shared/providers/registry.ts`，内部维护一个 `Map<string, ProviderDefinition>`。关键 API：

| 函数 | 用途 |
|------|------|
| `defineProvider(def)` | 注册一个供应商定义，返回 `ProviderDefinition` 对象 |
| `getProviderDefinition(id)` | 按 ID 查找已注册供应商 |
| `getAllProviders()` | 获取所有已注册供应商列表 |
| `getSystemProviders()` | 获取供 UI 使用的供应商基础信息列表 |

### 副作用导入（Side-Effect Import）

注册通过 **副作用导入** 触发——在 `src/shared/providers/index.ts` 中，每个供应商定义文件作为副作用被导入：

```typescript
import './definitions/chatboxai'
import './definitions/openai'
import './definitions/claude'
// ... 其余供应商
```

模块加载时 `defineProvider()` 自动执行，将供应商写入注册表。**导入顺序决定了 UI 中供应商的显示顺序**（ChatboxAI 始终排在首位）。
```

**File:** docs/technical/ai-providers.md (L85-89)
```markdown
#### 关键约束

- **禁止 builtin/custom 同 ID**
  `customProviders[].id` 不得与任何内置 provider ID 冲突。ID 是运行时路由键、设置主键、OAuth 共享键，不能复用。
- **OAuth 只共享凭证，不共享认证模式**
```

**File:** docs/technical/ai-providers.md (L109-125)
```markdown
模型注册表跨越 `shared` 和 `renderer` 两个层：

| 层 | 路径 | 职责 |
|------|------|------|
| shared | `src/shared/model-registry/` | 供应商 ID 映射、数据转换、模型匹配与富化 |
| renderer | `src/renderer/packages/model-registry/` | 网络请求、多级缓存、React 订阅、向后兼容 API |

### 供应商 ID 映射

`src/shared/model-registry/provider-mapping.ts` 维护 Chatbox 供应商 ID 到 models.dev 供应商 ID 的映射关系：

- 支持多对一映射（如 `openai` 和 `openai-responses` 均映射到 models.dev 的 `openai`）
- 未在映射表中的供应商（Ollama、LM Studio、Azure、ChatboxAI 等）不参与 models.dev 富化
- 映射关系同时被运行时富化和构建时快照生成脚本共用（**单一数据源**）

当前映射覆盖：OpenAI、Claude、Gemini、xAI、DeepSeek、Groq、Mistral、Perplexity、OpenRouter、MiniMax、Moonshot、SiliconFlow、ChatGLM、Qwen 等。

```

**File:** docs/technical/ai-providers.md (L128-154)
```markdown
`src/renderer/packages/model-registry/fetch.ts` 实现多级缓存策略：

```
查找优先级：内存缓存 → 平台 Blob 存储 → 构建时快照
```

| 数据源 | 来源 | 时效性 |
|------|------|------|
| 内存缓存 | 运行时 fetch 结果 | 当前会话 |
| 平台 Blob 存储 | `platform.getStoreBlob()` | 7 天 TTL |
| 构建时快照 | `snapshot.generated.ts` | 构建时 |

关键 API：

| 函数 | 用途 |
|------|------|
| `getRegistrySync()` | 同步获取（内存缓存 → 构建时快照），无 I/O |
| `getRegistry()` | 异步获取，必要时从 Blob 缓存加载或发起 fetch |
| `prefetchModelRegistry()` | 应用启动时后台预加载 |
| `forceRefreshRegistry()` | 用户点击"获取模型"按钮时强制刷新 |
| `fetchAndUpdateRegistry()` | 从 `https://models.dev/api.json` 获取数据（15s 超时），并发调用自动去重 |

缓存策略要点：
- 并发 fetch 请求通过共享 Promise 去重
- fetch 失败时保留已有缓存数据，不清空
- 数据更新后通过 `setRuntimeRegistry()` 注入 shared 层，使 `enrichModelFromRegistry()` 使用最新数据
- 通过 `subscribeRegistry()` + `useSyncExternalStore` 通知 React 组件刷新
```

**File:** docs/technical/ai-providers.md (L166-176)
```markdown

`enrichModelFromRegistry()` 的富化策略：

| 字段 | 策略 | 原因 |
|------|------|------|
| `capabilities` | registry **覆写** | 事实数据，registry 更权威 |
| `contextWindow` | registry **覆写** | 事实数据，registry 更权威 |
| `maxOutput` | registry **覆写** | 事实数据，registry 更权威 |
| `nickname` | 仅在缺失时填充 | 用户可能已自定义 |
| `type` | 仅在缺失时填充 | 保留现有分类 |

```

**File:** docs/technical/ai-providers.md (L194-197)
```markdown
关键决策：
- 本地模型配置优先于远程配置（保留用户自定义）
- 注册表富化**覆写** capabilities/contextWindow（更权威）
- **仅在 provider API 成功时**才追加发现的新模型（避免在 fallback 模式下引入未经验证的模型）
```

**File:** docs/technical/ai-providers.md (L220-221)
```markdown
| `src/shared/model-registry/types.ts` | `ModelMetadata`、`ModelRegistryData` 等类型定义 |
| `src/shared/model-registry/snapshot.generated.ts` | 构建时快照（自动生成，勿手动编辑） |
```

**File:** docs/technical/ai-providers.md (L226-253)
```markdown
## OAuth 认证集成

Provider 系统除了处理 API Key，也承载了桌面端 OAuth 登录能力。整体实现横跨 `main`、`renderer` 和 `shared` 三层：

- `src/main/oauth/`：主进程 OAuth provider 注册表、IPC handler、回调监听与 token 刷新
- `src/renderer/hooks/useOAuth.ts`：设置页登录、切换认证模式、自动刷新 token
- `src/shared/oauth/`：共享的 provider mapping、credential manager、OAuth fetch 封装
- `src/shared/providers/definitions/*.ts`：在具体 provider 的 `createModel()` 中决定是否启用 OAuth 请求链路

### 支持的 OAuth Provider

| Chatbox Provider | OAuth Provider ID | Flow 类型 | 关键实现 |
|------|------|------|------|
| `openai` | `openai` | callback | `src/main/oauth/providers/openai.ts` |
| `openai-responses` | `openai` | callback | 复用 OpenAI OAuth provider |
| `claude` | `claude` | code-paste | `src/main/oauth/providers/anthropic.ts` |
| `github-copilot` | `github-copilot` | device-code | `src/main/oauth/providers/github-copilot.ts` |

### 三种 OAuth 流程

主进程通过 `src/main/oauth/index.ts` 暴露统一 IPC 接口，但不同供应商走不同的授权模式：

1. **Callback flow**
   OpenAI 使用本地 callback server。主进程启动临时 HTTP 监听器，打开浏览器授权，收到 `code` 后在本地完成 token exchange。
2. **Code-paste flow**
   Anthropic 返回授权页后，用户需要把回调地址或授权码粘贴回应用，再由主进程调用 token endpoint。
3. **Device-code flow**
   GitHub Copilot 返回 `user_code` 和 `verification_uri`，用户在浏览器输入验证码，主进程轮询拿 token。
```

**File:** docs/technical/ai-providers.md (L255-268)
```markdown
### Provider 设置与共享凭证

`src/shared/oauth/provider-mapping.ts` 定义了 Chatbox provider 和 OAuth provider 的映射关系。当前只有一组共享关系：

- `openai-responses -> openai`

其语义分成两层：

- **OAuth 凭证共享**
  `openai-responses` 复用 `openai` 存储的 `oauth` token，避免用户重复登录。
- **认证模式独立**
  `activeAuthMode` 保留在各自 provider 设置中，`openai` 与 `openai-responses` 可以分别选择当前走 API Key 还是 OAuth。

这是通过 `mergeSharedOAuthProviderSettings()` 实现的：它只合并共享凭证，不覆盖当前 provider 的 `activeAuthMode`。对应回归测试见 `src/shared/oauth/provider-mapping.test.ts`。
```

**File:** docs/technical/ai-providers.md (L286-288)
```markdown

- **桌面端限定**
  OAuth IPC、callback server 和 token refresh 只在 desktop 平台启用；web / mobile 仍以 API Key 为主。
```

**File:** docs/technical/ai-providers.md (L291-293)
```markdown
- **Anthropic 非标准 state 约束**
  Anthropic 的授权页不接受“独立随机 state + PKCE verifier”的标准拆分实现。当前必须让 `state` 复用 verifier，否则浏览器授权页会返回 `Authorization failed / Invalid request format`。该约束已在 `src/main/oauth/providers/anthropic.ts` 写明注释，并由 `src/main/oauth/providers/anthropic.test.ts` 锁定。
- **共享 token 的写回行为**
```

**File:** docs/technical/ai-providers.md (L296-315)
```markdown
## 模型类层级

### 基类体系

模型类位于 `src/shared/providers/definitions/models/`，遵循以下继承结构：

- **`AbstractAISDKModel`**：抽象基类，定义核心接口（`streamText()`、`callChatCompletion()`）。Claude、Gemini 等使用独立 SDK 的供应商直接继承此类。
- **`OpenAICompatible`**：继承自 `AbstractAISDKModel`，封装 OpenAI 兼容 API 的通用逻辑。大多数供应商（Groq、DeepSeek、SiliconFlow、Ollama 等）继承此类。

### 能力声明系统

模型通过 `capabilities` 数组和方法声明其支持的能力：

| 能力 | 对应方法 | 说明 |
|------|---------|------|
| `vision` | `isSupportVision()` | 支持图片输入 |
| `tool_use` | `isSupportToolUse()` | 支持函数/工具调用 |
| `reasoning` | `isSupportReasoning()` | 推理模型（如 o1、o3 系列） |

能力信息在 `defaultSettings.models[].capabilities` 中静态声明，也可在模型类中动态覆盖。此系统用于 UI 条件渲染（如仅对支持视觉的模型显示图片上传按钮）和运行时行为适配。
```

**File:** docs/technical/ai-providers.md (L328-341)
```markdown
## 自建供应商

用户可在设置中添加自建供应商。自建供应商不经过 `defineProvider()` 注册，而是在 `getModel()` 中通过 `createCustomProviderModel()`（`src/shared/providers/utils.ts`）动态创建。

该函数根据用户选择的 `ModelProviderType` 分发到对应的 Custom 模型类：

| 协议类型 | 模型类 |
|---------|--------|
| `Claude` | `CustomClaude` |
| `Gemini` | `CustomGemini` |
| `OpenAIResponses` | `CustomOpenAIResponses` |
| `OpenAI`（默认） | `CustomOpenAI` |

这使得用户可以对接任何兼容上述协议的第三方 API，无需修改代码。
```

**File:** docs/technical/ai-providers.md (L369-376)
```markdown

记录于 [`docs/adding-new-provider.md`](../adding-new-provider.md)。添加一个新供应商只需 **4 个文件改动**：

1. `types.ts` — 添加枚举值
2. `definitions/models/your-provider.ts` — 创建模型类
3. `definitions/your-provider.ts` — 一次 `defineProvider()` 调用包含全部信息
4. `providers/index.ts` — 添加一行副作用导入

```

**File:** src/renderer/packages/model-calls (L1-1)
```text
[{"name":"generate-image.ts","path":"src/renderer/packages/model-calls/generate-image.ts","sha":"263348d7c098046a1eb4da52b0f8a6d6ae352ef7","size":889,"url":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/generate-image.ts?ref=main","html_url":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/generate-image.ts","git_url":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/263348d7c098046a1eb4da52b0f8a6d6ae352ef7","download_url":"https://raw.githubusercontent.com/chatboxai/chatbox/main/src/renderer/packages/model-calls/generate-image.ts","type":"file","_links":{"self":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/generate-image.ts?ref=main","git":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/263348d7c098046a1eb4da52b0f8a6d6ae352ef7","html":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/generate-image.ts"}},{"name":"index.test.ts","path":"src/renderer/packages/model-calls/index.test.ts","sha":"3926faeca3eaaa2bd2efeb248e367268f9d391f3","size":1113,"url":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/index.test.ts?ref=main","html_url":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/index.test.ts","git_url":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/3926faeca3eaaa2bd2efeb248e367268f9d391f3","download_url":"https://raw.githubusercontent.com/chatboxai/chatbox/main/src/renderer/packages/model-calls/index.test.ts","type":"file","_links":{"self":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/index.test.ts?ref=main","git":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/3926faeca3eaaa2bd2efeb248e367268f9d391f3","html":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/index.test.ts"}},{"name":"index.ts","path":"src/renderer/packages/model-calls/index.ts","sha":"43f31776929db17d8e46966f94301e7431bae31d","size":408,"url":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/index.ts?ref=main","html_url":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/index.ts","git_url":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/43f31776929db17d8e46966f94301e7431bae31d","download_url":"https://raw.githubusercontent.com/chatboxai/chatbox/main/src/renderer/packages/model-calls/index.ts","type":"file","_links":{"self":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/index.ts?ref=main","git":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/43f31776929db17d8e46966f94301e7431bae31d","html":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/index.ts"}},{"name":"message-utils.ts","path":"src/renderer/packages/model-calls/message-utils.ts","sha":"66b83a242557605e84da19e23c32f752dd61b57d","size":8658,"url":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/message-utils.ts?ref=main","html_url":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/message-utils.ts","git_url":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/66b83a242557605e84da19e23c32f752dd61b57d","download_url":"https://raw.githubusercontent.com/chatboxai/chatbox/main/src/renderer/packages/model-calls/message-utils.ts","type":"file","_links":{"self":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/message-utils.ts?ref=main","git":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/66b83a242557605e84da19e23c32f752dd61b57d","html":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/message-utils.ts"}},{"name":"preprocess.ts","path":"src/renderer/packages/model-calls/preprocess.ts","sha":"54acbd5659608476814787dc77a3be8531d0142f","size":1418,"url":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/preprocess.ts?ref=main","html_url":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/preprocess.ts","git_url":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/54acbd5659608476814787dc77a3be8531d0142f","download_url":"https://raw.githubusercontent.com/chatboxai/chatbox/main/src/renderer/packages/model-calls/preprocess.ts","type":"file","_links":{"self":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/preprocess.ts?ref=main","git":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/54acbd5659608476814787dc77a3be8531d0142f","html":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/preprocess.ts"}},{"name":"tools.ts","path":"src/renderer/packages/model-calls/tools.ts","sha":"40d62e01b4f7ab69dcd4e03473943041e761221a","size":6470,"url":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/tools.ts?ref=main","html_url":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/tools.ts","git_url":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/40d62e01b4f7ab69dcd4e03473943041e761221a","download_url":"https://raw.githubusercontent.com/chatboxai/chatbox/main/src/renderer/packages/model-calls/tools.ts","type":"file","_links":{"self":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/tools.ts?ref=main","git":"https://api.github.com/repos/chatboxai/chatbox/git/blobs/40d62e01b4f7ab69dcd4e03473943041e761221a","html":"https://github.com/chatboxai/chatbox/blob/main/src/renderer/packages/model-calls/tools.ts"}},{"name":"toolsets","path":"src/renderer/packages/model-calls/toolsets","sha":"6d2b8ef9dfd8760031c7f3685e02808c22eee363","size":0,"url":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/toolsets?ref=main","html_url":"https://github.com/chatboxai/chatbox/tree/main/src/renderer/packages/model-calls/toolsets","git_url":"https://api.github.com/repos/chatboxai/chatbox/git/trees/6d2b8ef9dfd8760031c7f3685e02808c22eee363","download_url":null,"type":"dir","_links":{"self":"https://api.github.com/repos/chatboxai/chatbox/contents/src/renderer/packages/model-calls/toolsets?ref=main","git":"https://api.github.com/repos/chatboxai/chatbox/git/trees/6d2b8ef9dfd8760031c7f3685e02808c22eee363","html":"https://github.com/chatboxai/chatbox/tree/main/src/renderer/packages/model-calls/toolsets"}}]
```

**File:** src/renderer/stores/session/stream-chunk-processor.ts (L40-44)
```typescript
export async function processStreamChunk(
  chunk: ModelStreamPart<ToolSet>,
  state: StreamProcessorState,
  callbacks: StreamProcessorCallbacks
): Promise<{ state: StreamProcessorState; skipUpdate: boolean; statusChunk?: ModelStreamPart<ToolSet> }> {
```

**File:** src/renderer/stores/chatStore.ts (L91-141)
```typescript
async function _getSessionById(id: string): Promise<Session | null> {
  console.debug('chatStore', 'getSessionById', id)
  const storageKey = StorageKeyGenerator.session(id)
  try {
    const session = await storage.getItem<Session | null>(storageKey, null)
    if (!session) {
      return null
    }
    return migrateSession(session)
  } catch (error) {
    log.error(`Failed to read session from storage (key: ${storageKey}, sessionId: ${id}):`, error)
    // Re-throw to prevent incorrect state
    throw error
  }
}

const getSessionQueryOptions = (sessionId: string) => ({
  queryKey: QueryKeys.ChatSession(sessionId),
  queryFn: () => _getSessionById(sessionId),
  staleTime: Infinity,
})

export async function getSession(sessionId: string) {
  return await queryClient.fetchQuery(getSessionQueryOptions(sessionId))
}

export function useSession(sessionId: string | null) {
  const { data: session, ...rest } = useQuery({
    ...getSessionQueryOptions(sessionId!),
    enabled: !!sessionId,
  })
  return { session, ...rest }
}

function _setSessionCache(sessionId: string, updated: Session | null) {
  // 1. update session cache 2. session settings do not use cache now
  queryClient.setQueryData(QueryKeys.ChatSession(sessionId), updated)
}

// create session
export async function createSession(newSession: Omit<Session, 'id'>, previousId?: string) {
  console.debug('chatStore', 'createSession', newSession)
  const { chat: lastUsedChatModel, picture: lastUsedPictureModel } = lastUsedModelStore.getState()
  const session = {
    ...newSession,
    id: uuidv4(),
    settings: {
      ...(newSession.type === 'picture' ? lastUsedPictureModel : lastUsedChatModel),
      ...newSession.settings,
    },
  }
```

**File:** src/shared/defaults.ts (L136-139)
```typescript
      // documentParser is NOT set here - it uses platform-specific defaults
      // Desktop: 'local', Mobile/Web: 'chatbox-ai'
      // See settingsStore.ts for the platform-aware initialization logic
      documentParser: undefined,
```

**File:** src/renderer/stores/sessionActions.ts (L28-54)
```typescript
// Re-export message operations from session/messages.ts
export {
  insertMessage,
  insertMessageAfter,
  modifyMessage,
  removeMessage,
  submitNewUserMessage,
} from './session/messages'
// Re-export naming operations from session/naming.ts
export {
  modifyNameAndThreadName,
  modifyThreadName,
  scheduleGenerateNameAndThreadName,
  scheduleGenerateThreadName,
} from './session/naming'
// Re-export thread operations from session/threads.ts
export {
  compressAndCreateThread,
  editThread,
  moveCurrentThreadToConversations,
  moveThreadToConversations,
  refreshContextAndCreateNewThread,
  removeCurrentThread,
  removeThread,
  startNewThread,
  switchThread,
} from './session/threads'
```

**File:** src/renderer/routes/session/$sessionId.tsx (L170-193)
```typescript
    <div className="flex flex-col h-full">
      <Header session={currentSession} />

      {/* MessageList 设置 key，确保每个 session 对应新的 MessageList 实例 */}
      <MessageList ref={messageListRef} key={`message-list${currentSessionId}`} currentSession={currentSession} />

      {/* <ScrollButtons /> */}
      <ErrorBoundary name="session-inputbox">
        <InputBox
          key={`input-box${currentSession.id}`}
          sessionId={currentSession.id}
          sessionType={currentSession.type}
          model={model}
          onStartNewThread={onStartNewThread}
          onRollbackThread={onRollbackThread}
          onSelectModel={onSelectModel}
          onClickSessionSettings={onClickSessionSettings}
          generating={!!lastGeneratingMessage}
          onSubmit={onSubmit}
          onStopGenerating={onStopGenerating}
        />
      </ErrorBoundary>
      <ThreadHistoryDrawer session={currentSession} />
    </div>
```

**File:** src/renderer/Sidebar.tsx (L49-49)
```typescript
  const sidebarWidth = useSidebarWidth()
```

**File:** src/renderer/Sidebar.tsx (L121-145)
```typescript
    <SwipeableDrawer
      anchor={language === 'ar' ? 'right' : 'left'}
      variant={isSmallScreen ? 'temporary' : 'persistent'}
      open={showSidebar}
      onClose={() => setShowSidebar(false)}
      onOpen={() => setShowSidebar(true)}
      ModalProps={{
        keepMounted: true, // Better open performance on mobile.
        disableEnforceFocus: true, // 关闭 focus trap，避免在侧边栏打开时弹出的 modal 中 input 无法点击
      }}
      sx={{
        '& .MuiDrawer-paper': {
          backgroundColor: isSmallScreen ? undefined : 'transparent',
          backgroundImage: 'none',
          boxSizing: 'border-box',
          width: isSmallScreen ? '75vw' : sidebarWidth,
          maxWidth: '75vw',
        },
      }}
      SlideProps={language === 'ar' ? { direction: 'left' } : undefined}
      PaperProps={
        language === 'ar' ? { sx: { direction: 'rtl', overflowY: 'initial' } } : { sx: { overflowY: 'initial' } }
      }
      disableSwipeToOpen={CHATBOX_BUILD_PLATFORM !== 'ios'} // 只在iOS设备上启用SwipeToOpen
    >
```

**File:** src/renderer/modals/SessionSettings.tsx (L53-53)
```typescript
const SessionSettingsModal = NiceModal.create(
```
