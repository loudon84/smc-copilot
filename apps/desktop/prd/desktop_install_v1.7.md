# SMC AI Copilot v1.7 PRD：Mattermost Desktop 壳层升级 + Hermes Agent 安装/更新状态保持

## 0. 结论

本次按 Mattermost Desktop 壳层模式升级 **不应改变 hermes-agent 的安装、初始化、模型配置判定逻辑**。

当前 `smc-ai-copilot` 已经具备硬验收项的核心基础：

1. `electron-builder.yml` 已采用 NSIS、允许用户选择安装目录、保留 AppData、写入自定义 NSIS 脚本。
2. NSIS 当前只创建 `runtime/bin/logs/cache/downloads`、写注册表、写 PATH、写 shim，不直接执行 hermes-agent 安装。
3. 主进程已有 `check-install`、`start-install`、`start-install-with-source`、`enterprise:get-runtime-state` 等 IPC。
4. `resolveRuntimeState()` 已返回 `runtimeReady`、`modelConfigured`、`needsAgentInstall`、`needsModelSetup`、`updateMode`。
5. Renderer 启动时已经按 `runtime.runtimeReady && runtime.modelConfigured -> main` 路由，符合“更新后直接进入主页”的主路径。

因此，本方案的核心不是重写安装器，而是把现有逻辑抽象成稳定的 **Startup Gate / Runtime State Gate**，再引入 Mattermost Desktop 的成熟壳层结构：`MainWindow + WebContentsView 管理 + Preload 隔离 + Modal/Dropdown View 管理 + 跨平台打包规则`。

---

# 1. 产品目标

## 1.1 升级目标

把 `smc-ai-copilot` 从当前“功能聚合型 Electron App”升级为“可长期扩展的桌面壳层平台”。

壳层升级后必须保留：

* Hermes Agent 安装
* Profile Runtime
* Chat
* Memory
* Tools
* Skills
* Gateway
* Portal 页面入口
* Web Operator
* 企业部署安装
* Windows 10+ 一键安装 / 更新
* 私有 git / zip / bundled runtime 安装方式
* 模型配置与运行状态判断

同时引入 Mattermost Desktop 的壳层设计：

* 主窗口生命周期独立管理
* WebContentsView 多 view 管理
* 内部 UI 与外部 Web 页面隔离
* Modal / Dropdown 通过独立 WebContentsView 承载
* preload API 分层
* View 状态、加载、重试、销毁标准化
* 跨平台打包脚本规范化

Mattermost Desktop 当前使用 `WebContentsView` 包装外部页面，并在 View 内管理 preload、load、reload、history、destroy、状态机和 context menu。
其 Modal 也使用独立 `WebContentsView`，通过 queue、show、hide、suspend、resolve/reject 控制弹窗生命周期。
Dropdown 也采用独立 `WebContentsView`，跟随主窗口 resize 重新计算 bounds。

---

# 2. 硬性验收项

## 2.1 必须满足的启动链路

```text
smc-ai-copilot 安装 / 更新完成
  -> 启动 App
  -> 检测当前 hermes-agent 状态
  -> 已初始化 + 模型已配置
  -> 跳过 hermes-agent 安装
  -> 跳过大模型配置
  -> 直接进入应用主页
```

## 2.2 验收判定条件

运行时状态必须以 `RuntimeState` 为唯一来源：

```ts
runtimeReady === true
modelConfigured === true
```

满足以上条件时：

```ts
nextScreen = "main"
skipAgentInstall = true
skipModelSetup = true
```

禁止出现以下行为：

* 自动进入 Welcome
* 自动进入 Install
* 自动进入 Setup
* 自动调用 `start-install`
* 自动调用 `start-install-with-source`
* 自动调用 `enterprise:install`
* 自动覆盖 `.env`
* 自动重写模型配置
* 自动重装 hermes-agent
* 自动清空 profile / memory / sessions / skills

---

# 3. 当前源码状态判断

## 3.1 主窗口现状

