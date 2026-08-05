# Preload API 使用边界

## 1. 概述

Renderer 通过 Preload（`src/preload/index.ts`）暴露的 `window.*` 全局对象与 Main Process 通信。**禁止** Renderer 直接 `import` Node.js 模块或使用 `ipcRenderer`。

## 2. 全局 API 清单

从 `contextBridge.exposeInMainWorld` 调用提取：

| 全局对象 | Preload 文件 | 用途 |
|---|---|---|
| `window.electron` | `@electron-toolkit/preload` | Electron 工具 API |
| `window.hermesAPI` | `index.ts` (inline) | 安装/配置/聊天/会话/模型/技能/工具/更新/Enterprise |
| `window.aiosBrowser` | `browser-api.ts` | Web Operator 浏览器操作（13+ 方法 + V5.7 frame/snapshot + 事件） |
| `window.profileRuntime` | `profile-runtime-api.ts` | 多 Profile 运行时（20 方法） |
| `window.profileRole` | `profile-role-api.ts` | 专家角色预设 |
| `window.profileEntry` | `profile-entry-api.ts` | Profile 页面入口（5 方法） |
| `window.aiosRuntime` | `aios-api.ts` | Portal Runtime 启停/Doctor/日志 |
| `window.shellView` | `shell-view-api.ts` | ShellView 层管理（create/hide/reload/navigate/metadata） |
| `window.mainPageState` | `main-page-state-api.ts` | 主页面状态持久化（read/write） |
| `window.desktopAuth` | `auth-api.ts` | Portal Auth 登录（saveEndpointConfig / login / refresh / logout） |
| `window.desktopUserConfig` | `user-config-api.ts` | 本地 bootstrap apply / diff |
| `window.smcShell` | `shell-api.ts` | 启动门控（resolveStartupDecision）+ openExternal |
| `window.copilotServe` | `copilot-serve-api.ts` | copilot-serve 生命周期 |
| `window.workspaces` | `index.ts` (inline) | 文件列表/读取/git 状态 |
| `window.workspaceChat` | `workspace-chat-api.ts` | Workspaces Chat（SSE） |
| `window.hermesDefaultChat` | `hermes-default-chat-api.ts` | Local Hermes Chat |
| `window.chatRuntime` | `chat-runtime-api.ts` | **v8.0.1** runId 隔离 Chat Runtime（submit/abort/command + event） |
| `window.chatFiles` | `chat-files-api.ts` | **v8.0.1** Chat Files（持久化 session index + migrateDraft / saveManaged） |
| `window.webOperatorTaskSession` | `web-operator-task-session-api.ts` | WebOperator 任务会话 |

## 3. hermesAPI 方法分组

### 3.1 安装与校验

| 方法 | IPC Channel |
|---|---|
| `checkInstall` / `checkInstallStatus` | `check-install` |
| `verifyInstall` | `verify-install` |
| `startInstall` | `start-install` |
| `startInstallWithSource` | `start-install-with-source` |
| `getRuntimeState` | `enterprise:get-runtime-state` |
| `showOpenDialog` | `show-open-dialog` |
| `onInstallProgress` | `install-progress` (event) |

### 3.2 Hermes 引擎

| 方法 | IPC Channel |
|---|---|
| `getHermesVersion` / `refreshHermesVersion` | `get-hermes-version` / `refresh-hermes-version` |
| `runHermesDoctor` | `run-hermes-doctor` |
| `runHermesUpdate` | `run-hermes-update` |

### 3.3 配置（Profile-aware）

| 方法 | IPC Channel |
|---|---|
| `getEnv(profile?)` / `setEnv(key, value, profile?)` | `get-env` / `set-env` |
| `getConfig(key, profile?)` / `setConfig(key, value, profile?)` | `get-config` / `set-config` |
| `getHermesHome(profile?)` | `get-hermes-home` |
| `getModelConfig(profile?)` / `setModelConfig(...)` | `get-model-config` / `set-model-config` |

### 3.4 连接模式

| 方法 | IPC Channel |
|---|---|
| `isRemoteMode` / `isRemoteOnlyMode` | `is-remote-mode` / `is-remote-only-mode` |
| `getConnectionConfig` / `setConnectionConfig` | `get-connection-config` / `set-connection-config` |
| `setSshConfig` / `testSshConnection` / `isSshTunnelActive` / `startSshTunnel` / `stopSshTunnel` | 对应 IPC |

### 3.5 Chat

| 方法 | IPC Channel |
|---|---|
| `sendMessage` | `send-message` |
| `abortChat` | `abort-chat` |
| `onChatChunk` | `chat-chunk` (event) |
| `onChatDone` | `chat-done` (event) |
| `onChatToolProgress` | `chat-tool-progress` (event) |
| `onChatUsage` | `chat-usage` (event) |
| `onChatError` | `chat-error` (event) |

### 3.6 Gateway

| 方法 | IPC Channel |
|---|---|
| `startGateway` / `stopGateway` / `gatewayStatus` | 对应 IPC |
| `getAiOsRuntimeSnapshot` | `aios:get-runtime-snapshot` |

### 3.7 Sessions

| 方法 | IPC Channel |
|---|---|
| `listSessions` / `getSessionMessages` | `list-sessions` / `get-session-messages` |
| `listCachedSessions` / `syncSessionCache` / `updateSessionTitle` | 对应 IPC |
| `searchSessions` | `search-sessions` |

### 3.8 Profiles

| 方法 | IPC Channel |
|---|---|
| `listProfiles` / `createProfile` / `deleteProfile` / `setActiveProfile` | 对应 IPC |

### 3.9 Memory / Soul / Tools / Skills / Models / CronJobs / Backup / Updates / Enterprise

（详见 `src/preload/index.ts` 全文，每组均有对应的 IPC Channel 映射）

## 4. 使用约束

1. **禁止**在 Renderer 中直接 `import { ipcRenderer } from "electron"`
2. **禁止**猜测新增 IPC Channel；新通道必须：Main 注册 → Preload 封装 → `index.d.ts` 类型 → `docs/API_CONTRACTS.md`
3. 所有 IPC 调用通过 `window.*` 全局对象的 Promise 方法
4. 事件监听返回清理函数（`() => void`），组件卸载时必须调用
5. 类型定义在 `src/preload/index.d.ts`

## 5. 类型定义

`src/preload/index.d.ts` 声明所有 `window.*` 的 TypeScript 类型，Renderer 中无需额外 import。
