# Modules

## 主进程模块 (src/main/)

### index.ts — 主进程入口

- **职责**: 创建 BrowserWindow、注册全部 IPC handler、构建应用菜单、设置自动更新、生命周期管理
- **关键行为**: **V1.9**: 启动顺序 `buildAppMenu() → setupIPC() → createWindow() → 延迟注册 AIOS/Enterprise/ShellView IPC`；菜单由 `shell-menu.ts` 的 `buildAppMenu` 统一构建；`AiOsWebContentsController` 停用，由 `ShellViewManager` 接管；before-quit 时清理 gateway、claw3d 进程和 ShellView
- **导出**: 无（入口文件）

### window/window-ipc.ts — V1.4.1 窗口控制 IPC

- **职责**: 主窗口最小化/最大化/关闭/最大化状态查询（通过 `BrowserWindow.getAllWindows()[0]` 定位主窗口）
- **IPC Channels**: `window:minimize`, `window:maximize-or-restore`, `window:close`, `window:is-maximized`
- **核心方法**: `registerWindowIpc()` — 在 `setupIPC()` 中调用一次，带 `registered` 防重复注册

### shell/main-window-controller.ts — V2.0 主窗口生命周期

- **职责**: 创建主 `BrowserWindow`、加载 Renderer、绑定 `window-ipc`、持久化窗口位置/尺寸（`window-state-store`）
- **V2.0 尺寸**: 默认 **1280×800**、最小 **900×600**（`shared/shell/main-page-constants.ts`）；若已有 `window-state` 则优先用户历史宽高

### hermes.ts — Hermes 引擎通信

- **职责**: Gateway 进程管理 + SSE 消息通信
- **核心常量**: `LOCAL_API_URL = "http://127.0.0.1:8642"`
- **导出函数**:
  - `sendMessage()` — 公开消息入口，自动选择 API/CLI 路径
  - `startGateway()` — spawn Python 进程执行 `hermes gateway`
  - `stopGateway()` — kill 进程 + pid 文件清理
  - `restartGateway()` — 停止后重启
  - `isRemoteMode()` — 判断是否远程模式
  - `isGatewayRunning()` — Gateway 运行状态
- **依赖**: config.ts (连接配置), sse-parser.ts (SSE 解析)

### installer.ts — 安装管理

- **职责**: Python 环境安装、健康检测、Doctor/Update、OpenClaw 迁移、备份/导入/导出
- **IPC Handler**: check-install, verify-install, start-install, start-install-with-source, get-hermes-version, run-hermes-doctor, run-hermes-update, check-openclaw, run-claw-migrate, run-hermes-backup, run-hermes-import, run-hermes-dump, list-mcp-servers, discover-memory-providers, read-logs

### config.ts — 配置管理

- **职责**: 读写 desktop.json（连接模式）、.env 文件、config.yaml、模型配置、凭证池、平台开关
- **关键文件**:
  - `~/.hermes/desktop.json` — 连接模式 (local/remote)
  - `~/.hermes/.env` — 环境变量 (API Keys)
  - `~/.hermes/config.yaml` — Hermes Agent 配置
- **IPC Handler**: get-env, set-env, get-config, set-config, get-hermes-home, get-model-config, set-model-config, is-remote-mode, is-remote-only-mode, get-connection-config, set-connection-config, test-remote-connection, set-ssh-config, test-ssh-connection, is-ssh-tunnel-active, start-ssh-tunnel, stop-ssh-tunnel, get-platform-enabled, set-platform-enabled, get-credential-pool, set-credential-pool

### ssh-remote.ts — SSH 远程连接

- **职责**: SSH 远程主机连接管理
- **IPC Handler**: test-ssh-connection, is-ssh-tunnel-active, start-ssh-tunnel, stop-ssh-tunnel

### ssh-tunnel.ts — SSH 隧道

- **职责**: SSH 隧道创建/销毁，端口转发

### sessions.ts — 会话管理

- **职责**: 通过 better-sqlite3 读取 `~/.hermes/state.db`
- **IPC Handler**: list-sessions, get-session-messages, search-sessions
- **依赖**: better-sqlite3

### session-cache.ts — 会话缓存

- **职责**: 本地 JSON 缓存 + SQLite，自动生成会话标题、同步缓存
- **IPC Handler**: list-cached-sessions, sync-session-cache, update-session-title

### models.ts — 模型管理

- **职责**: CRUD 操作 `~/.hermes/models.json`
- **IPC Handler**: list-models, add-model, remove-model, update-model
- **依赖**: default-models.ts (种子数据)

### default-models.ts — 默认模型定义

- **职责**: 预置 Claude Sonnet 4 (OpenRouter+Anthropic)、GPT-4.1 (OpenAI)

### profiles.ts — 配置档案管理

- **职责**: 列出/创建/删除/切换 profile，每个 profile 独立目录 `~/.hermes/profiles/<name>`
- **IPC Handler**: list-profiles, create-profile, delete-profile, set-active-profile

### memory.ts — 记忆管理

- **职责**: 读写 MEMORY.md 和 USER.md，增删改记忆条目
- **字符限制**: MEMORY.md 2200 字符，USER.md 1375 字符
- **IPC Handler**: read-memory, add-memory-entry, update-memory-entry, remove-memory-entry, write-user-profile

### soul.ts — 灵魂/人格管理

- **职责**: 读写 SOUL.md，重置为默认人格提示词
- **IPC Handler**: read-soul, write-soul, reset-soul

### tools.ts — 工具集管理

- **职责**: 列出/启用/禁用工具集 (web/browser/terminal/file/code_execution/vision/image_gen 等)
- **IPC Handler**: get-toolsets, set-toolset-enabled

### skills.ts — 技能管理