当前 `src/main/index.ts` 内直接创建 `BrowserWindow`，设置尺寸、frameless、titleBarStyle、preload、webviewTag、窗口事件、loadURL/loadFile。

问题：

* `createWindow()` 承担窗口创建、事件绑定、preload、URL 加载、window IPC 绑定。
* 后续 Portal View、Web Operator View、Updater、SSH Tunnel、Profile Runtime 初始化都在 `index.ts` 聚合。
* 壳层能力无法独立测试。
* 多 View、Overlay、Modal、Dropdown 后续扩展会继续堆积到主进程入口。

处理方式：

```text
src/main/index.ts
  只保留 app lifecycle bootstrap

新增：
src/main/shell/main-window-controller.ts
src/main/shell/app-bootstrap.ts
src/main/shell/window-state-store.ts
src/main/shell/shell-menu.ts
```

---

## 3.2 Runtime State 现状

当前 `runtime-state-resolver.ts` 已经根据安装目录、agent 源码、venv、hermes cli、模型配置、updateMode 判断状态。

现有 RuntimeState 字段：

```ts
export interface RuntimeState {
  installDir: string;
  agentPath: string;
  agentSourceExists: boolean;
  venvExists: boolean;
  hermesCliExists: boolean;
  modelConfigured: boolean;
  runtimeReady: boolean;
  needsAgentInstall: boolean;
  needsModelSetup: boolean;
  updateMode: boolean;
}
```

字段已覆盖硬验收主路径，但需要增加面向启动路由的派生字段，避免 Renderer 自行拼接判断。

新增：

```ts
export type StartupScreen =
  | "main"
  | "welcome"
  | "install"
  | "setup"
  | "remote-error";

export interface StartupDecision {
  runtime: RuntimeState;
  connectionMode: "local" | "remote" | "ssh";
  nextScreen: StartupScreen;
  skipAgentInstall: boolean;
  skipModelSetup: boolean;
  shouldVerifyInBackground: boolean;
  reason:
    | "runtime-ready-model-configured"
    | "runtime-ready-model-missing"
    | "runtime-missing"
    | "remote-ready"
    | "ssh-ready"
    | "remote-unreachable"
    | "ssh-unreachable";
}
```

---

## 3.3 模型配置现状

当前 `isModelConfigured()` 支持：

* 本地 provider：`custom / lmstudio / ollama / vllm / llamacpp`
* Hermes auth credential
* `.env` 中 `OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY`

该逻辑可继续作为 `modelConfigured` 的唯一判定来源。

需要补充：

```ts
modelConfiguredSource:
  | "local-provider"
  | "hermes-auth"
  | "env-api-key"
  | "none"
```

用于日志与诊断，不改变判断逻辑。

---

## 3.4 Renderer 启动现状

当前 `App.tsx` 启动时执行：

```ts
const runtime = await window.hermesAPI.getRuntimeState();

if (runtime.runtimeReady && runtime.modelConfigured) {
  next = "main";
} else if (runtime.runtimeReady && !runtime.modelConfigured) {
  next = "setup";
} else {
  next = "welcome";
}
```

该逻辑已经符合核心验收项。

需要调整为：

```ts
const decision = await window.smcShell.resolveStartupDecision();

setScreen(decision.nextScreen);
```

目的：

* 启动路由逻辑放到 Main Process。
* Renderer 只消费结果。
* 安装/更新行为由统一状态机保护。
* 后续 Mattermost 壳层改造不会破坏安装跳过逻辑。

---

# 4. 壳层架构设计

## 4.1 总体架构

