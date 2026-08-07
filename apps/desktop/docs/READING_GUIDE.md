# Reading Guide

## 项目阅读顺序

### 第一阶段：理解全局架构

1. `docs/INDEX.md` — 项目定位、目录结构、技术栈
2. `docs/ARCHITECTURE.md` — 三层进程模型、Gateway 对接、屏幕路由
3. `AGENTS.md` — Agent 编码速查指南
4. `package.json` — 依赖和脚本
5. `electron.vite.config.ts` — 构建配置
6. `electron-builder.yml` — 打包配置

### 第二阶段：理解进程通信

7. `src/preload/index.ts` — 预加载桥接层（hermesAPI 90+ 方法定义）
8. `src/preload/index.d.ts` — TypeScript 类型声明
9. `src/preload/shell-api.ts` — **smcShell**（`resolveStartupDecision` 启动门控）
10. `src/preload/auth-api.ts` — **desktopAuth**（V3.3 登录，无 token 暴露）
11. `src/preload/user-config-api.ts` — **desktopUserConfig**（bootstrap apply / diff）
12. `src/preload/aios-api.ts` — Portal Preload API
13. `src/preload/profile-runtime-api.ts` — Profile Runtime Preload API
13b. `src/preload/profile-role-api.ts` — **V4.0** Profile Role（专家预设 / 角色库 / recompile）
14. `src/preload/browser-api.ts` — Web Operator Preload API
15. `src/main/index.ts` — 主进程入口（IPC 注册中心，含 `setupStartupIPC()`）
16. `docs/API_CONTRACTS.md` — IPC 通信契约

### 第三阶段：理解核心模块

17. `src/main/hermes.ts` — Gateway 管理 + 消息路由（最核心）
18. `src/main/sse-parser.ts` — SSE 流解析
19. `src/main/config.ts` — 配置管理
20. `src/main/installer.ts` — 安装管理
20b. `src/main/runtime/runtime-paths.ts` — **V5.3** hermes/serve/portal 路径契约
20c. `electron-builder.yml` + `build/installer.nsh` + `install-location-resolver.ts` — **V5.4** 安装目录 / 注册表 / `desktop.exe`

### 第四阶段：理解数据模块

21. `src/main/sessions.ts` — 会话查询
22. `src/main/session-cache.ts` — 会话缓存
23. `src/main/models.ts` + `src/main/default-models.ts` — 模型管理
24. `src/main/profiles.ts` — 配置档案
25. `src/main/memory.ts` — 记忆管理
26. `src/main/soul.ts` — 人格管理
27. `src/main/tools.ts` — 工具集
28. `src/main/skills.ts` — 技能管理
29. `src/main/cronjobs.ts` — 定时任务

### 第五阶段：理解运行时模块

30. `src/main/profile-runtime-manager.ts` — Profile Runtime 生命周期
31. `src/main/profile-runtime-db.ts` — SQLite 控制面
32. `src/main/profile-runtime-ipc.ts` — Profile Runtime IPC
32b. `src/main/profile-role-ipc.ts` — **V4.0** Profile Role IPC
32c. `src/main/profile-roles/` — role-library-sync、role-compiler、role-preset-installer
32d. `src/main/hermes-local-adapter.ts` — 多 Profile Gateway 启动（`HERMES_HOME` 隔离）
33. `src/main/gateway-supervisor.ts` — 健康监管 + 自动重启
34. `src/main/gateway-log-collector.ts` — 日志收集
35. `src/main/runtime-reconciler.ts` — 状态恢复
36. `src/main/aios/aios-ipc.ts` — Portal IPC
37. `src/main/aios/aios-runtime-supervisor.ts` — Portal 运行时监管
38. `src/main/aios/aios-reconciler.ts` — Portal 状态恢复

### 第六阶段：理解 UI 层

Renderer 文档已拆分到 `docs/renderer/`，按需阅读：

39. [`docs/renderer/INDEX.md`](renderer/INDEX.md) — Renderer 总入口
40. [`docs/renderer/APP_STARTUP.md`](renderer/APP_STARTUP.md) — 启动门控与屏幕路由
41. [`docs/renderer/MAIN_LAYOUT.md`](renderer/MAIN_LAYOUT.md) — Layout / MainPage / MainTopBar / WorkspaceOutlet
42. [`docs/renderer/WORKSPACE_ROUTING.md`](renderer/WORKSPACE_ROUTING.md) — workspace-registry / WorkspaceRenderer 分发
43. [`docs/renderer/STATE_AND_CONTEXT.md`](renderer/STATE_AND_CONTEXT.md) — 全局 UI 状态与 Context
44. [`docs/renderer/PRELOAD_API_USAGE.md`](renderer/PRELOAD_API_USAGE.md) — Preload API 使用边界
45. [`docs/renderer/screens/INDEX.md`](renderer/screens/INDEX.md) — Screens 索引（按 active/retained 分类）
46. [`docs/renderer/components/INDEX.md`](renderer/components/INDEX.md) — 组件族索引