- **职责**: 列出已安装/内置技能、获取技能内容、安装/卸载技能，解析 SKILL.md frontmatter
- **IPC Handler**: list-installed-skills, list-bundled-skills, get-skill-content, install-skill, uninstall-skill

### cronjobs.ts — 定时任务管理

- **职责**: CRUD cron jobs，暂停/恢复/触发，支持多种投递渠道
- **IPC Handler**: list-cron-jobs, create-cron-job, remove-cron-job, pause-cron-job, resume-cron-job, trigger-cron-job

### claw3d.ts — Claw3D/Office 管理

- **职责**: 克隆 hermes-office 仓库、安装依赖、启动/停止 dev server 和 adapter
- **IPC Handler**: claw3d-status, claw3d-setup, claw3d-start-all, claw3d-stop-all, claw3d-get-logs, claw3d-start-dev, claw3d-stop-dev, claw3d-start-adapter, claw3d-stop-adapter, claw3d-get-port, claw3d-set-port, claw3d-get-ws-url, claw3d-set-ws-url

### sse-parser.ts — SSE 流解析器

- **职责**: 解析 Server-Sent Events 数据，处理自定义事件 (hermes.tool.progress)、提取 usage 统计
- **导出函数**: parseSseBlock(), processCustomEvent(), parseSseStream()

### locale.ts — 语言设置

- **职责**: 代理 shared/i18n 的 getLocale/setLocale

### askpass.ts — sudo 密码桥接

- **职责**: 将 sudo 密码提示桥接到 GUI 对话框，通过 Unix socket + Python3 中转

### utils.ts — 工具函数

- **导出**: stripAnsi(), profileHome(), escapeRegex(), safeWriteFile()

---

## V1.1 Profile Runtime 模块

### profile-runtime-db.ts — SQLite 运行时控制面

- **职责**: 管理 `~/.hermes/desktop/profile-runtime.db`，9 张核心表 + 索引 + 迁移 + CRUD
- **数据库**: profiles, runtime_instances, profile_entries, profile_capabilities, profile_skills, skill_sync_events, shared_contexts, delegation_events, audit_events
- **关键方法**: initProfileRuntimeDb(), transaction(), insertProfile(), getProfile(), listProfiles(), insertRuntimeInstance(), updateRuntimeStatus(), listAuditEvents(), insertAuditEvent()
- **V1.2 变更**: runtime_instances 新增 5 字段 (restart_count/last_exit_code/last_crash_at/auto_restart/health_fail_count)；updateRuntimeStatus 扩展支持 RuntimeStatusUpdateExtra (10 字段)

### config-importer.ts — 配置导入器

- **职责**: 解析 profile-runtime.yaml，校验名称/端口/adapter，创建目录结构，写入 DB
- **核心方法**: importConfig(yamlContent), importConfigFromFile(filePath), profileHome(name)
- **校验链**: 名称 kebab-case → 端口唯一 → adapter 可用 → 名称唯一
- **依赖**: js-yaml, profile-runtime-db

### runtime-adapter.ts — RuntimeAdapter 接口

- **职责**: 定义可插拔运行时适配器接口
- **方法**: validate, deploy, start, stop, restart, health, sendMessage

### capability-plugin.ts — CapabilityPlugin 接口

- **职责**: 定义能力插件接口
- **方法**: name, initialize?(db)

### plugin-registry.ts — 插件注册表

- **职责**: 管理 RuntimeAdapter 和 CapabilityPlugin 的注册与查询
- **方法**: registerAdapter, registerCapability, getAdapter, getCapability

### hermes-local-adapter.ts — HermesLocalRuntimeAdapter

- **职责**: 实现 hermes-local 运行时适配器，spawn/kill Gateway 进程，健康检查，消息发送
- **关键行为**: 端口参数化（从硬编码 8642 改为按 profile 配置），profileHome 参数化
- **V1.2 变更**: stdio 改为 pipe 模式捕获 stdout/stderr；集成 gateway-log-collector；exit 事件记录 last_exit_code/last_crash_at/restart_count
- **依赖**: hermes.ts（复用 spawn/kill 逻辑）, profile-runtime-db, gateway-log-collector

### gateway-supervisor.ts — Gateway 健康监管

- **职责**: 每 15 秒轮询运行中 Profile 的 /health，连续 3 次失败标记 failed
- **V1.2 变更**: 支持 autoRestart/maxRestartCount 选项；失败时递增 health_fail_count；超过 maxRestartCount(默认 3) 停止自动重启；启动 15 秒后自动重启；setAutoRestartHandler 注入回调；resetRestartCount/getSupervisionStatus
- **方法**: startSupervision(profileId, options?), stopSupervision(profileId), startAllSupervision(), stopAllSupervision(), setAutoRestartHandler(), resetRestartCount(), getSupervisionStatus()

### gateway-log-collector.ts — V1.2 新增: Gateway 日志收集

- **职责**: 收集 Gateway 子进程 stdout/stderr，提供历史查询与实时推送
- **关键方法**: startCollecting(profileId, proc), stopCollecting(profileId), getHistory(profileId, options?), onNewLog(profileId, callback), clearHistory(profileId)
- **缓冲上限**: MAX_BUFFER_SIZE = 2000 条
- **订阅保护**: SUBSCRIBER_HIGH_WATERMARK = 100

### runtime-reconciler.ts — V1.2 新增: App 重启状态恢复

- **职责**: App 重启后扫描所有 running 实例，检查进程存活/端口占用，校正不一致状态
- **关键方法**: reconcile(), isPortOccupied(port)
- **集成点**: initializeProfileRuntime() 启动时自动调用 reconcile()

### profile-runtime-manager.ts — Profile Runtime 核心管理器