```text
Electron Main Process
├─ AppBootstrap
│  ├─ migrations
│  ├─ ensureShims
│  ├─ setupIPC
│  ├─ setupUpdater
│  └─ create MainWindow
│
├─ MainWindowController
│  ├─ BrowserWindow
│  ├─ window state
│  ├─ frameless controls
│  ├─ menu
│  └─ lifecycle events
│
├─ ShellViewManager
│  ├─ RendererRootView
│  ├─ AiOsWebContentsView
│  ├─ WebOperatorView
│  ├─ ProfilePageView
│  └─ active view bounds
│
├─ OverlayManager
│  ├─ ModalViewManager
│  ├─ DropdownViewManager
│  └─ DrawerViewManager
│
├─ PreloadBoundary
│  ├─ shellAPI
│  ├─ hermesAPI
│  ├─ profileRuntimeAPI
│  ├─ aiosRuntimeAPI
│  ├─ internalViewAPI
│  └─ externalViewAPI
│
├─ RuntimeStateGate
│  ├─ resolveRuntimeState
│  ├─ resolveStartupDecision
│  ├─ backgroundVerify
│  └─ update-safe skip rules
│
└─ Hermes Domain
   ├─ installer
   ├─ enterprise installer
   ├─ profile runtime
   ├─ chat
   ├─ memory
   ├─ tools
   ├─ skills
   └─ gateway
```

---

## 4.2 Mattermost 模式映射

| Mattermost Desktop 模式                        | SMC AI Copilot 落地                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `MainWindow` 独立管理窗口                          | `MainWindowController` 管理 BrowserWindow                                              |
| `MattermostWebContentsView` 管理单个 server view | `ManagedWebContentsView` 管理 Portal / Web Operator / Profile Page                      |
| `ViewManager` 管理多 View                       | `ShellViewManager` 管理 active workspace                                               |
| Modal 用独立 WebContentsView + queue            | `ModalViewManager` 管理安装确认、模型配置、诊断、危险操作确认                                             |
| Dropdown 用独立 WebContentsView + bounds        | `DropdownViewManager` 管理 profile switcher、downloads、gateway 状态                       |
| externalAPI / internalAPI preload 分离         | `preload/shell-api.ts`、`preload/internal-view-api.ts`、`preload/external-view-api.ts` |
| 跨平台 package scripts                          | 保留 electron-vite，补充 Windows / macOS / Linux 分平台构建脚本                                  |

---

# 5. 启动与安装状态机

## 5.1 启动状态机

```text
APP_READY
  -> RUN_MIGRATIONS
  -> ENSURE_SHIMS
  -> CREATE_MAIN_WINDOW
  -> RENDER_SPLASH
  -> RESOLVE_STARTUP_DECISION
      ├─ remote ok                  -> MAIN
      ├─ ssh ok                     -> MAIN
      ├─ runtimeReady && modelConfigured
      │                              -> MAIN
      ├─ runtimeReady && !modelConfigured
      │                              -> SETUP
      └─ !runtimeReady               -> WELCOME / INSTALL
```

## 5.2 更新场景状态机

```text
APP_UPDATED
  -> NSIS customInstall
      -> preserve runtime/
      -> preserve desktop-runtime.json
      -> preserve ~/.hermes
      -> preserve profile db
      -> preserve model config
      -> write PreviousVersion
  -> APP_READY
  -> resolveStartupDecision()
      -> runtimeReady === true
      -> modelConfigured === true
      -> nextScreen = "main"
      -> skipAgentInstall = true
      -> skipModelSetup = true
```

## 5.3 安装跳过规则

```ts
function resolveStartupDecision(runtime: RuntimeState): StartupDecision {
  if (runtime.runtimeReady && runtime.modelConfigured) {
    return {
      runtime,
      connectionMode: "local",
      nextScreen: "main",
      skipAgentInstall: true,
      skipModelSetup: true,
      shouldVerifyInBackground: true,
      reason: "runtime-ready-model-configured",
    };
  }

  if (runtime.runtimeReady && !runtime.modelConfigured) {
    return {
      runtime,
      connectionMode: "local",
      nextScreen: "setup",
      skipAgentInstall: true,
      skipModelSetup: false,
      shouldVerifyInBackground: true,
      reason: "runtime-ready-model-missing",
    };
  }

  return {
    runtime,
    connectionMode: "local",
    nextScreen: "welcome",
    skipAgentInstall: false,
    skipModelSetup: false,
    shouldVerifyInBackground: false,
    reason: "runtime-missing",
  };
}
```