需深入特定 Screen 时，阅读 `docs/renderer/screens/<Screen>.md`；WebOperator 额外有 `docs/renderer/screens/web-operator/` 子文档。

### 第七阶段：理解共享模块

47. `src/shared/i18n/index.ts` — i18n 核心
48. `src/shared/i18n/config.ts` — i18n 配置
49. `src/shared/i18n/locales/zh-CN/` — 中文翻译（参考）
50. `src/shared/auth/auth-contract.ts` — Auth / LoginInput（`email`）
51. `src/shared/user-config/user-config-contract.ts` — Bootstrap schema v2
52. `src/shared/profile-runtime/profile-runtime-contract.ts` — Profile Runtime 契约
53. `src/shared/enterprise/enterprise-contract.ts` — Enterprise 契约
54. `src/shared/aios/aios-contract.ts` — Portal 契约

---

## 功能阅读顺序

### 阅读聊天功能

1. `src/renderer/src/screens/Chat/Chat.tsx` — UI 入口
2. `src/preload/index.ts` — sendMessage / onChatChunk / onChatDone
3. `src/main/hermes.ts` — sendMessage() → sendMessageViaApi() / sendMessageViaCli()
4. `src/main/sse-parser.ts` — SSE 流解析
5. `src/main/index.ts` — send-message / abort-chat IPC handler

### 阅读安装流程

1. `src/renderer/src/screens/Welcome/Welcome.tsx` — 欢迎页
2. `src/renderer/src/screens/Install/Install.tsx` — 安装页（含 AgentSourceSelect）
3. `src/renderer/src/components/install-wizard/install-wizard.tsx` — 安装向导
4. `src/renderer/src/components/install/PipMirrorFields.tsx` — PyPI 镜像选择
5. `src/renderer/src/screens/Setup/Setup.tsx` — 设置向导
6. `src/main/installer.ts` — 安装逻辑
7. `src/main/enterprise/enterprise-installer.ts` — 企业安装流水线
8. `src/main/enterprise/agent-deps-installer.ts` — 依赖安装
9. `src/main/enterprise/pip-mirror-config.ts` — PyPI 镜像配置
10. `src/main/index.ts` — check-install / start-install / start-install-with-source IPC handler

### 阅读 Gateway 管理

1. `src/renderer/src/screens/Gateway/Gateway.tsx` — 平台配置 UI
2. `src/main/hermes.ts` — startGateway / stopGateway / restartGateway
3. `src/main/config.ts` — 平台开关
4. `src/main/index.ts` — gateway 相关 IPC handler

### 阅读会话管理

1. `src/renderer/src/screens/Sessions/Sessions.tsx` — 会话列表 UI
2. `src/main/sessions.ts` — SQLite 查询
3. `src/main/session-cache.ts` — 缓存逻辑
4. `src/main/index.ts` — sessions 相关 IPC handler

### 阅读 Profile Runtime

1. `src/renderer/src/screens/ProfileRuntime/ProfileRuntimeScreen.tsx` — UI
2. `src/renderer/src/screens/ProfileRuntime/LogViewer.tsx` — 日志查看
3. `src/preload/profile-runtime-api.ts` — Preload API
4. `src/main/profile-runtime-ipc.ts` — IPC handler
5. `src/main/profile-runtime-manager.ts` — 生命周期
6. `src/main/profile-runtime-db.ts` — 控制面 DB
7. `src/main/gateway-supervisor.ts` — 健康监管
8. `src/main/gateway-log-collector.ts` — 日志收集
9. `src/main/runtime-reconciler.ts` — 状态恢复

### 阅读 Portal Auth + Bootstrap + 启动门控（V3.3 / V3.3.1）

1. `src/renderer/src/hooks/useStartupGate.ts` — splash → login → … 路由
2. `src/renderer/src/modules/auth/LoginScreen.tsx` — Endpoint + 邮箱登录 + bootstrap
3. `src/preload/shell-api.ts` — `window.smcShell.resolveStartupDecision`
4. `src/preload/auth-api.ts` / `user-config-api.ts` — Renderer API
5. `src/main/startup/startup-ipc.ts` + `startup-decision.ts` — 启动门控（auth + bootstrap 前置）
6. `src/main/auth/auth-client.ts` — Portal HTTP Auth（`email` / `refresh_token`）
7. `src/main/auth/token-store.ts` — Token Vault（keytar / safeStorage / 内存）
8. `src/main/user-config/user-config-client.ts` — 默认本地 bootstrap（`local-v1`）
9. `src/main/user-config/user-config-bootstrap.ts` + `user-config-applier.ts` — apply 链
10. `src/main/shell/portal-view-coordinator.ts` — portal prepare + deactivate

### 阅读 Portal Runtime

