---
name: PRD v1.4.1 Hotfix 实施
overview: 按 PRD v1.4.1 实施五个 P0：删除 Desktop MCP Proxy (:18781)、修正 Runtime Connection 状态语义、dev:runtime 自动登记本机 Hermes、Runtime 接管 Gateway 生命周期、建立 Runtime 文件日志到 Desktop Logs UI 的闭环。按 PRD §82 的 Phase A–G 顺序执行。
todos:
  - id: phase-a
    content: "Phase A: 修正 runtime-connection-manager 的 Ready 判定为 readiness.service 驱动 + Banner 微调 + 单测"
    status: completed
  - id: phase-b
    content: "Phase B: 删除 MCP Proxy :18781，mcp-compat-ipc 适配器走 ServeMcpAdapter，物理删除本地 MCP 实现文件"
    status: completed
  - id: phase-c
    content: "Phase C: dev_hermes_registration_service + InstanceService.ensure_default + register_external + 重写 dev_bootstrap + pytest"
    status: completed
  - id: phase-d
    content: "Phase D: 验证 Runtime-owned Gateway 链路 + foreign gateway 端口冲突测试"
    status: completed
  - id: phase-e
    content: "Phase E: configure_logging(settings) 双通道日志 + log_dir 迁移 + diagnostics source 字段 + 契约再生成"
    status: completed
  - id: phase-f
    content: "Phase F: RuntimeServiceSection View Logs/Retry 规则 + RuntimeLogsSection Jobs/ExpertMcp tab + HermesRuntimeSection external-dev 展示"
    status: completed
  - id: phase-g
    content: "Phase G: CI guards + ADR-011~014 + AGENTS/docs/lat.md 同步 + §89 五项验收"
    status: completed
isProject: false
---

# PRD v1.4.1 Hotfix 实施计划

## 现状关键发现

- 旧 degraded 判定在 [runtime-connection-manager.ts](apps/desktop/src/main/copilot-runtime-client/runtime-connection-manager.ts) 第 230-256 行；readiness 已在第 160 行获取并缓存（`setCachedReadiness`），可直接复用
- MCP Proxy 启动链：`main/index.ts:475` → `registerMcpIpc` → [mcp-ipc.ts](apps/desktop/src/main/mcp/mcp-ipc.ts) 第 40 行 `startMcpRuntimeProxy()` → [mcp-runtime-proxy.ts](apps/desktop/src/main/mcp/mcp-runtime-proxy.ts) 监听 18781；`mcp-bridge-installer.ts:51` 也调用
- Renderer 仅 4 个文件使用 `window.hermesAPI.mcp.*`（HermesMCPPage / useHermesMcp / McpTabs / HermesMcpGatewayPage）
- [ServeMcpAdapter.ts](apps/desktop/src/main/runtime-adapters/ServeMcpAdapter.ts) 已封装 Runtime `/instances/{id}/mcp/servers*`，可直接作为 Compatibility Adapter 后端
- [dev_bootstrap.py](services/runtime/scripts/dev_bootstrap.py) 当前只检测不登记，且 always exit 0，还调用私有 `InstallationService._ensure_default_instance`
- [logging.py](services/runtime/src/core/logging.py) 仅 stderr；`configure_logging()` 在 [lifecycle.py](services/runtime/src/core/lifecycle.py) 第 227 行调用
- `log_dir_path`（[config.py](services/runtime/src/core/config.py) 第 237 行）默认指向源码目录 `services/runtime/data/logs`，需改为 `<RUNTIME_DATA_DIR>/logs`
- `_check_port_for_start` 已实现 `gateway_port_conflict` 且不 kill 外部进程（[instance_gateway_service.py](apps/desktop) 第 100-113 行），Phase D 主要是验证 + 测试
- `RuntimeVersionResponse`（[schemas/runtime.py](services/runtime/src/schemas/runtime.py) 第 161 行）无 metadata 字段，展示 "Source: Local Development" 需要 additive 契约扩展
- Runtime 无 `/expert-mcp/logs`，本 Hotfix 按 PRD §45 标记为 Diagnostics

## Phase A — Runtime Connection 修正（Desktop）

目标：`Ready` 仅要求 `readiness.service.ready == true`（PRD §12/§13/§14）。

- 修改 [runtime-connection-manager.ts](apps/desktop/src/main/copilot-runtime-client/runtime-connection-manager.ts)：
  - 删除第 230-256 行基于 `status.status/hermesInstalled/checks` 的 degraded 判定
  - handshake 中 readiness 获取失败时不再静默置 null 后继续旧判断；`service.ready !== true` → `RuntimeDegraded`（保留 `canRepair: true`），否则 → `Ready`
  - 禁止 readiness 之后再被 status 字段推翻（PRD §63）