- **职责**: 编排 Profile 生命周期（start/stop/restart/startAll/stopAll），状态流转保护，审计写入
- **状态流转**: not_deployed→starting→running, running→stopping→stopped, *→failed
- **V1.2 变更**: 启动前端口冲突检测 (isPortOccupied)；30 秒启动超时检测 (STARTUP_TIMEOUT_MS)；集成 GatewayLogCollector/Supervisor autoRestart/Reconciler
- **关键方法**: startProfile(), stopProfile(), restartProfile(), startAllProfiles(), stopAllProfiles(), listProfileSummaries(), onBeforeQuit(), isPortOccupied()
- **初始化**: initializeProfileRuntime() — 初始化 DB + 注册 hermes-local adapter + 注册 autoRestart handler + 调用 reconcile()

### profile-runtime-ipc.ts — Profile Runtime IPC 注册

- **职责**: 注册 19+2 个 profile-runtime:* + 5 个 profile-entry:* IPC handler
- **V1.2 新增**: profile-runtime:getGatewayLogs, profile-runtime:setAutoRestart
- **IPC Channels**: profile-runtime:importConfig, importConfigContent, listProfiles, getProfile, startProfile, stopProfile, restartProfile, startAll, stopAll, status, delegate, listProfileSkills, copySkill, listProfileSessions, shareSessionContext, listSharedContexts, deleteSharedContext, listAuditEvents, getGatewayLogs, setAutoRestart; profile-entry:list, get, open, get-layout, update-layout

### delegation-capability.ts — 委托调用能力

- **职责**: default Profile 向 specialist Profile 发起委托调用，支持 context refs 注入
- **核心方法**: invoke(request) — 检查目标运行状态 → 解析 context refs → POST /v1/chat/completions → 写 delegation_events + audit_events
- **超时**: 默认 30000ms

### skill-sync-capability.ts — 技能同步能力

- **职责**: Profile 间技能复制，支持冲突策略（跳过/覆盖+备份）
- **核心方法**: copySkill(request) — 校验源技能 → 冲突检测 → 备份/覆盖/复制 → SHA-256 校验和 → 写 skill_sync_events + audit_events

### session-share-capability.ts — 会话上下文共享能力

- **职责**: 将指定 session 上下文导出为 context.md，支持 snapshot/summary/full 三种模式
- **核心方法**: shareSessionContext(request) — 读取源 session → 生成 context.md → 写入目标 shared-context/ 目录 → 写 shared_contexts + audit_events
- **禁止**: 不直接复制或合并 state.db

### web-operator-profile-bridge.ts — Web Operator Profile-Aware 桥接

- **职责**: Web Operator 操作注入 profileId 溯源，权限校验，审计写入，敏感操作确认
- **核心方法**: checkProfileAllowed(), injectSourceProfile(), executeAction(), confirmAction()
- **敏感操作**: browser.type, browser.click

---

## Portal Runtime 模块 (src/main/aios/)

### aios-config.ts — Portal 配置

- **职责**: Portal 运行时配置管理（安装路径、端口、API 端点等）

### aios-doctor.ts — Portal Doctor

- **职责**: Portal 运行时健康诊断

### aios-health.ts — Portal 健康检查

- **职责**: Portal 服务健康状态检查

### aios-ipc.ts — Portal IPC 注册

- **职责**: 注册 Portal 相关 IPC handler（14 个通道）
- **IPC Channels**: aios:get-runtime-status, aios:install, aios:start, aios:stop, aios:restart, aios:view:load-home, aios:view:reload, aios:view:set-bounds, aios:get-logs, aios:doctor, aios:reconcile, aios:check-ports, aios:get-runtime-snapshot, aios:view:destroy, aios:view:hide

### aios-paths.ts — Portal 路径

- **职责**: Portal 安装与数据路径解析

### aios-port-check.ts — Portal 端口检查

- **职责**: Portal 端口可用性检测与冲突解决

### aios-process.ts — Portal 进程管理

- **职责**: Portal 子进程 spawn/kill 管理

### aios-reconciler.ts — Portal 协调器

- **职责**: App 重启后 Portal 运行时状态恢复

### aios-runtime-supervisor.ts — Portal 运行时监管

- **职责**: Portal 运行时健康监管与自动重启

### aios-webcontents-controller.ts — Portal WebContents 控制

- **职责**: Portal BrowserView/WebContentsView 生命周期管理
- **V1.9 状态**: **@deprecated** — 由 `ShellViewManager` 统一接管 View 管理，此控制器停用

### shell/shell-view-ipc.ts — V1.9 + V2.1 ShellView IPC 注册

- **职责**: 注册 ShellView IPC handler，桥接 Renderer 与 ShellViewManager
- **IPC Channels**: `shell:view:create|activate|set-bounds|load-url|focus|hide|destroy|get-state|get-all`
- **Lazy create**: `aios-home`、`web-operator` 在 activate/set-bounds 时自动 ensure
- **核心方法**: `registerShellViewIpc(svm)` — 在 createWindow 后调用；`destroyShellViews()` — before-quit 清理

---

## DB 迁移模块 (src/main/migrations/)

### migration-runner.ts — 迁移运行器

- **职责**: 数据库迁移版本管理与有序执行

### legacy-hermes-migration.ts — 旧版迁移

- **职责**: 从旧版 Hermes 安装迁移数据

### 001-install-location.ts — 迁移001

- **职责**: 安装位置路径迁移

### 002-runtime-layout.ts — 迁移002

- **职责**: 运行时目录结构迁移

### 003-web-operator-config.ts — 迁移003

- **职责**: Web Operator 配置格式迁移

---

## 更新模块 (src/main/update/)

### update-lifecycle.ts — 更新生命周期

- **职责**: 应用自动更新流程管理（检查/下载/安装/重启）
- **IPC Handler**: check-for-updates, download-update, install-update, get-app-version

---

## V1.2.1 Enterprise Install 模块 (src/main/enterprise/)

### deployment-config.ts — Deployment 配置加载