1. `src/renderer/src/screens/Portal/Index.tsx` — Portal 嵌入页（`PortalScreen`）
2. `src/renderer/src/components/shell/WebContentsHost.tsx` — 嵌入视口 bounds / show
3. `src/renderer/src/screens/Workspaces/index.tsx` + `panels/WorkspacesShell.tsx` — Workspaces 三栏工作台
4. `src/preload/aios-api.ts` — Preload API
5. `src/main/aios/aios-ipc.ts` — IPC handler
6. `src/main/aios/aios-runtime-supervisor.ts` — 运行时监管
7. `src/main/aios/aios-reconciler.ts` — 状态恢复

### 阅读 Web Operator

1. `src/renderer/src/screens/WebOperator/WebOperatorScreen.tsx` — UI
2. `src/preload/browser-api.ts` — Preload API
3. `src/main/browser/browser-ipc.ts` — IPC handler
4. `src/main/browser/browser-controller.ts` — 核心控制器
5. `src/main/browser/browser-view-manager.ts` — BrowserView 管理
6. `src/main/browser/browser-security.ts` — 安全策略
7. `src/main/browser/browser-audit.ts` — 审计日志

### 阅读 Hermes Default Chat（V5.6.4）

1. `src/renderer/src/screens/Hermes/pages/Chat/hooks/useHermesDefaultWebChat.ts` — Chat 页面编排（session、model、stream）
2. `src/renderer/src/screens/Hermes/pages/Chat/hooks/useHermesDefaultChatModels.ts` — session 级模型绑定读取/写入
3. `src/preload/hermes-default-chat-api.ts` — `window.hermesDefaultChat` 预加载 API
4. `src/main/hermes-default-chat/hermes-default-chat-ipc.ts` — `hermes-chat:*` IPC（含 `draft_default` 绑定迁移）
5. `src/main/hermes-default-chat/hermes-session-model-store.ts` — `session-models.json` 持久化
6. `src/main/hermes-default-chat/hermes-default-chat-request.ts` — request-level `provider`/`base_url` 请求体构建
7. `src/main/hermes-config/hermes-config-yaml.ts` — Models Set Default / `custom_providers` 同步
8. `docs/API_CONTRACTS.md` — Hermes Default Chat (v5.6.4) 通道契约

### 阅读 SSH 远程连接

1. `src/main/ssh-remote.ts` — SSH 远程连接
2. `src/main/ssh-tunnel.ts` — SSH 隧道
3. `src/main/config.ts` — SSH 配置（set-ssh-config / test-ssh-connection / start-ssh-tunnel / stop-ssh-tunnel）

### 阅读 DB 迁移

1. `src/main/migrations/migration-runner.ts` — 迁移运行器
2. `src/main/migrations/legacy-hermes-migration.ts` — 旧版迁移
3. `src/main/migrations/001-install-location.ts` — 迁移001
4. `src/main/migrations/002-runtime-layout.ts` — 迁移002
5. `src/main/migrations/003-web-operator-config.ts` — 迁移003

### 阅读窗口控制（V1.4.1）

1. `src/renderer/src/components/layout/WindowControls.tsx` — UI
2. `src/main/window/window-ipc.ts` — IPC handler
3. `src/preload/index.ts` — windowControls API

### 阅读 Portal Runtime / monorepo 路径（V5.3.4）

1. `src/renderer/src/screens/SettingsDrawer/server/PortalRuntimeSection.tsx` — Settings UI
2. `src/preload/aios-api.ts` — `window.aiosRuntime.getPortalInfo()` 等
3. `src/main/aios/aios-ipc.ts` — `aios:get-portal-info` 等 handler
4. `src/main/aios/aios-paths.ts` — `getAiOsPortalInfo()`、`isAiOsInstalled()`
5. `src/main/runtime/portal-root-resolver.ts` — `resolveEffectivePortalMonorepoRoot()`
6. `src/main/runtime/runtime-paths.ts` — `buildCopilotRuntimeEnv()`、`resolvePortalSourceRoot()`
7. `build/scripts/deploy-copilot-serve.ps1` — 运维 clone + env 写入
8. `docs/API_CONTRACTS.md` — AIOS Portal Runtime 表

---

## 输出要求

阅读代码后，按以下格式输出：

1. **模块职责** — 一句话说明
2. **入口文件** — 精确路径
3. **页面结构** — 页面 → 组件 → Hook 链
4. **组件依赖** — import 关系
5. **IPC 调用** — 使用的 `hermesAPI` / `smcShell` / `desktopAuth` / `desktopUserConfig` / `profileRuntime` / `aiosRuntime` / `aiosBrowser` 方法
6. **数据流** — 用户操作 → IPC → 主进程 → 返回
7. **类型定义** — 关键 TypeScript 类型
8. **可复用模式** — 现有可复用的组件/函数
9. **修改风险** — 改动可能影响的范围
10. **建议修改文件** — 精确路径列表
11. **禁止修改文件** — 精确路径列表

所有结论必须附带文件路径。不允许出现"可能""大概""看起来"。不确定就标记为 UNKNOWN，并说明需要读哪个文件。