---

# 6. 功能 PRD

## 6.1 F-001：MainWindowController

### 目标

从 `src/main/index.ts` 拆出主窗口管理。

### 新增文件

```text
src/main/shell/main-window-controller.ts
src/main/shell/window-state-store.ts
src/main/shell/shell-menu.ts
src/main/shell/types.ts
```

### 职责

* 创建 BrowserWindow
* 设置 frameless / titlebar
* 设置 preload
* 绑定 crash / console / did-fail-load
* 设置 window open handler
* 绑定 window IPC
* 暴露 `getWindow()`
* 暴露 `sendToRenderer()`
* 管理窗口 resize / focus / blur / closed 事件

### 不允许

* 不处理 hermes-agent 安装
* 不处理模型配置
* 不处理 profile runtime 启停
* 不处理 chat

---

## 6.2 F-002：ShellViewManager

### 目标

把 Portal、Web Operator、Profile 页面统一纳入多 View 管理。

### 新增文件

```text
src/main/shell/views/managed-webcontents-view.ts
src/main/shell/views/shell-view-manager.ts
src/main/shell/views/view-registry.ts
src/main/shell/views/view-events.ts
```

### View 类型

```ts
export type ShellViewKind =
  | "renderer-root"
  | "aios-home"
  | "web-operator"
  | "profile-page"
  | "external-browser";
```

### ManagedWebContentsView 能力

* create
* load
* reload
* show
* hide
* setBounds
* destroy
* getHistoryStatus
* focus
* capturePageState
* load retry
* load status

### 与现有代码关系

当前 `BrowserViewManager` 只维护单个 `WebContentsView`，支持 create/navigate/destroy/updateBounds。
当前 `AiOsWebContentsController` 也单独维护 Portal 的 `WebContentsView`。

升级后：

```text
BrowserViewManager      -> 保留，内部改为调用 ShellViewManager
AiOsWebContentsController -> 保留 IPC 契约，内部改为调用 ShellViewManager
```

不直接删除旧类，避免破坏现有 preload / renderer 调用。

---

## 6.3 F-003：Preload API 分层

### 目标

把当前 `src/preload/index.ts` 的超大 `hermesAPI` 拆分为多个边界清晰的 preload API。

当前 preload 已暴露：

* `electron`
* `hermesAPI`
* `aiosBrowser`
* `profileRuntime`
* `profileEntry`
* `aiosRuntime`

并通过 `contextBridge.exposeInMainWorld` 注入。

### 新结构

```text
src/preload/index.ts
src/preload/shell-api.ts
src/preload/hermes-api.ts
src/preload/runtime-api.ts
src/preload/profile-runtime-api.ts
src/preload/aios-api.ts
src/preload/browser-api.ts
src/preload/internal-view-api.ts
src/preload/external-view-api.ts
src/preload/types.ts
```

### API 边界

```ts
window.smcShell
  .resolveStartupDecision()
  .getAppVersion()
  .windowControls
  .openExternal()

window.hermesAPI
  .sendMessage()
  .getModelConfig()
  .setModelConfig()
  .listProfiles()
  .readMemory()
  .getToolsets()
  .startGateway()
  .stopGateway()

window.profileRuntime
  .listProfiles()
  .startProfile()
  .stopProfile()
  .restartProfile()

window.aiosRuntime
  .loadHome()
  .setBounds()
  .reload()

window.aiosBrowser
  .open()
  .click()
  .type()
  .screenshot()
```

### 兼容要求

`window.hermesAPI.getRuntimeState()` 必须保留。

新增：

```ts
window.smcShell.resolveStartupDecision()
```

Renderer 启动逻辑迁移到新 API，但旧 API 不删除。

---

## 6.4 F-004：Runtime State Gate

### 目标

建立硬验收项的唯一状态入口。

### 新增文件