- [RuntimeDegradedBanner.tsx](apps/desktop/src/renderer/src/components/runtime/RuntimeDegradedBanner.tsx)：基本已符合 §17，微调 execution banner action 为 "View Hermes Runtime"；确认 Repair 按钮只在 connection 级失败（RuntimeMissing / Starting timeout / Service degraded）出现（§18）
- 测试：Desktop vitest 覆盖 "service.ready=true + execution/maintenance=false → Ready"（PRD §70）

## Phase B — 删除 Desktop MCP Proxy（Desktop）

- [main/index.ts](apps/desktop/src/main/index.ts)：移除第 475-476 行 `registerMcpIpc(() => mainWindow)` / `seedDefaultMcpServers()` 调用，改为注册新的兼容适配器 `registerMcpCompatIpc()`；保留 `registerMcpSkillGatewayRuntimeIpc()`（其 proxy 启停已在 v1.4 禁用，不自动监听）
- 新建 `apps/desktop/src/main/mcp/mcp-compat-ipc.ts`（Compatibility Adapter，PRD §9）：
  - 保留全部现有 `mcp:*` channel 名，Renderer 零改动
  - servers CRUD / test / enable / disable → 委托 `ServeMcpAdapter`（Runtime `/instances/{id}/mcp/servers*`）
  - 无 Runtime 对应的 channel（bind-tool / unbind-tool / invoke-test / list-invocations / list-artifacts / check-bridge / install-bridge / sync-tools）→ 返回显式 `MCP_MOVED_TO_RUNTIME` 错误，禁止 legacy fallback（§54）
  - 不得启动 HTTP Server、不得读写 Desktop MCP DB
- 物理删除（§8/§53）：`mcp-runtime-proxy.ts`、`mcp-db.ts`、`mcp-server-registry.ts`、`mcp-skill-binding-service.ts`、`mcp-tool-sync-service.ts`、`mcp-client-service.ts`、`mcp-invocation-service.ts`、`mcp-seed.ts`、`mcp-bridge-installer.ts`、`mcp-events.ts`（事件改由适配器内联或删除）；更新 `mcp/index.ts` 导出
- 可选：`packages/runtime-client-ts` 增加 MCP domain facade（封装 `/instances/{id}/mcp/servers*`），Desktop Main 改走 `@smc/runtime-client` 公共门面（符合 contract-boundary 规则）；若改动面过大则本 Hotfix 沿用现有 `mcp-client.ts`，在计划中标注
- 验收：`npm run dev:desktop` 无 `[MCP PROXY]` 输出；`Get-NetTCPConnection -LocalPort 18781` 无监听

## Phase C — Dev Hermes Registration（Runtime）

- 新建 [dev_hermes_registration_service.py](services/runtime/src/services/dev_hermes_registration_service.py)：
  - `resolve_local_hermes()`：`HERMES_DEV_EXECUTABLE` override → `shutil.which("hermes")`（§21/§22）
  - `validate`：`hermes --version`，exit 0 + 可解析版本；显式设置无效或检测到但不可运行 → 抛错（§23）
  - `register`：upsert `RuntimeVersion`（version、channel=`development`、executable_path、install_path=parent、status=active、metadata_json=`{"source":"external-dev","managed":false}`）；同 executable+version 幂等复用；版本变化时旧 external-dev 版本置 inactive、新版本 active（§26/§30）
- 正式 Service 公共能力（§28）：
  - `InstanceService.ensure_default(...)`（[instance_service.py](services/runtime/src/services/instance_service.py)）：幂等保证 name=default / profileName=default / gatewayPort=8642 / autoStart=true，版本升级时更新 `runtime_version_id`；逻辑提炼自 `InstallationService._ensure_default_instance`，InstallationService 改为复用该方法
  - `RuntimeVersionService.register_external(...)`（新建或并入现有 version 服务），Installation 流程与 Dev Registration 共用
- 重写 [dev_bootstrap.py](services/runtime/scripts/dev_bootstrap.py)：脚本只调用 service；错误策略按 §57（未发现 Hermes 且 `HERMES_DEV_REQUIRED!=1` → 继续；显式无效/验证失败/DB 写失败 → 非零退出，nx `&&` 链中断 uvicorn 启动）；输出按 §58
- 单测（pytest，§71-73）：fake hermes executable 发现与登记、bootstrap 三次幂等（RuntimeVersion=1 / Instance=1）、0.20→0.21 升级切换 active 且不删外部文件

## Phase D — Runtime-owned Gateway（Runtime）

