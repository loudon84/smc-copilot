# SMC Copilot — Project Index

## 项目定位

**SMC-Copilot**（npm 包名 `smc-ai-copilot`；Windows 主程序 **`desktop.exe`**）是基于 **Electron + React + TypeScript + TailwindCSS** 的 **Portal Desktop** 桌面壳：部署与运维 [Hermes Agent](https://github.com/loudon84/ai-os-hermes)，并提供多 Profile 运行时、跨 Profile 编排与 WebContentsView（Web Operator）内嵌能力。遵循 Electron 三层进程隔离模型（Main / Preload / Renderer）。

本仓库代码由 **hermes-desktop**（单运行时安装/配置/聊天）演进而来；Hermes Agent 仍为执行引擎，SMC Copilot 负责桌面壳、进程生命周期、SQLite 控制面与统一 UI。

**v9.0.0（进行中）Serve-First Runtime：** Desktop Main 通过 window.copilotRuntime / src/main/copilot-runtime-client/ 连接常驻 copilot-serve :8765；Device Token 仅 Main（keytar）。Phase 0/1：OpenAPI、pairing、capability、production 禁 spawn。**Phase 2：** Instance/Gateway/Config/MCP/Diagnostics 经 Serve；默认禁止 Hermes CLI 与 YAML 控制面写入（COPILOT_ALLOW_LEGACY_HERMES_DIRECT 可回退）。**Phase 3：** `window.chatRuntime` → Serve `/api/v1/chat-runs*`（hand-authored 契约；legacy-direct 可回退）。**v1.5.4 Hotfix：** Hermes Execution Model Catalog（`/api/model/options` + config.yaml SOT）；Desktop boot 只连接不 spawn；`serviceReady`/`chatReady` 拆分；Model Picker 走 Runtime。Session/Files 见 Phase 4+（prd_work/v9.0_serve-runtime-migration.md）。

**v1.4.1 Hotfix：** 删除 Desktop MCP Proxy `:18781`；Connection Ready 仅看 `readiness.service`；Settings → View Logs 读 Runtime `runtime-service.log`；dev:runtime 自动登记本机 Hermes（external-dev）。

| 项 | 值 |
|---|---|
| **产品名称** | SMC-Copilot |
| **包名 / 主程序** | `smc-ai-copilot`（npm）/ **`desktop.exe`**（Windows 安装产物） |
| **版本** | 0.3.6（… + **v1.7 Hermes Kanban** + **v1.6.1 Chat UI Layout 复刻** + **v9.0.0 Serve-First Runtime Phase 0/1/2/3** + **v8.2.0 Persistent Chat Workspace + Session Catalog** + **v8.1.1 Durable Runtime Closure** + **v8.1.0 Durable Chat Runtime** + **v8.0.5 Chat Interaction Loop** + **v8.0.4 Chat Turn Lifecycle** + **v8.0.3 Chat Workspace Layout** + **v8.0.2 Chat Full Integration** + **V7.2.1 Expert MCP v6.1 Hotfix** + **V7.2 Remote Experts Pivot** + **V7.1.1 Hermes Experts E2E + Desktop Sync** + **V7.1 Hermes Experts Workspace** + **V7.0 Hermes MCP Client Integration** + …） |
| **appId** | `com.smc.smc-ai-copilot` |
| **仓库** | https://github.com/loudon84/ai-os-desktop |
| **用户文档** | [README.md](../README.md) · [README.zh-CN.md](../README.zh-CN.md) |

**V1.0（hermes-desktop）**：单 Gateway 桌面 — 引导安装、提供商配置、流式聊天、会话/技能/记忆、消息 Gateway、Claw3D Office。

V1.1 在 V1.0 基础上新增 **Multi Profile Gateway Runtime**，将单 Gateway 桌面应用升级为 Portal Desktop 多智能体运行时控制台。

V1.2 在 V1.1 基础上增强 **Runtime 稳定性**：Gateway 崩溃检测/自动重启、端口冲突检测、启动超时、App 重启后状态恢复、日志收集与查看。

V1.2.1 在 V1.2 基础上新增 **Enterprise Install 企业级一键部署**：Deployment Config + Schema 校验、Runtime Bundle Manager（在线/离线/内嵌 + SHA-256）、Preflight Checker（20 项 P0/P1/P2 预检）、Hermes Agent Installer（Git/Bundle 双模式 + Venv）、Profile Runtime Bootstrapper（7 Profile + 端口递增）、Enterprise Installer 20 步流水线 + 13 IPC handler、Runtime Doctor（9 项诊断）、Install Lock/Marker/Log、安全策略（仅 127.0.0.1/无 UAC/HKLM/PATH/Token 不落盘）。

V1.4 在 V1.2.1 基础上完成 **Desktop Shell 布局重构** 与 **Windows NSIS 安装器加固**：
- **NSIS**：`customInit` VC++ Runtime 阻断检查；`customInstall` 写入 `runtime/installer-precheck.json` + `nsis-install.log`；Git/Python/uv/8642 端口仅提示不阻断
- **Desktop Shell（V1.4，主链路已由 V2.0 替代）**：`Layout.tsx` 编排层 + `DesktopShell` / `PageHeader`；现主界面见 **V2.0**
- **WindowControls**：`window.hermesAPI.windowControls` → IPC `window:*`（minimize/maximize/close/is-maximized）；Win/Linux 自定义标题栏按钮
- **RuntimeSetup**：读取 NSIS 预检结果卡片（`enterprise:get-installer-precheck`）

**V1.4.1（P0 hotfix + 安装加固）**：
- **窗口控制**：`registerWindowIpc()` 只注册一次；Win/Linux `frame: false` + 自定义 `WindowControls`（`hermesAPI.windowControls`）；非 `main` 屏顶栏 `layout-titlebar`
- **PyPI 镜像**：安装 UI 可选清华/阿里/腾讯/官方/自定义；默认 `https://pypi.tuna.tsinghua.edu.cn/simple`；写入 `desktop-runtime.json` → `pipMirror`
- **依赖安装**：`agent-deps-installer.ts` — `uv pip install --no-config`、优先 `requirements.txt`、wheelhouse 离线、`pip` 回退
- **NSIS**：`installer-precheck.json` 的 `windowsVersion` 从注册表读取（修复 `${__NSD_VERSION}` 打包错误）

**V1.9（Desktop Shell 加固）**：
- **启动顺序修复**：`buildAppMenu() → setupIPC() → createWindow() → 延迟注册 AIOS/Enterprise/ShellView IPC`，解决 mainWindow 为 null 导致 IPC handler 未注册的阻断
- **菜单接管**：删除 index.ts 内联 `buildMenu()`，统一使用 `shell-menu.ts` 的 `buildAppMenu`，含异常回退最小菜单
- **ShellViewManager 集成**：以 SVM 统一管理 aios-home View，URL 由 `getAiOsEnvConfig()` 动态决定，`AiOsWebContentsController` 标记 @deprecated
- **ShellView IPC**：新增 `shell:view:activate`、`shell:view:set-bounds`、`shell:view:hide` 三个 IPC 通道 + 参数校验
- **Preload API**：`window.shellView`（ShellView 全量 IPC）；**V3.3.1** 恢复并正式暴露 `window.smcShell`（`resolveStartupDecision` 启动门控）
- **WebContentsHost**：通用 View 承载组件（activate+ResizeObserver+setBounds+卸载hide+错误降级UI），替换 `AiOsWebAppHost`
- **i18n**：新增 shellView 模块（en/zh-CN/es/pt-BR）

**V2.0（MainPage 主界面壳层，PRD `prd/v2.0_mainpage.md`）**：
- **一级容器**：`MainPage` 替代 `DesktopShell` 成为主界面根布局；`Layout.tsx` 仍负责 hooks 编排（`useDesktopNavigation` / `useProfileEntries` / `useUpdateState`）
- **顶栏**：`MainTopBar`（40px）统一承载 Profile 切换、工作区 Tabs、Gateway 运行态、`WindowControls`（Win/Linux）；全局 `PageHeader` 从主链路移除
- **二级导航**：`DesktopSidebar`（232px）降为功能导航；`WorkspaceOutlet` / `StatusBar` / `ModalLayer` / `DrawerLayer` 保留
- **工作区 Tabs**：`MainViewTabs` — Portal Home / Portal Workspace / Web Operator（可点击切换，首版无 DnD）
- **布局常量**：`src/shared/shell/main-page-constants.ts`（顶栏 40、底栏 24、侧栏 232、默认窗口 1280×800、最小 900×600）
- **主窗口尺寸**：`main-window-controller.ts` 引用上述常量（已有 `window-state` 持久化时仍优先用户历史尺寸）
- **根布局 CSS**：`.app` 使用 `100dvh`；macOS 在 `screen === "main"` 时由 `MainTopBar` 承担拖拽，不再叠加全局 `drag-region`
- **保留未删**：`DesktopShell.tsx`、`PageHeader.tsx`（legacy，便于回滚或页内复用）
- **Phase 2 已完成**：Tabs DnD、ShellBrowserViewAdapter（见 V2.2）

**V2.1（MainPage 第二阶段，PRD `prd/v2.1_mainpage.md`）**：
- **Sidebar 三态**：`expanded`（232px）/ `rail`（56px，仅 icon）/ `hidden`；顶栏按钮循环切换
- **动态工作区 Tabs**：`main-page-tabs.ts` — 静态 Tab + `profileEntries` 中 `specialist-workspace` 条目
- **ShellView IPC 扩展**：`create` / `loadUrl` / `focus` / `destroy` / `getState` / `getAll`；`window.shellView` 全量暴露
- **Web Operator 视口**：`WebOperatorScreen` + `WebContentsHost` layer `web-operator`（常量 `web-operator-constants.ts`）
- **V5.7 WebContentsView**：`browser:*` IPC、Frame/DOM Snapshot、iframe 元素动作；`PageStructurePanel`；PRD `prd/v5.7_webcontentsview.md`
- **V5.7.1 CRM Desktop Bridge**：CRM 页面主动上报 + Desktop 回控命令；Main `src/main/crm-bridge/`、Preload `src/preload/crm-bridge-preload.ts`、契约 `src/shared/crm-bridge/`、SDK `resources/crm-bridge/hermes-crm-bridge-sdk.js`；PRD `prd/v5.7.1_webFrame.md`
- **V5.7.6 CRM Host Bridge**：Hermes `crm.open_form_with_json` handoff 链路 + command ack + `crm.page.ready` 自动交付；PRD `prd/v5.7.6_crm_host_bridge.md`
- **V5.7.10 CRM-Lite Bridge Demo**：`crm-lite-layui-electron-demo`（`:5178`）商品双向验证；事件 `crm.product.context.submit`；命令 `desktop.crm.product.fillForm` / `desktop.crm.product.create`；`CrmEventPanel` 商品卡片 + 测试按钮；PRD `prd/v5.7.10_bridge_demo.md`
- **V5.7.11 Hermes CLI Hide**：Windows 下 SettingsDrawer → Hermes Runtime → Gateway Start 不再弹出 CMD 窗口；Main `spawnHermesGatewayProcess` 优先 `pythonw.exe`（`python -m hermes_cli.main gateway`）；PRD `prd/v5.7.11_hermes-cli-hide.md`
- **工具栏 UI**：`BrowserToolbar` 单行布局（`web-operator.css` 中 `browser-toolbar*`）
- **Lazy create**：`shell-view-ipc` 对 `web-operator` 与 `aios-home` 在 set-bounds 前自动创建

**V2.2（MainPage 第三阶段，PRD `prd/v2.2_mainpage.md`）**：
- **ShellBrowserViewAdapter**：`BrowserController` 经 `BrowserViewPort` 操作 ShellView `web-operator` layer；运行时不再 `new BrowserViewManager`
- **browser.opened**：`aiosBrowser.onOpened` → Layout 自动切 `web-operator` tab
- **external-browser 多标签**：`useExternalBrowserTabs` + MainTopBar「+」URL 弹层；`WorkspaceOutlet` → `WebContentsHost(external-browser:uuid)`
- **Tab 操作**：顶栏 Reload/Close（web-operator / external tab）
- **Tab DnD**：`@dnd-kit`；`profile-workspace:*` 与 `external-browser:*` 可排序；系统三 Tab 固定左侧
- **Legacy**：`browser-view-manager.ts` 保留未删，供回滚

**V2.3（MainPage 第四阶段，PRD `prd/v2.3_mainpage.md`）**：
- **Metadata 事件链**：`shell:view:metadata-changed` / `load-failed` / `crashed` → MainViewTabs 真实 title、loading、error
- **导航 IPC**：reload / stop / back / forward / recover
- **Tab 持久化**：`main-page:read|write` → `~/.hermes/desktop/main-page-state.json`
- **Workspace KeepAlive**：`KeepAliveView.tsx` 保活 React 管理页
- **DEV Debug**：`MainPageDebugPanel`（`import.meta.env.DEV`）

**V3.2（MainPage Workspace Module Host，PRD `prd/v3.2_module_mainpage.md`）**：
- **Workspace registry**：`src/shared/workspace/` + `src/renderer/src/workspace/`；`WorkspaceRenderer` 驱动 `WorkspaceOutlet`
- **顶栏 4 固定 Tab**：`aios-home` / `workspaces` / `web-operator` / `office`；`external-browser:{uuid}` 动态 Tab
- **Sidebar 二级 panel**：`workspace-secondary-nav.ts`；`workspaces` → 自含 Sidebar 8 项导航（chat/sessions/skills/tools/memory/providers/models/settings）
- **统一 Settings Drawer**：`screens/SettingsDrawer/`（Account / Runtime / Profiles / Config sync）；不切换 Workspace
- **MainPage 状态 V2**：`workspaceOrder`、`workspaceSecondaryState`、`migrateMainPageState`
- **Token 注入**：`token-header-injector` → `persist:aios-home` 分区（V3.3 origin 白名单）

**V3.2.1（Hotfix，计划 `.cursor/plans/v3.2.1_hotfix_a6676597.plan.md`）**：
- **Session 三分区**（历史，V3.3 已重命名）：见 V3.3 / V3.3.1 当前值 `persist:aios-home` / `persist:web-operator` / `persist:external-browser-{uuid}`
- **Token 端口**：`token-inject-url.ts` 读取 `getAiOsEnvConfig().frontendPort` / `backendPort`；不注入 Gateway 8642
- **Runtime 入口收敛（PRD #5）**：`RuntimeGuard` 仅「启动 Gateway」+「打开设置」；`onOpenRuntimeSettings` ≡ `openSettingsDrawer("runtime")`；禁止独立 HermesRuntimeSettingsDrawer
- **`WorkspaceRenderer`**：按 `module.kind`（webview / composite / react）分发
- **`MainViewTabs`**：固定 Tab 由 registry `draggable: false` 判定；仅 `external-browser:*` 可拖
- **i18n**：四语言 `navigation.ts` 补齐二级侧栏与 `openSettings` 等 key
- **单测**：`tests/browser-partitions.test.ts`、`tests/token-inject-url.test.ts`

**V3.3（Auth Embed，PRD `prd/v3.3_module_ui.md`）**：
- **启动顺序**：`splash → login → welcome/install/setup → main`（login 在 Hermes 安装之前）
- **Endpoint + Login 合一**：`LoginScreen` 配置 backendUrl / authPrefix / aiosHomeUrl + 邮箱密码
- **Main Token Vault**：keytar → safeStorage → 内存；Renderer 仅见 `DesktopAuthState`（无 token）
- **Session 分区当前值**：`persist:aios-home` / `persist:web-operator` / `persist:external-browser-{uuid}`

**V3.3.1（Auth Hotfix + 本地 Bootstrap）**：
- **启动门控**：local / remote / ssh 统一 auth + bootstrap；`bootstrap-pending` → LoginScreen 自动 bootstrap
- **Portal Auth**：HTTP `{ email, password }` → `POST /api/v1/auth/login`（默认 backend `:8000`）；**不是** Hermes Gateway 登录
- **Bootstrap 默认本地**：不请求 `GET /api/v1/desktop/bootstrap`；合成 `local-v1` 配置并 apply；远程拉取需 `HERMES_USE_REMOTE_USER_CONFIG=true`
- **smcShell + startup IPC**：`window.smcShell.resolveStartupDecision()` ↔ `startup:resolve-decision` ↔ `startup-decision.ts`
- **portal 嵌入时机**：coordinator create/reload 后 deactivate；主界面 `WebContentsHost` setBounds 后才显示
- **Bootstrap apply**：同步 endpoint config + prepare portal URL（`user-config-applier.ts` / `portal-view-coordinator.ts`）

**V5.3（安装与部署目录结构）**：
- **Runtime 命名**：`runtime/hermes`、`runtime/serve`、`runtime/portal`（替代 `hermes-agent` / `copilot-serve` / `ai-os-full`）
- **分层布局**：源码在 `{runtime}/src`，venv 在 `{runtime}/venv`（Hermes/Serve）；Portal 在 `runtime/portal/src`
- **统一契约**：`src/main/runtime/runtime-paths.ts` — `resolveCopilotRuntimePaths()` + `buildCopilotRuntimeEnv()`
- **bin shim**：`hermes.cmd` / `serve.cmd` / `portal.cmd`（`shim-manager.ts`）
- **向后兼容**：`desktop-runtime.json` 读取时自动迁移旧路径字段

**V5.3.4（Portal 部署与路径 hotfix）**：
- **部署脚本**：`build/scripts/deploy-copilot-serve.ps1` — clone Portal monorepo、`pnpm install`、用户级 `COPILOT_PORTAL_ROOT` / `COPILOT_PORTAL_RUNTIME_ROOT`、更新 `desktop-runtime.json`（`-SkipPortal` / `-SkipServe`）
- **路径解析**：`portal-root-resolver.ts` — env → config → filesystem；`buildCopilotRuntimeEnv` 不再覆盖用户 env
- **诊断 UI**：Settings → Server → Portal Runtime — `aios:get-portal-info` + `PortalRuntimeSection.tsx`

**V5.4（安装包名称与路径统一）**：
- **默认安装目录**：`%LOCALAPPDATA%\Programs\SMC-Copilot`（无空格）；主程序 **`desktop.exe`**
- **业务注册表**：写入 `HKCU\Software\SMC\copilot`；运行时兼容读取 legacy `Software\SMC\Copilot` 等
- **NSIS**：`build/installer.nsh` — 升级默认不复用带空格旧目录；`bin\desktop.cmd` + 别名 shim
- **打包**：`electron-builder.yml` — `artifactName: SMC-Copilot-${version}-setup.${ext}`；`appId` / `nsis.guid` 不变

**V5.4.1（Review hotfix）**：
- **Migration schema 5**：`005-v541-install-identity.ts` — 启动时 merge `desktop-runtime.json` 的 `productName` / `executableName` / `appId` / `registryKey`（保留 `agentSource`、`pipMirror` 等用户字段）
- **Legacy 发现**：`readLegacyInstallLocations()` 仅 legacy 注册表键才 unshift，避免把 primary 安装目录标为迁移源
- **AppUserModelId**：`com.smc.smc-ai-copilot` 与 `electron-builder` `appId` 一致

**V5.6.4（Hermes Default Chat Hotfix）**：
- **Models 页**：模型注册 + `custom_providers` 同步 + **Set Default**（`hermes-chat:set-model-config`）；写 root `default` / `model:` / `custom_providers`；变更时 **Gateway restart**
- **Chat 页**：**仅 session 级**选模（`hermes-chat:get/set-session-model`）；绑定 `~/.hermes/desktop/session-models.json`；**禁止** Save as Default
- **发送强制约束**（详见 [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) § V5.6.4、[`docs/API_CONTRACTS.md`](API_CONTRACTS.md) § Hermes Default Chat）：
  - 解析顺序：`payload.model_id` → session 绑定 → 无则 Gateway 默认
  - 发送前 **overlay** `config.yaml` 的 **`model:`** 段（不改 root `default:`）；Gateway 按 `model.default` 推理
  - API Key **必须**从 `profileHome/.env` 经 `readEnv()` 解析（`apiKeyEnv` / `apiKeyLiteral` / `URL_KEY_MAP`）；同步进 `custom_providers` 的裸 `key_env` + 解析后 `api_key`
  - **禁止** Chat 改 root 默认、**禁止**为 session 选模 restart Gateway、**禁止** Windows 下用 `hermes.exe` 作 Chat 回退（用 `python -m hermes_cli.main`）
- **新会话**：`draft_default` → 首条 `chat-done` 后迁移到真实 `sessionId`

**V5.7.5（WebOperator Page → Hermes 任务流）**：
- **入口**：Page Structure `[分析内容]` → 切 Hermes Task 侧栏 → `HermesTaskStartDialog`（Portal 至 `document.body`，全屏遮罩；打开时 `WebContentsHost` `enabled=false` 避免 WebContentsView 盖住对话框）
- **任务会话**：`window.webOperatorTaskSession` → `~/.hermes/desktop/web-operator-task-session.db`（**v6.3.3** 按 `source + requestId` 解析/续聊；`pageUrl` 仅上下文；**非** Hermes `state.db`）
- **Hermes 聊天**：`components/hermes/WebOperatorHermesChatPanel` → **仅** `window.hermesDefaultChat` + `hermesAPI.getSessionMessages`；`resumeSessionId` 占位 `draft_weboperator`；首轮 `uploadAttachmentBuffers`（`web-context/*`）+ `buildTaskFirstMessage` 正文
- **页面上下文**：`WebOperatorPageContext`（`globalThis` 单例 Context 防 HMR 双实例）+ `derive-page-url.ts`（iframe `about:srcdoc` 稳定 URL）
- **侧栏保活**：`WebOperatorPanels` 始终挂载 `hermes-task`，非激活时 CSS 隐藏，避免切 Tab 丢任务状态
- PRD：[`prd/v5.7.5_hermes_integration.md`](../prd/v5.7.5_hermes_integration.md) · 契约：[`docs/API_CONTRACTS.md`](API_CONTRACTS.md) § WebOperator Hermes Panel / Task Session

**V6.3（WebOperator HermesTaskStartDialog 组件化，PRD `prd/v6.3_bridge-to-hermes.md`）**：
- **HermesPanelSkill** / **HermesPanelSession**：Dialog 可复用 skills / sessions 下拉组件；HostBridge `skillName` → `requiredSkillName` 统一校验
- **Dialog 提交**：`onConfirm({ userPrompt, skill, sessionId })`；续写已有 session 或新建
- **HostBridge 元信息**：`HermesPanelTaskInput.hostBridge` + `buildTaskFirstMessage` `[HostBridge]` 块

**V6.3.1（WebOperator 任务 Chat 持久化 hotfix，PRD `prd/v6.3.1_hermes-task-persist-hotfix.md`）**：
- **`currentTask` 提升 Context**：`WebOperatorPageContext`；`sessionStorage` 键 `weboperator-current-task-v1`（**v6.3.3** 升为 `v2`）
- **冷启动**：`webOperatorTaskSession.getLastActive()`（IPC `get-last-active`）优先；无 record 再读 sessionStorage
- **弹 Dialog 不清任务**；同 `source + requestId` 的 `requestHermesAnalysis` / HostBridge 自动分析可跳过（非 `force`）
- **共享**：`src/shared/web-operator/build-task-id.ts`

**V6.3.3（WebOperator Task Session 绑定键调整，PRD `prd/v6.3.3_task-to-session-request.md`）**：
- **业务唯一键**：`source + requestId`（替代 `page_url UNIQUE`）；`taskId` 由 Main `buildTaskId(source, requestId)` 派生
- **SQLite schema v2**：`UNIQUE(source, request_id)`；v1 库自动迁移（`legacy-page-url` + 旧 `page_url`）
- **IPC**：`resolve/upsert` 必填 `source/requestId`；upsert **不传** `taskId`
- **Renderer**：HostBridge `source=web-host-bridge`；手动分析 `source=manual`；`sessionStorage` 键 `weboperator-current-task-v2`

**V6.1（Hermes MCP Skill Gateway，PRD `prd/v6.1_mcp-skill-gateway.md`）** — **v1.4.1 修正**：
- **历史**：曾有 Desktop MCP registry DB + local proxy `:18781`
- **现行**：`window.hermesAPI.mcp` → Main `mcp-compat-ipc` → Runtime `/instances/{id}/mcp/servers*`（`ServeMcpAdapter`）；**禁止** Desktop 监听 `18781`；无 Runtime 对应能力返回 `MCP_MOVED_TO_RUNTIME`
- **UI**：Hermes 左导航 `mcp` 页仍可用；Servers CRUD 走 Runtime

**V6.4（MCP Skill Gateway Desktop Runtime，PRD `prd/v6.4_mcp-skill-gateway-desktop.md`）**：
- **链路**：Hermes Agent → `http://127.0.0.1:48742/mcp` → Desktop Proxy（Bearer 注入）→ nodeskclaw `/api/v1/hermes/mcp`
- **Main**：`src/main/mcp-skill-gateway-runtime/*`；配置 `userData/mcp-skill-gateway-runtime-config.json`；Hermes 写入 `mcp_servers.mcp_skill_gateway`（**禁止** config.yaml 存 token）
- **Preload**：`window.mcpSkillGatewayRuntime`；IPC `mcp-skill-gateway-runtime:*` 见 [`docs/API_CONTRACTS.md`](API_CONTRACTS.md) § MCP Skill Gateway Runtime
- **生命周期**：登录启动 Proxy + 可选自动注册 default；退出登录 / `before-quit` 停止 Proxy
- **UI**：Hermes 左导航 `mcpGateway` → `pages/McpGateway/HermesMcpGatewayPage.tsx`

**V6.4.1 Hotfix（MCP Gateway 联调，PRD `prd/v6.4.1_hotfix_mcp-backend-desktop.md`）**：
- **Descriptor**：`GET /api/v1/system/info` → 动态 `mcp.endpoint`（`mcp-backend-descriptor.ts`）
- **Sync**：`mcp:sync-tools` 对 gateway preset 经 Local Proxy；结构化 `McpToolSyncResult`（`ok` / `status` / `error`）
- **Proxy 增强**：`/admin/config`、`/debug/probe`、auto-initialize、分项 `/health`
- **缓存**：`~/.hermes/desktop/mcp-tools-cache.json`

**V6.5.1 Hotfix（GeneHub Skill Center 连接，PRD `prd/v6.5.1_hotfix_genehub-skill-center-connection.md`）**：
- **P0**：`contextBridge.exposeInMainWorld("genehubRuntime", …)`；`useGeneHubRuntime` 兜底
- **API 对齐**（`team_v3.4.1`）：`desktop_device_id`（device/profile/heartbeat）、`job_type`、后端 `slug/version/permissions[]`/`installed_status` 映射；Bundle `files` 数组/dict 双格式
- **状态**：删除向服务端回传 `claimed`；descriptor/health 可读错误文案

**V6.5（GeneHub Hermes Skill Sync，PRD `prd/v6.5_genehub-hermes-skill-sync.md`）**：
- **角色**：Desktop 为企业 GeneHub 本地安装执行器（拉取授权 Skill / 安装任务 → Bundle 校验写入 → 状态回传）；**无**上传/发布/审核
- **连接**：`GET /api/v1/system/info` → `genehub` descriptor；`genehub:get-connection` / `probe-connection`
- **Main**：`src/main/genehub/*`；本地 installed 元数据 `{hermesHome}/genehub/installed/`；安装日志 `userData/genehub/install-logs.jsonl`
- **Preload**：`window.genehubRuntime`；IPC `genehub:*` 见 [`docs/API_CONTRACTS.md`](API_CONTRACTS.md) § GeneHub Runtime
- **UI**：Local Hermes 左导航 `skillCenter` → `pages/GeneHub/GeneHubSkillCenterPage.tsx`（可安装 / 已安装 / 待安装 / **MCP 注册** / 日志）

**V6.7（MCP Write Tools Approval，PRD `prd/v6.7_mcp-write-tools-approval.md`）**：
- **边界**：审批决策仅在 nodeskclaw；Desktop 不 approve/reject/revoke、不缓存 grant 作为最终鉴权
- **Proxy**：转发注入 `X-NoDeskClaw-Desktop-Device-Id` / `X-NoDeskClaw-Hermes-Profile` / `X-NoDeskClaw-Client` / `X-NoDeskClaw-MCP-Proxy-Version`；`/mcp?profile=` 解析 profile（缺省 `default`）
- **注册**：Hermes `mcp_servers.mcp_skill_gateway.url` 默认 `http://127.0.0.1:<port>/mcp?profile=<name>`；兼容旧无 query URL
- **契约**：`McpGatewayToolPreview` / `McpGatewayInvokeTestResult` / `McpGatewayProxyLogEntry` 扩展 grant 字段；`MCP_OP_TOOL_APPROVAL_REQUIRED` 等错误码
- **UI**：`McpGatewayServerAuthorizationPanel` + Tools Preview 授权 badge；打开 Portal `/mcp/approvals`（或 `system/info.mcp.approvalCenterPath`）

**V6.7.1（GeneHub MCP Registration Hardening，PRD `prd/v6.7.1_genehub-mcp-registration-hardening.md`）**：
- **Preview**：`GET .../bundle-preview`（不 claim、不下载正文）；`validationPreview` 元数据
- **Ignore**：`POST .../ignore` 同步服务端 `cancelled`（不再仅写本地 `ignored-jobs.json`）
- **Profile mapping**：`~/.hermes/desktop/genehub/profile-mapping.json`；`syncInstalledSkills` 使用 serverProfileId
- **Install worker**：`getInstallJob` → claim → validate（签名校验 + `trustedPublicKeys`）→ write（scripts provenance sidecar）→ restart → sync → finally 刷新 cache
- **UI**：mapping 缺失禁用确认；MCP Gateway 卡片 pending/in-progress/lastSync

**V7.2.1（Expert MCP v6.1 Hotfix，PRD `prd_work/v1.2_expert-mcp-compact.md`）**：
- **统一调用**：`callCatalogSkill` — expert / expert_team 同链路；`summonExpert` / `summonTeam` 内部委托
- **MCP Client**：`ExpertMcpClient` class（health / listCatalog / listSkills / callSkill）；`expert-mcp-mappers.ts` 严格 `annotations.kind` 过滤
- **Route guard**：`expert-route-guard.ts` — 12+ 禁止字段抛 `EXPERT_ROUTE_OVERRIDE_FORBIDDEN`（非静默剥离）
- **IPC**：`hermes-experts:list-catalog-skills`、`hermes-experts:call-catalog-skill`；Preload `listCatalogSkills` / `callCatalogSkill`
- **DB**：`expert_runs` schema v3 — `catalog_slug`、`skill_name`、`invocation_id`、`structured_content_json` 等
- **UI**：`ExpertCatalogCallDrawer`（Experts + ExpertTeams）；卡片 `catalogStatus` / `callableSkillCount` 门禁；Runs 展示 `responseText` / `invocationId`
- **契约**：`src/shared/hermes-experts/`；见 [`docs/API_CONTRACTS.md`](API_CONTRACTS.md) § Hermes Experts Workspace

**V7.0（Hermes MCP Client Integration，PRD `prd/v7.0_desktop-hermes-mcp-client-integration.md`）**：
- **REST**：Main `hermes-client-api.ts` — bootstrap / agents / tools / readiness / task events-token / task result / artifact preview&download
- **IPC**：`hermes-client:*`（10 通道）经 `window.mcpSkillGatewayRuntime` 暴露；契约 `src/shared/hermes-client/`
- **捕获**：Proxy / Invoke Test 解析 `structuredContent.task_id` → `userData/hermes-mcp/recent-tasks.json`
- **诊断**：`enableHermesClientBootstrap` 时追加 `clientBootstrap` / `clientAgents` / `clientToolsFilter` / `clientReadiness`
- **UI**：`McpGatewayClientContractCard` / `AgentAliasPanel` / `ReadinessDrawer` / `TaskResultPanel`；Tools Preview 支持 agent/profile/keyword 筛选

**V7.0（Hermes MCP Client Integration，PRD `prd/v7.0_desktop-hermes-mcp-client-integration.md`）**：
- **Client API**：Main `hermes-client-api.ts` → nodeskclaw `/api/v1/hermes/client/*` + task events-token/result/artifact
- **IPC**：`hermes-client:*`（10 channels）；仍经 `window.mcpSkillGatewayRuntime` 暴露
- **契约**：`src/shared/hermes-client/`；feature flags `enableHermesClientBootstrap` 等
- **捕获**：Proxy/Invoke `structuredContent` → `hermes-recent-tasks-store`；诊断追加 client 四步
- **UI**：`McpGatewayClientContractCard` / `AgentAliasPanel` / `ReadinessDrawer` / `TaskResultPanel`；Tools Preview agent 筛选

**V6.6.2（GeneHub MCP Registration，PRD `prd/v6.6.2_genehub-mcp-registration.md`）**：
- **行为**：`mcp_agent_request` job 仅缓存 + UI 待确认，**永不**自动 claim/install；`source` 缺失不得误判为 MCP job
- **缓存**：`~/.hermes/desktop/genehub/pending-jobs.json`；poll 后广播 `genehub:pending-jobs-changed`
- **新增 IPC**：`list-mcp-registration-jobs`、`preview-install-bundle`、`ignore-install-job`、`get-registration-summary`
- **安装**：用户确认后 `install-job`；成功写入 `skills/<name>/genehub.json` provenance
- **UI**：Skill Center `mcpRegistration` 页签 + Drawer；MCP Gateway 页 `McpGatewayGeneHubRegistrationCard`

**V6.6.1（MCP Gateway Operations）**：
- **契约**：`mcp-gateway-operations-contract.ts` — `MCP_OP_*` 错误码、`McpGatewayToolPreview`（category/permission/riskLevel）、结构化日志类型
- **新增 IPC**：`read-structured-logs`；诊断 10 步（含 `toolsList` / `hermesGateway`）；invoke `arguments` + 256KB 截断
- **UI**：五 Panel（Diagnostics / Tools Preview / Invoke Test / Registration / Logs）+ Hermes Gateway 重启横幅

**V6.6（MCP Skill Gateway E2E，PRD `prd/v6.6_mcp-skill-gateway-e2e.md`）**：
- **链路**：Desktop 本地 Proxy → nodeskclaw `/api/v1/hermes/mcp` → `tools/list` / `tools/call` → Hermes `mcp_servers.mcp_skill_gateway`
- **新增 IPC**：`run-diagnostics`、`list-remote-tools`、`invoke-remote-tool`；工具缓存 `~/.hermes/desktop/mcp-skill-gateway-tools.json`（TTL 60s）
- **UI**：`HermesMcpGatewayPage` — 一键诊断、MCP Tools Preview、Invoke Test（v6.6 仅只读工具）

**V5.7.8（MainLayout 全局 Overlay + Native Layer Gate，PRD `prd/v5.7.8_main_layout.md`）**：
- **OverlayProvider** / **DialogLayer** / **DrawerLayer** / **NativeShellLayerGate** — 统一管理阻塞型 Dialog/Drawer；`nativeBlocked` 驱动 `WebContentsHost.effectiveEnabled`
- **legacyDrawerBlocking** — SettingsDrawer / ConfigDiffConfirmDrawer 仍由 Layout 直接挂载，通过 prop 接入 gate
- **首帧 hide** — `NativeShellLayerGateProvider` 在 blocking 时主动 `shellView.hide(activeLayerId)`，避免 Drawer 打开瞬间被 WebContentsView 闪挡
- **WebOperatorTaskStartDialog** — 本版保留 screen 级局部 `enabled && !isTaskStartDialogOpen`（方案 A）

## 核心目录

| 目录 | 职责 | 是否允许修改 |
|---|---|---|
| `src/main/` | 主进程 — IPC 注册、Gateway 管理、配置读写、会话/记忆/技能管理、**Profile Runtime**、**Enterprise Install**、**Portal Runtime**、**Migrations**、**SSH** | 需按任务范围 |
| `src/main/window/` | **V1.4.1** 窗口控制 IPC — minimize/maximize/close/is-maximized | 按需扩展 |
| `src/main/enterprise/` | 企业安装、Doctor、installer-precheck-reader、agent-deps-installer、pip-mirror-config（31 个文件含 doctor/ 和 windows/ 子目录） | 按需扩展 |
| `src/main/runtime/` | **V5.3** 三 runtime 路径契约（hermes/serve/portal）+ **`portal-root-resolver.ts`**（V5.3.4） | 改安装目录 / Portal 根解析时必读 |
| `src/main/aios/` | **Portal Runtime** — 配置/Doctor/健康/IPC/路径/端口/进程/协调/监管/WebContents 控制（10 个文件） | 按需扩展 |
| `src/main/migrations/` | **DB 迁移** — 迁移运行器 + 3 个迁移文件 | 按需扩展 |
| `src/main/update/` | **更新生命周期** — update-lifecycle.ts | 按需扩展 |
| `src/main/browser/` | Web Operator — **ShellBrowserViewAdapter** + BrowserController/SecurityGuard/AuditLogger/ToolBridge（`browser-view-manager.ts` legacy） | 按需扩展 |
| `src/main/web-operator-task-session-*.ts` | **V5.7.5** 任务 ↔ Hermes session SQLite（`web-operator-task-session.db`） | 改 Page 分析任务流时必读 |
| `src/preload/` | 预加载桥接层 — **hermesAPI + hermesDefaultChat + webOperatorTaskSession + smcShell + desktopAuth + desktopUserConfig + aiosBrowser + profileRuntime + profileEntry + aiosRuntime + shellView + mainPageState** | 谨慎修改，影响全进程通信 |
| `src/preload/web-operator-task-session-api.ts` | **V5.7.5** `window.webOperatorTaskSession` | 任务会话 resolve/upsert/remove |
| `src/renderer/src/components/hermes/` | **V5.7.4+** WebOperator Hermes 侧栏聊天（`WebOperatorHermesChatPanel`、`useWebOperatorHermesPanelChat`） | 禁止引入 `workspaceChat` |
| `src/renderer/src/screens/WebOperator/` | **V5.7.5** `HermesTaskPanel`、`HermesTaskStartDialog`、`WebOperatorTaskStartDialogHost`、Page Context；**V6.3.4** `host-bridge/HostBridgeCommandContext` | 分析内容入口与任务 UI；Hermes→Host 表单写回 |
| `src/renderer/src/components/hermes/panel/host-form-fill/` | **V6.3.4** `extractHostFormFillArtifact`、`normalizeProductFillFields`、`HostFormFillActionButton` | Hermes assistant 消息解析 + 写回按钮 |
| `src/shared/web-operator/` | **V5.7.5** `web-operator-task-session-contract.ts` | IPC 共享类型 |
| `src/renderer/` | 渲染进程 — **screens/MainPage/**（V2.0 主壳）、**components/layout/**、**components/overlay/**（V5.7.8）、**components/install/PipMirrorFields**、**components/shell/WebContentsHost**、**hooks/**、**types/desktop-shell.ts** | 主要开发区 |
| `src/shared/` | 共享模块 — i18n（4 语言 × 22 模块）+ browser/profile-runtime/enterprise/aios/shell/**workspace** 契约；**`shell/browser-partitions.ts`**、**`workspace/workspace-secondary-nav.ts`** | 谨慎修改 |
| `src/renderer/src/workspace/` | **V3.2** Workspace registry / tabs / `WorkspaceRenderer` 路由 | 顶栏 Tab 与 Outlet |
| `src/main/auth/` | **V3.3** Auth Client、Token Vault、Endpoint Config、Header 注入 | Portal 登录 + Bearer 注入 |
| `src/main/user-config/` | **V3.3** 本地 bootstrap apply / diff / applier | 登录后桌面配置落盘 |
| `src/main/startup/` | **V3.3.1** `startup-decision.ts`、`startup-ipc.ts` | 启动门控（auth + bootstrap 前置） |
| `src/main/hermes-default-chat/` | **V5.6.4** Chat IPC、session 模型绑定、Gateway 请求体、附件 | 改 Local Hermes Chat 必读 |
| `src/main/hermes-config/` | **V5.6.4** `config.yaml` / `custom_providers` / session `model:` overlay | 改模型 YAML 同步必读 |
| `src/main/hermes-model-env.ts` | **V5.6.4** `URL_KEY_MAP`、`resolveApiKeyForSavedModel` | API Key 从 `.env` 解析规则 |
| `resources/skills/` | 内置技能包 — web/web-operator/SKILL.md 等 | 按需扩展 |
| `resources/profiles/` | **V1.1 新增** Profile 配置模板 + SOUL.md | 按需扩展 |
| `tests/` | 测试文件（16 个） | 按需扩展 |
| `build/` | 构建资源（**installer.nsh**、**nsis/Include/RuntimePrecheck.nsh**、**VCRuntimeCheck.nsh**、**winget/**、**`scripts/deploy-copilot-serve.ps1`**） | NSIS / 运维部署脚本 |
| `docs/` | 项目文档 | 按需更新 |

## Renderer 文档

Renderer 详细文档已拆分到 `docs/renderer/` 目录，按 `src/renderer/src` 功能边界组织：

- [`docs/renderer/INDEX.md`](renderer/INDEX.md) — Renderer 总入口（顶层结构、启动链路、Workspace 模块）
- [`docs/renderer/APP_STARTUP.md`](renderer/APP_STARTUP.md) — 启动门控与 App 路由（splash → login → … → main）
- [`docs/renderer/MAIN_LAYOUT.md`](renderer/MAIN_LAYOUT.md) — MainPage / Layout / MainTopBar / WorkspaceOutlet
- [`docs/renderer/WORKSPACE_ROUTING.md`](renderer/WORKSPACE_ROUTING.md) — WorkspaceRenderer / workspace-registry / kind 分发
- [`docs/renderer/STATE_AND_CONTEXT.md`](renderer/STATE_AND_CONTEXT.md) — 全局 UI 状态、Context、KeepAlive、持久化
- [`docs/renderer/PRELOAD_API_USAGE.md`](renderer/PRELOAD_API_USAGE.md) — Renderer 可用 `window.*` API 使用边界
- [`docs/renderer/screens/INDEX.md`](renderer/screens/INDEX.md) — Screens 模块索引（active / retained 标注）
- [`docs/renderer/components/INDEX.md`](renderer/components/INDEX.md) — 组件族索引
- [`docs/renderer/workspace/INDEX.md`](renderer/workspace/INDEX.md) — Workspace 文档索引

**v1.3 Work 专家工作台 Spec Pack**（改 `screens/Hermes` 时 Agent 必读）：

- [`docs/specs/v1.3-workbuddy-product-line/00-overview.md`](specs/v1.3-workbuddy-product-line/00-overview.md) — 入口、分层约束、Phase 状态
- [`03-layout-boundary.md`](specs/v1.3-workbuddy-product-line/03-layout-boundary.md) — MainPage vs Hermes 三栏、页面 UI 模板
- [`13-ai-coding-structure.md`](specs/v1.3-workbuddy-product-line/13-ai-coding-structure.md) — Screen 组件输出质量 Checklist
- PRD：[`prd_work/v1.3_project-layout-prompt.md`](../prd_work/v1.3_project-layout-prompt.md)

## 开发前必须阅读

1. docs/ARCHITECTURE.md — 架构总览与进程模型
2. docs/MODULES.md — 各模块职责与边界
3. docs/API_CONTRACTS.md — IPC 通信契约
4. docs/READING_GUIDE.md — 代码阅读顺序
5. AGENTS.md — Agent 编码速查指南

## 功能域参考（Agent 按需加载）

| 文档 | 何时读 | 触发词 |
|------|--------|--------|
| [`docs/HERMES_SKILLS.md`](HERMES_SKILLS.md) | 改 Skills 页、skill 安装/卸载、扫盘路径、`SKILL.md`、区分 bundled/installed/`resources/skills` | `HermesSkillsPage`、`listInstalledSkills`、`installSkill`、`profileHome/skills` |


## 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Electron 39 + electron-vite 5 |
| UI | React 19 + TailwindCSS 4 + Lucide Icons |
| 语言 | TypeScript 5.9 |
| 数据库 | better-sqlite3（会话历史 + **profile-runtime.db 运行时控制面**） |
| 国际化 | i18next + react-i18next（4 语言 × 22 模块） |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |
| 构建 | electron-vite + electron-builder |
| 测试 | Vitest + Testing Library |
| 更新 | electron-updater（GitHub Releases） |

## 禁止行为

- **Local Hermes Chat** 不得违反 V5.6.4 强制约束（session 选模、`.env` API Key、`model:` overlay）；见 `docs/ARCHITECTURE.md` § V5.6.4、`docs/API_CONTRACTS.md` § Hermes Default Chat
- 不允许凭猜测新增 IPC channel
- 不允许绕过 preload 层直接访问 Node.js API
- 不允许修改主进程的 Gateway 启动/停止逻辑，除非明确理解进程管理
- 不允许在渲染进程直接 import Node.js 模块
- 不允许修改 i18n 的语言代码或回退链
- 不允许修改 electron-builder.yml 的 appId 和 publish 配置