- **职责**: 读取 deployment.json → 校验 → 返回 DeploymentConfig；提供默认配置（7 Profile + 8642-8648 端口 + windows-native）
- **核心方法**: loadDeploymentConfig(configPath?), getDefaultDeploymentConfig(), getHermesBasePath(), getInstallBasePath(), getDeploymentConfigPaths()
- **依赖**: deployment-schema.ts

### deployment-schema.ts — Deployment Schema 校验

- **职责**: 31 字段手动校验 + 条件联动校验（bundleUrl/sourceType 联动、gitUrl/branch/sourceType 联动、gateway.host 安全约束 127.0.0.1）
- **核心方法**: validateDeploymentConfig(config): SchemaValidationResult

### checksum-verifier.ts — SHA-256 校验

- **职责**: 流式 SHA-256 计算（crypto.createHash），支持大文件；可选 manifest 签名校验
- **核心方法**: verifySha256(filePath, expectedHash), verifyManifestSignature(manifestPath)

### runtime-bundle-manager.ts — Runtime Bundle 管理

- **职责**: 三种 Bundle 来源（artifact 在线下载/离线路径/内嵌）+ 断点续传 + SHA-256 校验 + 解压 + 复用检测
- **核心方法**: resolveRuntimeBundle(config, onProgress, existingBundleHash?)
- **错误码**: E_BUNDLE_DOWNLOAD_FAILED, E_BUNDLE_SHA256_MISMATCH, E_BUNDLE_DISK_FULL, E_BUNDLE_EXTRACT_FAILED

### preflight-checker.ts — 环境预检

- **职责**: 20 项检查（P0 阻断 10 项 + P1 警告 5 项 + P2 信息 5 项），禁止修改系统状态
- **核心方法**: runPreflight(config): PreflightReport
- **P0 检查**: WIN-VERSION, DISK-SPACE, INSTALL-DIR-WRITABLE, HERMES-HOME-WRITABLE, PORT-AVAILABLE, PYTHON-AVAILABLE, VENV-CREATABLE, BUNDLE-SHA256, PROFILE-DB-CREATABLE, DEPLOY-SCHEMA

### hermes-agent-source-installer.ts — Agent 源码安装

- **职责**: Git clone / Bundle 两种模式安装 hermes-agent，PAT 通过环境变量注入不落盘
- **核心方法**: installHermesAgentSource(config, runtimePath, onProgress)
- **错误码**: E_GIT_CLONE_FAILED, E_GIT_AUTH_FAILED, E_GIT_CHECKOUT_FAILED, E_AGENT_VERSION_MISMATCH, E_AGENT_SOURCE_NOT_FOUND

### agent-deps-installer.ts — V1.4.1 依赖安装

- **职责**: uv/pip 依赖安装、PyPI 镜像解析、wheelhouse 离线安装
- **核心方法**: installHermesAgentDependencies()
- **策略**: uv --no-config 优先 requirements.txt；有 wheels 则离线；失败回退 pip

### pip-mirror-config.ts — V1.4.1 PyPI 镜像配置

- **职责**: 解析 PyPI 镜像配置优先级（UI → desktop-runtime.json → deployment.json → 环境变量 → 清华默认）
- **核心方法**: resolvePipMirrorConfig()

### desktop-runtime-config.ts — 桌面运行时配置

- **职责**: 读写 desktop-runtime.json（安装目录、agent 源、pipMirror 等）

### command-security-guard.ts — 命令安全守卫

- **职责**: 安装命令安全检查与过滤

### enterprise-config-provisioner.ts — ~/.hermes 初始化

- **职责**: 创建 ~/.hermes 目录结构 + config.yaml + .env + SOUL.md（已有配置保留）
- **核心方法**: provisionDefaultHermesHome(config, agentPath, venvPath)

### profile-runtime-bootstrapper.ts — Profile 引导

- **职责**: 7 个 Profile 独立引导（HERMES_HOME 创建 + config.yaml + 端口递增分配 + SOUL.md）
- **核心方法**: bootstrapProfiles(config, agentPath, venvPath, onProgress)
- **错误码**: E_PORT_EXHAUSTED

### profile-policy-installer.ts — Skills 安装与 Policy

- **职责**: Bundle Skills 复制到 Profile 目录 + Policy 只读标记
- **核心方法**: installBundledSkills(config, profileName, profileHome, runtimePath), applyPolicyReadOnly(profileId)

### python-venv-installer.ts — Python Venv 管理

- **职责**: venv 创建/复用 + 依赖安装（优先 uv，fallback pip；优先 wheelhouse，fallback pipIndexUrl）
- **核心方法**: createOrReuseSharedVenv(config), installPythonDependencies(config, venvPath, agentPath, onProgress)
- **错误码**: E_VENV_CREATE_FAILED, E_VENV_REUSED_BROKEN, E_PIP_INSTALL_FAILED, E_PIP_INDEX_UNREACHABLE

### runtime-bootstrapper.ts — Python 运行时检测

- **职责**: 检测系统 Python 版本，判断使用 bundled 或系统 Python
- **核心方法**: detectAndBootstrapRuntime(config)

### runtime-manifest.ts — 运行时清单

- **职责**: 运行时组件清单管理

### runtime-state-resolver.ts — 运行时状态解析

- **职责**: 解析当前运行时安装与运行状态

### runtime-jobs.ts — 运行时任务

- **职责**: 长时间运行时任务管理

### shim-manager.ts — Shim 管理

- **职责**: 命令行 Shim 脚本创建与管理

### model-config-status.ts — 模型配置状态

- **职责**: 模型配置就绪状态检查

### install-cancel.ts — 安装取消

- **职责**: 安装流程取消信号管理

### install-lock.ts — 安装锁

- **职责**: 独占文件锁（fs.open wx），stale lock 5 分钟自动清理
- **核心方法**: acquireInstallLock(timeoutMs): InstallLock
- **错误码**: E_INSTALL_LOCK_TIMEOUT