```text
src/main/startup/startup-decision.ts
src/main/startup/startup-ipc.ts
src/shared/startup/startup-contract.ts
src/renderer/src/hooks/useStartupGate.ts
```

### IPC

```ts
ipcMain.handle("startup:resolve-decision", async () => {
  return resolveStartupDecision();
});
```

### Preload

```ts
resolveStartupDecision: (): Promise<StartupDecision> =>
  ipcRenderer.invoke("startup:resolve-decision")
```

### Renderer

`App.tsx` 中替换：

```ts
const runtime = await window.hermesAPI.getRuntimeState();
...
```

为：

```ts
const decision = await window.smcShell.resolveStartupDecision();
setScreen(decision.nextScreen);
```

### 保留后台验证

当前 `verifyInstall()` 是 lazy background verification，不阻塞主 UI。

规则：

```text
nextScreen = main:
  执行 background verify
  verify 失败但 updateMode=true:
    不回退 Welcome
    只在 Runtime Setup / StatusBar 显示 warning

verify 失败且 updateMode=false:
  可回退 Welcome
```

---

## 6.5 F-005：Modal / Dropdown View Manager

### 目标

把安装确认、模型配置、profile switcher、gateway status、download/update 状态从 React 层叠 UI 升级为可隔离的 shell overlay。

### 新增文件

```text
src/main/shell/overlays/modal-view.ts
src/main/shell/overlays/modal-manager.ts
src/main/shell/overlays/dropdown-view.ts
src/main/shell/overlays/dropdown-manager.ts
src/shared/shell/overlay-contract.ts
src/preload/internal-view-api.ts
```

### Modal 类型

```ts
export type ShellModalKey =
  | "confirm-runtime-reinstall"
  | "confirm-model-reset"
  | "runtime-doctor-report"
  | "gateway-error"
  | "profile-delete"
  | "update-ready";
```

### Dropdown 类型

```ts
export type ShellDropdownKey =
  | "profile-switcher"
  | "gateway-status"
  | "downloads"
  | "notifications";
```

### 行为要求

* Modal 队列化
* Priority Modal 可打断普通 Modal
* Window resize 后重新计算 bounds
* Modal 使用透明背景
* Modal 使用 internal preload
* 外部 Web View 点击时自动关闭 dropdown
* App quit 时销毁所有 overlay view

---

## 6.6 F-006：Profile Runtime 保留与壳层整合

当前 `profile-runtime-manager.ts` 已支持：

* SQLite runtime db 初始化
* adapter registry
* profile start / stop / restart
* auto restart
* gateway supervision
* port 占用检测
* runtime 状态聚合
* onBeforeQuit 清理

其状态转换表已经存在。

本次不重写 Profile Runtime，只做壳层整合：

```text
DesktopSidebar profile list
  -> profileRuntime.listProfiles()
  -> active profile change
  -> ShellViewManager 激活对应 workspace
  -> Chat / Memory / Tools 继续使用 activeProfile
```

新增 UI 行为：

```text
Default Profile
  -> 进入 ai-os-home

Writer / Finance / Research Profile
  -> 可进入独立 profile-page
  -> 可直接进入 chat with profile
```

---

## 6.7 F-007：打包规则升级

当前 `package.json` 使用 electron-vite，支持 `build:win / build:mac / build:linux / build:rpm`。
Mattermost Desktop package scripts 对 Windows / macOS / Linux 进行了更细颗粒度拆分，如 Windows zip/msi、mac universal、linux deb/rpm/flatpak/appimage。

本项目保留 electron-vite，不迁移到 webpack。

新增 scripts：

```json
{
  "build:prod": "npm run typecheck && electron-vite build",
  "package:win": "npm run build:prod && electron-builder --win nsis --x64 --publish=never",
  "package:win:dir": "npm run build:prod && electron-builder --win dir --x64 --publish=never",
  "package:mac": "npm run build:prod && electron-builder --mac --publish=never",
  "package:linux": "npm run build:prod && electron-builder --linux AppImage deb rpm --publish=never",
  "verify:package": "npm run typecheck && npm run test"
}
```