- 现有 `_check_port_for_start` + lifecycle `reconcile_instances_on_boot` / `start_auto_start_instances` 已满足主体要求；Phase C 提供 `executable_path` 后链路自然打通
- 补强：确认 foreign gateway 占用 8642 时 instance `last_error` 写入 `gateway_port_conflict` 且不 kill 外部 PID（§33/§34，现有 `kill_unknown_port_listeners=False` 已符合）
- 测试：foreign gateway port conflict 集成测试（§78）

## Phase E — Runtime File Logging（Runtime）

- [logging.py](services/runtime/src/core/logging.py)：`configure_logging(settings)` —— stderr ConsoleRenderer + `RotatingFileHandler`（`<RUNTIME_DATA_DIR>/logs/runtime-service.log`，10MB × 5，UTF-8，JSON Lines 含 timestamp/level/event/component，§37-39）；接管 `uvicorn` / `uvicorn.error` / `uvicorn.access` logger（§40）；幂等（重复调用不叠加 handler，§41）
- [config.py](services/runtime/src/core/config.py)：`log_dir_path` 默认改为 `resolved_runtime_data_dir()/logs`（保留 `RUNTIME_LOG_DIR` override）
- [lifecycle.py](services/runtime/src/core/lifecycle.py) 第 227 行改为 `configure_logging(get_settings())`
- [diagnostics.py](services/runtime/src/api/v1/diagnostics.py) `/diagnostics/logs`：响应增加 `source` 字段（additive）
- 契约：`npm run contracts:generate` + `npm run client:generate` 再生成（additive，无需 major bump）；`RuntimeVersionResponse` 同步加 `metadata` 字段供 Phase F 使用
- E2E：`/diagnostics/logs` 返回 `lines.length > 0` 且含 startup/deployment mode/worker 日志（§79）

## Phase F — Server UI / Banner 收尾（Desktop Renderer）

- [RuntimeServiceSection.tsx](apps/desktop/src/renderer/src/screens/SettingsDrawer/server/RuntimeServiceSection.tsx)：按钮改为 Refresh / Diagnostics / View Logs / Export Diagnostic Bundle；`Retry` 仅在 `!state.ready` 时显示（§43）；View Logs 滚动到 `runtime-logs-section`（§44）
- [RuntimeLogsSection.tsx](apps/desktop/src/renderer/src/screens/SettingsDrawer/server/RuntimeLogsSection.tsx)：根节点加 `id="runtime-logs-section"`；Jobs tab 改为真实 Job 列表 + 选中 Job events（复用 runtime domain `listJobs`/`getJobEvents`，按需补 preload IPC）；Expert MCP tab 无真实日志 API，名称明确标注 "Diagnostics"（§45）
- [HermesRuntimeSection.tsx](apps/desktop/src/renderer/src/screens/SettingsDrawer/server/HermesRuntimeSection.tsx)：external-dev 版本显示 Channel=development / Source=Local Development / Managed Installation=No（§47）；`maintenance.ready=false` 时 Install/Update disabled、Doctor/Versions enabled（§48）

## Phase G — CI Guards / ADR / 文档

- 新增 guard 脚本（`tools/` 或各包 scripts，§67-69）：
  - `check:no-desktop-mcp-proxy`：desktop src 禁止 `startMcpRuntimeProxy` / `mcp-runtime-proxy` / `18781`
  - `check:no-desktop-agent-listener`：desktop main 禁止 `http.createServer` / `net.createServer`（白名单 Web Operator / Browser Tool Bridge）
  - `check:runtime-connection-readiness`、`check:dev-hermes-registration`、`check:runtime-log-output`（以单测形式落地并挂入 nx test）
- ADR-011 Development Hermes Registration、ADR-012 Runtime Port Ownership（含 §60 端口表）、ADR-013 Runtime Readiness Semantics、ADR-014 Runtime Logging Ownership（`docs/adr/`）
- 更新根 + `apps/desktop/AGENTS.md` + `services/runtime/AGENTS.md` 职责边界（§85）；按 007 规则同步 desktop docs；更新两侧 `lat.md/` 并跑 `lat check`

## 实施顺序与验证

严格按 PRD §82：A → B → C → D → E → F → G。每阶段完成后运行对应 `typecheck` / `pytest` / `vitest`。最终按 §89 五项硬性验收指标逐一验证（需本机有 hermes 时验证 3/4/5）。

## 备注

- 不新增数据库表，External Dev 信息入 `RuntimeVersion.metadata_json`（§66）
- 不提供 UI 注册外部 Hermes 的入口（§59 安全要求）
- 提交策略：按 §83 建议的 commit 拆分，每个 Phase 完成后经确认再提交