### install-marker.ts — 安装标记

- **职责**: 读写 install-marker.json（schemaVersion/desktopVersion/agentVersion/profiles/rollbackSnapshots）
- **核心方法**: writeInstallMarker(marker), readInstallMarker(), existsInstallMarker()

### install-log.ts — 安装日志

- **职责**: JSON Lines 格式日志 + 敏感信息自动脱敏（token/password/secret/key/auth → ***）
- **核心方法**: createInstallLogger(logDir?): InstallLogger

### first-run-wizard.ts — 首次运行向导

- **职责**: 首次运行 Agent 源选择与安装流程
- **IPC Channels**: first-run-wizard:detect-agent, select-source, start-install, cancel-install, select-zip-file, get-state

### enterprise-installer.ts — 企业安装流水线

- **职责**: 20 步有序安装流水线编排 + IPC handler 注册 + 进度推送
- **流水线**: checkEnterpriseInstall → loadDeploymentConfig → acquireInstallLock → runPreflight → resolveRuntimeBundle → installHermesAgentSource → createOrReuseSharedVenv → installPythonDependencies → provisionDefaultHermesHome → bootstrapProfiles → installBundledSkills → applyPolicy → writeInstallMarker → openWorkspaces
- **IPC Channels**: enterprise:get-deployment-config, validate-deployment-config, preflight, install, install-cancel, update, repair, rollback, get-install-marker, get-install-log, open-log-dir, run-doctor, export-doctor-report, get-migration-status, get-installer-precheck, get-runtime-state
- **核心方法**: executeEnterpriseInstallPipeline(mainWindow, input?), setupEnterpriseInstallIPC(mainWindow)

### installer-precheck-reader.ts — V1.4 NSIS 预检结果读取

- **职责**: 从 `resolveInstallLocation().runtimeRoot/installer-precheck.json` 读取 NSIS 安装器预检结果
- **核心方法**: `readInstallerPrecheck(): InstallerPrecheck | null`（文件不存在或格式无效返回 `null`）
- **依赖**: install-location-resolver.ts

### enterprise-ipc.ts — IPC 重导出

- **职责**: 从 enterprise-installer 重导出 setupEnterpriseInstallIPC

### doctor/ — Runtime Doctor 模块 (7 个文件)

#### runtime-doctor.ts — 诊断编排

- **职责**: 9 项并发检查 + 报告导出，单项超时 10s
- **核心方法**: runAllChecks(input): DoctorReport, exportDoctorReport(report, exportDir?)

#### check-gateway-reachable.ts — Gateway 可达性检查

- **核心方法**: checkGatewayReachable(host, port, timeoutMs?)

#### check-python-deps.ts — Python 依赖完整性检查

- **核心方法**: checkPythonDeps(venvPath, agentPath)

#### check-agent-files.ts — Agent 文件完整性检查

- **核心方法**: checkAgentFiles(agentPath)

#### check-profile-db.ts — Profile DB 完整性检查

- **核心方法**: checkProfileDb(dbPath) — PRAGMA integrity_check

#### check-skills.ts — Skills 完整性检查

- **核心方法**: checkSkills(skillsDir)

#### check-misc.ts — 辅助检查

- **核心方法**: checkPolicy(profileId), checkPortBinding(host, port), checkDirPermission(dirPath), checkConfigValidity(configPath)

#### check-windows.ts — Windows 特定检查

- **核心方法**: Windows 平台特定环境与路径检查

### windows/ — Windows 平台模块 (4 个文件)

#### install-location-resolver.ts — 安装位置解析

- **职责**: Windows 安装目录解析（注册表/默认路径）

#### path-resolver.ts — 路径解析

- **职责**: Windows 特定路径解析

#### powershell-runner.ts — PowerShell 运行

- **职责**: PowerShell 命令执行封装

#### process-tree.ts — 进程树

- **职责**: Windows 进程树查询与清理

---

### browser/ — Web Operator 模块

基于 `hermes-desktop` 二开，扩展为 **Portal Desktop Web Operator**。V2.2 起浏览器视口统一经 **ShellViewManager**（`ShellBrowserViewAdapter`），`BrowserViewManager` 文件保留为 legacy。

#### browser-types.ts — 内部类型定义

- **导出**: `BrowserViewBounds`, `PendingSensitiveAction`, `SENSITIVE_ACTION_KEYWORDS`, `JS_SCRIPT_NAMES`, `BROWSER_PARTITION`, `PENDING_ACTION_TIMEOUT_MS`

#### browser-security.ts — BrowserSecurityGuard

- **职责**: 域名白名单校验（精确 + 通配符）、密码字段检测、敏感动作识别
- **核心方法**: `isDomainAllowed()`, `isPasswordField()`, `isSensitiveAction()`, `validateAction()`
- **配置文件**: `~/.hermes/desktop/web-operator/web-operator.config.json`

#### browser-audit.ts — BrowserAuditLogger

- **职责**: JSONL 审计日志追加写入、日期轮转、文本脱敏（browser.type 仅记录 textLength）、实时推送
- **核心方法**: `log()`, `query()`, `onLog()`, `close()`
- **日志路径**: `~/.hermes/desktop/web-operator/logs/browser-audit-YYYY-MM-DD.jsonl`

#### browser-viewport.ts — BrowserViewPort（V2.2）

- **职责**: 浏览器视口抽象接口；`BrowserController` / `BrowserIPC` 依赖注入

#### shell-browser-view-adapter.ts — ShellBrowserViewAdapter（V2.2）

- **职责**: `BrowserViewPort` → ShellViewManager layer `web-operator`；partition `persist:web-operator`
- **常量**: `WEB_OPERATOR_LAYER_ID`

#### browser-view-manager.ts — BrowserViewManager（legacy）