Windows 安装器继续使用：

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
  include: build/installer.nsh
```

不得改成 one-click 安装。

---

# 7. Cursor 实施规范

## 7.1 禁止改动

```text
禁止删除：
src/main/installer.ts
src/main/enterprise/**
src/main/profile-runtime-*
src/main/hermes.ts
src/main/config.ts
src/main/memory.ts
src/main/tools.ts
src/main/skills.ts
src/main/profiles.ts

禁止破坏：
window.hermesAPI.*
window.profileRuntime.*
window.aiosBrowser.*
window.aiosRuntime.*
```

## 7.2 允许改动

```text
允许新增：
src/main/shell/**
src/main/startup/**
src/shared/startup/**
src/shared/shell/**
src/preload/shell-api.ts
src/preload/internal-view-api.ts
src/preload/external-view-api.ts
src/renderer/src/hooks/useStartupGate.ts

允许重构：
src/main/index.ts
src/preload/index.ts
src/renderer/src/App.tsx
src/main/browser/browser-view-manager.ts
src/main/aios/aios-webcontents-controller.ts
src/renderer/src/screens/Layout/**
src/renderer/src/components/layout/**
```

## 7.3 第一阶段任务

```text
Task 1：抽离 MainWindowController
Task 2：新增 startup decision contract
Task 3：新增 startup:resolve-decision IPC
Task 4：新增 preload/shell-api.ts
Task 5：App.tsx 改用 useStartupGate
Task 6：增加启动跳过安装单测
Task 7：增加更新场景回归测试
```

## 7.4 第二阶段任务

```text
Task 8：新增 ManagedWebContentsView
Task 9：新增 ShellViewManager
Task 10：迁移 AiOsWebContentsController 到 ShellViewManager
Task 11：迁移 BrowserViewManager 到 ShellViewManager
Task 12：增加 view bounds / resize 测试
```

## 7.5 第三阶段任务

```text
Task 13：新增 ModalViewManager
Task 14：新增 DropdownViewManager
Task 15：接入 profile-switcher dropdown
Task 16：接入 gateway-status dropdown
Task 17：接入 update-ready modal
```

## 7.6 第四阶段任务

```text
Task 18：整理 package scripts
Task 19：整理 electron-builder.yml 注释与校验
Task 20：补充 Windows 10 update regression checklist
Task 21：补充 docs/smc-shell-architecture.md
```

---

# 8. 文件级实施清单

## 8.1 新增文件

```text
src/shared/startup/startup-contract.ts
src/main/startup/startup-decision.ts
src/main/startup/startup-ipc.ts
src/preload/shell-api.ts
src/renderer/src/hooks/useStartupGate.ts

src/main/shell/main-window-controller.ts
src/main/shell/app-bootstrap.ts
src/main/shell/shell-menu.ts
src/main/shell/window-state-store.ts
src/main/shell/types.ts

src/main/shell/views/managed-webcontents-view.ts
src/main/shell/views/shell-view-manager.ts
src/main/shell/views/view-registry.ts
src/main/shell/views/view-events.ts

src/main/shell/overlays/modal-view.ts
src/main/shell/overlays/modal-manager.ts
src/main/shell/overlays/dropdown-view.ts
src/main/shell/overlays/dropdown-manager.ts

src/shared/shell/view-contract.ts
src/shared/shell/overlay-contract.ts
src/preload/internal-view-api.ts
src/preload/external-view-api.ts
```

## 8.2 修改文件

```text
src/main/index.ts
src/preload/index.ts
src/renderer/src/App.tsx
src/main/browser/browser-view-manager.ts
src/main/aios/aios-webcontents-controller.ts
src/main/update/update-lifecycle.ts
package.json
electron-builder.yml
```

---

# 9. StartupDecision 代码骨架

```ts
// src/shared/startup/startup-contract.ts

import type { RuntimeState } from "../enterprise/runtime-state-contract";

export type StartupScreen =
  | "main"
  | "welcome"
  | "installing"
  | "setup";

export type StartupDecisionReason =
  | "runtime-ready-model-configured"
  | "runtime-ready-model-missing"
  | "runtime-missing"
  | "remote-ready"
  | "ssh-ready"
  | "remote-unreachable"
  | "ssh-unreachable";

export interface StartupDecision {
  runtime: RuntimeState | null;
  connectionMode: "local" | "remote" | "ssh";
  nextScreen: StartupScreen;
  skipAgentInstall: boolean;
  skipModelSetup: boolean;
  shouldVerifyInBackground: boolean;
  reason: StartupDecisionReason;
  error?: string;
}
```

```ts
// src/main/startup/startup-decision.ts

import { getConnectionConfig } from "../config";
import { resolveRuntimeState } from "../enterprise/runtime-state-resolver";
import { testRemoteConnection } from "../hermes";
import { isSshTunnelHealthy, startSshTunnel } from "../ssh-tunnel";
import type { StartupDecision } from "../../shared/startup/startup-contract";

export async function resolveStartupDecision(): Promise<StartupDecision> {
  const conn = getConnectionConfig();

  if (conn.mode === "remote" && conn.remoteUrl) {
    const ok = await testRemoteConnection(conn.remoteUrl, conn.apiKey);
    return {
      runtime: null,
      connectionMode: "remote",
      nextScreen: ok ? "main" : "welcome",
      skipAgentInstall: true,
      skipModelSetup: true,
      shouldVerifyInBackground: false,
      reason: ok ? "remote-ready" : "remote-unreachable",
      error: ok ? undefined : `Cannot reach remote Hermes at ${conn.remoteUrl}`,
    };
  }

  if (conn.mode === "ssh" && conn.ssh) {
    try {
      await startSshTunnel(conn.ssh);
      const healthy = await isSshTunnelHealthy();
      return {
        runtime: null,
        connectionMode: "ssh",
        nextScreen: healthy ? "main" : "welcome",
        skipAgentInstall: true,
        skipModelSetup: true,
        shouldVerifyInBackground: false,
        reason: healthy ? "ssh-ready" : "ssh-unreachable",
      };
    } catch (err) {
      return {
        runtime: null,
        connectionMode: "ssh",
        nextScreen: "welcome",
        skipAgentInstall: true,
        skipModelSetup: true,
        shouldVerifyInBackground: false,
        reason: "ssh-unreachable",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const runtime = resolveRuntimeState();

  if (runtime.runtimeReady && runtime.modelConfigured) {
    return {
      runtime,
      connectionMode: "local",
      nextScreen: "main",
      skipAgentInstall: true,
      skipModelSetup: true,
      shouldVerifyInBackground: true,
      reason: "runtime-ready-model-configured",
    };
  }

  if (runtime.runtimeReady && !runtime.modelConfigured) {
    return {
      runtime,
      connectionMode: "local",
      nextScreen: "setup",
      skipAgentInstall: true,
      skipModelSetup: false,
      shouldVerifyInBackground: true,
      reason: "runtime-ready-model-missing",
    };
  }

  return {
    runtime,
    connectionMode: "local",
    nextScreen: "welcome",
    skipAgentInstall: false,
    skipModelSetup: false,
    shouldVerifyInBackground: false,
    reason: "runtime-missing",
  };
}
```

---

# 10. 回归测试清单

## 10.1 Windows 10 首次安装

| 场景                | 预期         |
| ----------------- | ---------- |
| 无 runtime         | 进入 Welcome |
| 用户选择 git / zip 安装 | 执行安装       |
| 安装完成但未配置模型        | 进入 Setup   |
| 配置模型完成            | 进入 Main    |
| 关闭重启              | 直接 Main    |

---

## 10.2 Windows 10 更新安装

| 场景                       | 预期                     |
| ------------------------ | ---------------------- |
| 已有 runtime + 已配置模型       | 更新完成后直接 Main           |
| 已有 runtime + 未配置模型       | 进入 Setup，不重装 Agent     |
| 已有 runtime + CLI shim 缺失 | ensureShims 修复后进入 Main |
| 已有 runtime + venv 缺失     | 进入 Welcome / Repair    |
| 已有 remote mode           | 跳过本地安装检测               |
| 已有 ssh mode              | 启动 SSH tunnel 后进入 Main |

---

## 10.3 强制验收用例

### Case A：更新后跳过安装

```text
Given:
  runtimeReady=true
  modelConfigured=true
  updateMode=true

When:
  app 启动

Then:
  nextScreen=main
  skipAgentInstall=true
  skipModelSetup=true
  不调用 start-install
  不调用 start-install-with-source
  不调用 enterprise:install
```

### Case B：已安装但未配置模型

```text
Given:
  runtimeReady=true
  modelConfigured=false

Then:
  nextScreen=setup
  skipAgentInstall=true
  skipModelSetup=false
```

### Case C：未安装

```text
Given:
  runtimeReady=false

Then:
  nextScreen=welcome
  skipAgentInstall=false
```

---

# 11. 风险控制

## 11.1 壳层升级风险

风险点：

```text
MainWindow / View / Overlay 重构影响 Renderer 初始化
```

控制：

```text
第一阶段只抽离 Startup Gate 和 MainWindowController
第二阶段再迁移 ViewManager
第三阶段再迁移 Modal / Dropdown
每阶段保留旧 API
```

---

## 11.2 安装器风险

风险点：

```text
NSIS 更新时误删 runtime/hermes-agent 或 ~/.hermes
```

控制：

```text
deleteAppDataOnUninstall=false
customInstall 只创建目录，不清空目录
desktop-runtime.json preserve on upgrade
install-marker preserve
runtimeReady=true 时 Electron 安装管线直接 return
```

当前企业安装管线已经在 `runtimeReady && !force` 时跳过安装，并只刷新 shim 与 runtime config。

---

## 11.3 模型配置风险

风险点：

```text
更新后误判 modelConfigured=false
```

控制：

```text
isModelConfigured 继续读取 getModelConfig / Hermes auth / .env
新增 modelConfiguredSource 只用于诊断
不改变现有 provider 判定
```

---

# 12. 最终交付定义

## 12.1 代码交付

```text
主窗口壳层：
src/main/shell/**

启动状态机：
src/main/startup/**
src/shared/startup/**
src/renderer/src/hooks/useStartupGate.ts

View 管理：
src/main/shell/views/**

Overlay 管理：
src/main/shell/overlays/**

Preload 分层：
src/preload/shell-api.ts
src/preload/internal-view-api.ts
src/preload/external-view-api.ts
```

## 12.2 文档交付

```text
docs/smc-shell-architecture.md
docs/startup-runtime-state-gate.md
docs/windows-update-regression.md
docs/mattermost-desktop-shell-mapping.md
```

## 12.3 验收命令

```bash
npm run typecheck
npm run test
npm run build
npm run build:win
```

## 12.4 Windows 验收结果

必须形成一份记录：

```text
dist/smc-copilot-${version}-setup.exe

测试环境：
Windows 10 Home
首次安装：通过
更新安装：通过
已有 hermes-agent 跳过安装：通过
已有模型配置跳过 Setup：通过
进入应用主页：通过
```

---

# 13. 最终边界

本次 PRD 的关键边界：

```text
Mattermost Desktop 模式只用于壳层结构升级
不迁移 Mattermost 的业务逻辑
不替换 Hermes Agent 安装管线
不替换 Profile Runtime
不替换 Chat / Memory / Tools / Gateway
不改变现有 NSIS 安装目录选择能力
不改变 Windows 10+ 一键部署目标
```

核心判定固化为：

```ts
runtime.runtimeReady && runtime.modelConfigured
  => main
  => skipAgentInstall
  => skipModelSetup
```

这条规则必须进入单测、集成测试、Windows 更新验收。