- **职责**: 旧版独立 WebContentsView 单例（**V2.2 运行时不再使用**）；实现 `BrowserViewPort` 供回滚
- **核心方法**: `createView()`, `navigate()`, `destroyView()`, `updateBounds()`, `getExternalWebContents()`, `isReady()`

#### browser-controller.ts — BrowserController

- **职责**: 所有浏览器操作统一入口；V2.2 注入 `BrowserViewPort`；`openExternalUrl` 成功后 `emit browser.opened`

#### shell-view-event-forwarder.ts — ShellView 事件转发（V2.3）

- **职责**: `viewEventBus` → `mainWindow.webContents.send`（metadata / load-failed / crashed）

#### main-page-state-store.ts — MainPage 持久化（V2.3 / V3.2）

- **职责**: `~/.hermes/desktop/main-page-state.json`；V3.2 读写 **version 2**（`workspaceOrder`、`workspaceSecondaryState`）；V1 经 `main-page-state-migrate.ts` 自动迁移

#### view-registry.ts — ShellView 分区注册（V3.2.1）

- **职责**: `aios-home` / `web-operator` / `external-browser` 默认 partition；文件头三分区策略注释
- **分区**: `AIOS_HOME_PARTITION`、`WEB_OPERATOR_PARTITION`（来自 `browser-partitions.ts`）；external 创建时必须显式 `externalBrowserPartition(id)`

#### token-inject-url.ts — Token 注入 URL 判定（V3.3+）

- **职责**: `shouldInjectTokenForUrl()`；origin 白名单来自 `AuthEndpointConfig`（`buildAllowedOrigins`）
- **范围**: 仅 `TOKEN_INJECT_PARTITIONS` = `[persist:aios-home]`

#### token-header-injector.ts — Session 请求头注入（V3.3+）

- **职责**: `installTokenHeaderInjector()`；对 `persist:aios-home` 分区在 origin 白名单匹配时附加 `Authorization: Bearer`

#### layout-calc-parser.ts — 安全 calc 解析（V2.3）

- **职责**: 有限 `calc()` 求值（仅 +/-、px、%）；供 `ShellViewManager` 与 `overlay-base`
- **核心方法**: `openExternalUrl()`, `goBack/Forward/Reload()`, `getPageState()`, `captureScreenshot()`, `clickSelector()`, `typeIntoSelector()`, `extractTable()`, `confirmAction()`, `rejectAction()`, `getAuditLog()`
- **注入脚本**: `__get_page_state__`, `__click_selector__`, `__type_selector__`, `__extract_table__`

#### browser-ipc.ts — BrowserIPC

- **职责**: 注册/注销 13 个 browser.* IPC handlers
- **IPC Channels**: browser.open, browser.back, browser.forward, browser.reload, browser.get_state, browser.screenshot, browser.click, browser.type, browser.extract_table, browser.get_audit_log, browser.confirm_action, browser.reject_action, browser.update_bounds

#### browser-tool-bridge.ts — BrowserToolBridge

- **职责**: Hermes 工具调用 → Controller 方法路由，强制 source="hermes"
- **核心方法**: `handleToolCall()`, `getToolSchemas()`

#### browser-tool-server.ts — BrowserToolServer

- **职责**: 本地 HTTP 工具服务器，仅绑定 127.0.0.1，端口冲突自动递增（8765→8775）
- **端点**: GET /tools → Schema 列表；POST /tools/:toolName → 执行工具
- **配置**: REQUEST_TIMEOUT_MS=30000, BASE_PORT=8765, MAX_PORT=8775

---

### web-operator-task-session-store.ts — V5.7.5 任务会话存储

- **职责**: SQLite `~/.hermes/desktop/web-operator-task-session.db`；按 `pageUrl` 派生 `taskId`（`wot_` + sha256 前缀）；存 `sessionId`、序列化 `pageContext`、`skill`、状态
- **核心方法**: `resolveTaskSession()`, `upsertTaskSession()`, `removeTaskSession()`
- **注意**: **非** Hermes `state.db`；仅桌面控制面任务绑定

### web-operator-task-session-ipc.ts — V5.7.5 任务会话 IPC

- **IPC Channels**: `web-operator-task-session:resolve`, `web-operator-task-session:upsert`, `web-operator-task-session:remove`
- **注册**: `src/main/index.ts` → `registerWebOperatorTaskSessionIpc()`

### hermes-default-chat/ — V5.6+ Local Hermes Chat（Main）

- **hermes-default-chat-ipc.ts**: `hermes-chat:*` 模型/附件/发送；与 legacy `hermesAPI` 共用 `chat-*` 事件
- **hermes-default-chat-attachments.ts**: 附件落盘至 `profileHome(profile)/desktop/chat-attachments/<sessionId>/`
- **hermes-session-model-store.ts**: `session-models.json`（Chat session 级模型；WebOperator 面板不使用）

---

## 预加载层 (src/preload/)

### index.ts — 预加载脚本

- **职责**: 通过 contextBridge 暴露 `window.hermesAPI`、`window.hermesDefaultChat`、**`window.webOperatorTaskSession`**、`window.electron`、`window.aiosBrowser`、**`window.profileRuntime`**、**`window.profileEntry`**、**`window.aiosRuntime`**、**`window.shellView`**
- **关键**: 将所有 IPC invoke/on 封装为 Promise/回调 API
- **暴露对象**: hermesAPI (90+ 方法，含 getInstallerPrecheck、V1.4.1 windowControls、firstRunWizard、SSH 隧道、更新生命周期), **hermesDefaultChat (Local Hermes Chat + uploadAttachmentBuffers)**, **webOperatorTaskSession (resolve/upsert/remove)**, electron (标准 Electron API), aiosBrowser (13 方法 + 2 事件订阅), **profileRuntime (17 方法 + 1 事件)**, **profileEntry (5 方法)**, **aiosRuntime (11 方法 + 1 事件)**, **shellView (9 方法: create/activate/setBounds/loadUrl/focus/hide/destroy/getState/getAll)**

### browser-api.ts — Web Operator Preload API

- **职责**: 封装 browser.* IPC 为 `window.aiosBrowser` API
- **核心方法**: `open()`, `back()`, `forward()`, `reload()`, `getState()`, `screenshot()`, `click()`, `type()`, `extractTable()`, `getAuditLog()`, `confirmAction()`, `rejectAction()`, `updateBounds()`
- **事件订阅**: `onPendingAction()`, `onAuditUpdate()`, **`onOpened()`（V2.2）**

### aios-api.ts — Portal Runtime Preload API

- **职责**: 封装 aios:* IPC 为 `window.aiosRuntime` API
- **方法**: getRuntimeStatus, installAiOs, startAiOs, stopAiOs, restartAiOs, openAiOsHome, reloadAiOsHome, setAiOsViewBounds, getAiOsLogs, runDoctor, reconcile, checkPorts
- **事件订阅**: onAiOsRuntimeChanged

### index.d.ts — 类型声明

- **职责**: HermesAPI（含 **WindowControlsAPI**）+ AiosBrowserAPI + **ProfileRuntimeAPI + ProfileEntryAPI + AiOsRuntimeAPI** 接口完整 TypeScript 类型定义，声明全局 Window 扩展

### profile-runtime-api.ts — V1.1+V1.2 Profile Runtime Preload API

- **职责**: 封装 profile-runtime:* IPC 为 `window.profileRuntime` API
- **方法**: importConfig, listProfiles, getProfile, startProfile, stopProfile, restartProfile, startAllProfiles, stopAllProfiles, getRuntimeStatus, delegate, listProfileSkills, copySkill, listProfileSessions, shareSessionContext, listSharedContexts, deleteSharedContext, listAuditEvents, **V1.2 新增**: getGatewayLogs, onRuntimeStatusChanged, setAutoRestart

### profile-entry-api.ts — V1.1 Profile Entry Preload API

- **职责**: 封装 profile-entry:* IPC 为 `window.profileEntry` API
- **方法**: listProfileEntries, getProfileEntry, openProfileEntry, getProfilePageLayout, updateProfilePageLayout

### shell-view-api.ts — V1.9 + V2.1 ShellView Preload API

- **职责**: 封装 shell:view:* IPC 为 `window.shellView` API
- **核心方法**: `create`, `activate`, `setBounds`, `loadUrl`, `focus`, `hide`, `destroy`, `getState`, `getAll`

### hermes-default-chat-api.ts — V5.6+ Local Hermes Chat Preload API

- **职责**: 封装 `hermes-chat:*` 为 `window.hermesDefaultChat`
- **核心方法**: `listModels`, `getModelConfig`, `setModelConfig`, `getSessionModel`, `setSessionModel`, `uploadAttachments`, **`uploadAttachmentBuffers`**, `uploadDroppedAttachments`, `removeAttachment`, `sendMessage`, `abort`, `onChunk` / `onDone` / `onError` / `onToolProgress` / `onUsage`
- **契约**: `src/shared/hermes-default-chat/hermes-default-chat-contract.ts`

### web-operator-task-session-api.ts — V5.7.5 任务会话 Preload API

- **职责**: 封装 `web-operator-task-session:*` 为 `window.webOperatorTaskSession`
- **方法**: `resolve`, `upsert`, `remove`
- **契约**: `src/shared/web-operator/web-operator-task-session-contract.ts`

---

## 渲染进程 (src/renderer/)

### App.tsx — 根组件

- **职责**: 屏幕路由 (splash → welcome → installing → setup → main)
- **状态管理**: 安装状态检查、远程模式检测
- **V1.4.1**: Win/Linux 在非 `main` 屏显示 `layout-titlebar` + `WindowControls`
- **V2.0**: `screen === "main"` 时由 `MainTopBar` 承担拖拽；macOS 仅在非 `main` 屏渲染全局 `drag-region`；根 `.app` 使用 `100dvh`

### constants.ts — 常量定义

- **Provider 列表**: OpenRouter, Anthropic, OpenAI, Google, xAI, Nous, Qwen, MiniMax, Custom
- **本地预设**: LMStudio, Ollama, vLLM, llama.cpp
- **远程预设**: Groq, DeepSeek, Together, Fireworks, Cerebras, Mistral
- **Gateway 平台**: Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, Email, SMS, BlueBubbles, 钉钉, 飞书, 企微, 微信, Webhooks, HomeAssistant

### Renderer 子模块文档入口

Renderer 详细文档已拆分到 [`docs/renderer/`](renderer/INDEX.md)，包括 Screens、组件族、Workspace 路由、Hooks 等。

| 模块 | 文档 | 说明 |
|---|---|---|
| Screens | [`docs/renderer/screens/INDEX.md`](renderer/screens/INDEX.md) | 所有 Screen 页面（active / retained 标注） |
| 组件族 | [`docs/renderer/components/INDEX.md`](renderer/components/INDEX.md) | layout / shell / hermes / workspace / install |
| Workspace | [`docs/renderer/workspace/INDEX.md`](renderer/workspace/INDEX.md) | registry / renderer / secondary-nav |
| Hooks | [`docs/renderer/HOOKS.md`](renderer/HOOKS.md) | 7 个 hooks 职责 |
| 启动门控 | [`docs/renderer/APP_STARTUP.md`](renderer/APP_STARTUP.md) | App 路由 + useStartupGate |
| 主布局 | [`docs/renderer/MAIN_LAYOUT.md`](renderer/MAIN_LAYOUT.md) | Layout / MainPage / MainTopBar |
| Workspace 路由 | [`docs/renderer/WORKSPACE_ROUTING.md`](renderer/WORKSPACE_ROUTING.md) | WorkspaceRenderer / kind 分发 |
| 状态与 Context | [`docs/renderer/STATE_AND_CONTEXT.md`](renderer/STATE_AND_CONTEXT.md) | 全局 UI 状态、KeepAlive、持久化 |
| Preload API | [`docs/renderer/PRELOAD_API_USAGE.md`](renderer/PRELOAD_API_USAGE.md) | Renderer 可用 `window.*` 边界 |
| 样式 | [`docs/renderer/STYLES.md`](renderer/STYLES.md) | CSS 策略 + 布局常量 |

---

## 构建与安装器 (build/)

| 文件 | 职责 |
|---|---|
| installer.nsh | NSIS 自定义宏：preInit / **customInit (VC++)** / customInstall / customUnInstall |
| afterPack.js | 打包后处理脚本 |
| nsis/Include/AddToPathSafe.nsh | 用户 PATH 安全增删 |
| nsis/Include/VCRuntimeCheck.nsh | **V1.4** VC++ 2015–2022 x64 检测与可选安装 |
| nsis/Include/RuntimePrecheck.nsh | **V1.4** Git/Python/uv/8642 检测，写出 installer-precheck.json |
| winget/ | WinGet 清单模板（Installer/Locale/Version） |

安装产物路径示例：`$INSTDIR/runtime/installer-precheck.json`、`$INSTDIR/runtime/logs/nsis-install.log`

---

## 共享模块 (src/shared/)

### profile-runtime/ — V1.1+V1.2 Profile Runtime 契约

| 文件 | 职责 |
|---|---|
| profile-runtime-contract.ts | 全部 TypeScript 类型定义（V1.2: 115+ 接口/类型/枚举），含 ProfileRuntimeAPI + ProfileEntryAPI 接口 + V1.2 新增 RuntimeReconcileResult/GatewayLogEntry/GatewayLogQueryOptions/GatewayLogLevel/RuntimeStatusChangeEvent |
| profile-runtime-errors.ts | 19 个错误码（V1.2 新增 PROFILE_STARTUP_TIMEOUT） + ProfileRuntimeError 类 + createProfileError() 工厂函数 |

### enterprise/ — V1.2.1+V1.4+V1.4.1 Enterprise 契约

| 文件 | 职责 |
|---|---|
| enterprise-contract.ts | API 契约；**V1.4 新增** `InstallerPrecheck` 及预检状态类型 |
| enterprise-schema.ts | 数据结构类型 |
| enterprise-constants.ts | 枚举/错误码/常量 |
| pip-mirror-presets.ts | **V1.4.1** PyPI 镜像预设（清华/阿里/腾讯/官方/自定义） |
| migration-contract.ts | 迁移契约类型 |
| runtime-state-contract.ts | 运行时状态契约类型 |

### aios/ — Portal 契约

| 文件 | 职责 |
|---|---|
| aios-contract.ts | Portal 运行时 API 契约与类型定义 |

### browser/ — Web Operator 契约

| 文件 | 职责 |
|---|---|
| browser-contract.ts | Web Operator API 契约与类型定义 |
| browser-errors.ts | Web Operator 错误码 |
| browser-tool-schema.ts | Web Operator 工具 Schema 定义 |

### web-operator/ — V5.7.5 任务会话契约

| 文件 | 职责 |
|---|---|
| web-operator-task-session-contract.ts | `WebOperatorTaskSessionRecord`、`WebOperatorTaskPageContext`、`WebOperatorTaskSessionAPI` |

### shell/ — Shell View 与主界面布局契约

| 文件 | 职责 |
|---|---|
| **main-page-constants.ts** | **V2.0** 主界面布局常量（顶栏 40、底栏 24、侧栏 232、默认窗口 1280×800、最小 900×600） |
| view-contract.ts | ShellView 核心类型（Kind/Layer/State/Bounds/Layout/Options/RegistryEntry） |
| **shell-view-contract.ts** | **V1.9** ShellView IPC 契约（ShellViewChannels 常量 + 请求/响应类型） |
| overlay-contract.ts | Overlay 契约（Modal/Dropdown/InternalView） |

### i18n/ — 国际化

| 文件 | 职责 |
|---|---|
| index.ts | i18next 实例初始化，en/zh-CN 资源加载，t() 翻译函数 |
| config.ts | SOURCE_LOCALE=en, FALLBACK_LOCALE=en, APP_LOCALES=[en, zh-CN] |
| types.ts | AppLocale 类型, TranslationTree |
| locales/en/ | 英文翻译（源语言） |
| locales/zh-CN/ | 简体中文翻译 |

每种语言的翻译模块: common, navigation, welcome, setup, chat, settings, tools, sessions, models, providers, office, errors, schedules, skills, gateway, agents, soul, memory, install, constants, **aiosHome**

---

## 测试 (tests/)

| 文件 | 覆盖范围 |
|---|---|
| constants.test.ts | 渲染进程常量 |
| installer-utils.test.ts | 安装工具函数 |
| ipc-handlers.test.ts | IPC Handler 集成 |
| preload-api-surface.test.ts | 预加载 API 完整性 |
| profiles.test.ts | 配置档案管理 |
| session-cache-sync.test.ts | 会话缓存同步 |
| sse-parser.test.ts | SSE 解析器 |
| winget-generator.test.ts | WinGet 清单生成 |
| enterprise-install-cancel.test.ts | 企业安装取消 |
| install-location-resolver.test.ts | 安装位置解析 |
| install-paths.test.ts | 安装路径 |
| migration-runner.test.ts | 迁移运行器 |
| runtime-state-resolver.test.ts | 运行时状态解析 |
| runtime-v1.2-phase1.test.ts | V1.2 Phase1 |
| ssh-remote.test.ts | SSH 远程连接 |
| update-lifecycle.test.ts | 更新生命周期 |
