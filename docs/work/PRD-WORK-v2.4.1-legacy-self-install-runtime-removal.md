---
work_item_id: RM-16
version: v0.4.0-draft
status: PRD-DRAFT
target_branch: work/prd-v4.1
review_verdict: REVISE
review_round: 1
reviewed_at: 2026-09-09T02:21:00Z
source_revision: PRD-WORK-v2.4@OPSI-MANAGED-HERMES-RUNTIME
grounded_commit: 6e7516bf53d9c2144453c291a8b1405d32af43a9
grounding_mode: discover
parent_prd: docs/work/PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md
parent_plan: .cursor/plans/work_v2.4_hermes_p0_48a52a3d.plan.md
---

# WORK PRD v2.4.1 — Legacy Self-Install Runtime 残留移除

本 PRD 关闭 `PRD-WORK-v2.4` 在 P0 阶段显式延后的最后一批遗留：`apps/work` 主进程仍通过 `HERMES_HOME/hermes-agent/venv/Scripts/pythonw.exe` 与 `-m hermes_cli.main` 调用 Hermes。这些路径在 OPSI Managed 布局下**不存在且永远不会存在**，属于已被架构判定为废弃、但尚未删除的第二套 Runtime 假设。本 PRD 不改 Hermes 打包、不改 Gateway API、不引入新的 Runtime Adapter 类型、不新增兼容层。

## Review History

| 轮次 | 结论 | 处理 |
|---|---|---|
| R1 | REVISE，6 blocking / 10 non-blocking | v0.3.0 按 B1–B6 全部回写；非阻塞项 1/2/3/4/5/6/8/9/10 已吸收，7 已在 Scope 中限定作用域；新增 D4/D5/D6 |
| — | D4/D5/D6 裁定 + 追加 spike | v0.4.0：D4 原选 (b) 经 `:8642` 路由实测推翻，收敛为 (a)；D5=(b) 并新增对父 PRD AC-07/08/09 的有界限定（**需 R2 确认**）；D6=(b) 列入 Scope Out；PD-03/PD-04 重写；新增 AC-14、V11 |

## Evidence Baseline

| 项 | 值 |
|---|---|
| 父 PRD | `docs/work/PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md`（ADR-01 Program/Data 分离、ADR-02 Work 不理解 Hermes 内部结构、ADR-05 Gateway 单一 Process Owner、ADR-07 禁止 module-level path snapshot、AC-02、AC-07/08/09、AC-18） |
| 父 Plan 交付边界 | `.cursor/plans/work_v2.4_hermes_p0_48a52a3d.plan.md:144` 显式延后：`profiles.ts` / `dashboard.ts` / `cronjobs.ts` / `hermes-auth.ts` / `skills.ts` / `kanban.ts` 中剩余 `HERMES_PYTHON` spawn，「下一轮切到 `runHermesCli`」 |
| 父 Plan 遗漏 | 该延后清单**未包含** `hermes.ts` 的 `TuiGatewayClient` 与 Gateway spawn 链、`mcp-servers.ts`、`model-discovery.ts`、`hermes-agent-compat.ts`、`dashboard-web-dist.ts`、`installer.ts` 的 backup/import/dump/claw-migrate/memory-providers 及其 re-export block |
| Repository baseline | `6e7516bf53d9c2144453c291a8b1405d32af43a9` |
| 已完成的 v2.4 P0 | `hermes-runtime-config.ts`（Runtime Descriptor）、`hermes-runtime-locator.ts`（CLI-based valid）、`hermes-cli-runner.ts`（绝对路径 `hermes.exe`）、`runtime-manager.ts` 单 Adapter、`getEnhancedPath()` 已改用 `programRoot` |
| 遗留符号定义 | `apps/work/src/main/runtime/hermes-runtime-paths.ts:70-104` 共 **10 个**导出：`HERMES_HOME`(:70)、`HERMES_REPO`(:71)、`HERMES_VENV`(:72)、`HERMES_PYTHON`(:73)、`HERMES_SCRIPT`(:76)、`HERMES_ENV_FILE`(:79)、`HERMES_CONFIG_FILE`(:80)、`HERMES_AUTH_FILE`(:81)、`installBinariesFor`(:84)、`hermesCliArgs`(:99)。其中 `:70,79-81` 是 import 时求值的 module-level 快照，正是 ADR-07 要消灭的形态 |
| 现网实测 — 程序目录 | `D:\Programs\SMC\Hermes` 含 `bin` `config` `manifest` `node` `python` `runtime` `scripts` `uninstall`；`python\python.exe` 存在 |
| 现网实测 — 数据目录 | `C:\ProgramData\SMC\Hermes\hermes-agent` **不存在**；机器级 `HERMES_HOME` 未设置，Work 走 `WINDOWS_ENTERPRISE_DEFAULTS` |
| 现网实测 — CLI | `hermes.exe --version` → `Hermes Agent v0.20.0 (2026.8.3)`；`Install directory: D:\Programs\SMC\Hermes\python\Lib\site-packages`；Python 3.12.8 |
| 现网实测 — 子命令 | `hermes.exe` 提供 `chat` `gateway` `cron` `kanban` `profile` `skills` `mcp` `auth` `memory` `plugins` `backup` `import` `dump` `claw` `config` `sessions` `dashboard` `doctor` `update` 等。**无** `models` 或等价于 `provider_model_ids` 的子命令（见 D4） |
| 现网实测 — web dist | `…\site-packages\hermes_cli\web_server.py` 存在；`…\hermes_cli\web_dist\index.html` **不存在**；`Get-ChildItem D:\Programs\SMC\Hermes -Recurse -Depth 2 -Directory -Filter web*` 零命中，即 ProgramRoot 无任何可构建的 web 源 |
| **D1 spike（决定性）** | 按 Work 的实际方式执行 `hermes.exe dashboard --no-open --host 127.0.0.1 --port 19119 --skip-build`：进程**立即退出**，stdout 为 `--skip-build was passed but no web dist found at: …\hermes_cli\web_dist` → `Attempting one recovery build of the web UI...` → `The recovery build did not produce a usable dist.`。`/api/status` 从未响应，`/api/ws` 无法连接 |
| D1 spike 推论 | 托管布局下本地 dashboard **不可能启动**：无预置 dist，且无 `web/` 源可供 recovery build。`/api/ws` 传输在当前 release 中不可达，与 Work 侧路径是否修正无关 |
| Release profile | `release/hermes-runtime-profiles.yaml` `smc-managed`：`capabilities.web: true`、`stt.enabled/provider: local`、`gateway.port: 8642`、`authRequired: true`。这些是配置声明，不等于路由存在——见下条实测 |
| **D4 / PD-04 spike（决定性）** | 直接探测 `:8642`，用 `/__definitely_not_a_route__` 作 404 基准。**存在**：`GET /health` → 200（免认证）；`GET /v1/models` → 401 → 带 `API_SERVER_KEY` 后 200，但 data 只有单个 `{"id":"smc-copilot"}` 网关别名；`POST /v1/chat/completions` → 401 → 带 key 后 400（缺 messages）。**全部 404**（与不存在的路由无差别）：`/api/audio/transcribe`、`/api/skills`、`/api/status`、`/api/models`、`/openapi.json` |
| D4 / PD-04 spike 推论 | Gateway api_server 只提供 `/health` + `/v1/*`。全部 `/api/*` 属 dashboard（`web_server.py`）而 dashboard 无法启动（D1 spike），因此**「改走 Gateway HTTP」对 skills / model-discovery / STT 均不可行**。三者当前**已经全部失效**：`transcribeAudioViaLocalPython` 与 `runProviderModelIdsPython` 卡在 `existsSync(HERMES_PYTHON)`，`listBundledSkills` 读不存在的 `HERMES_REPO/skills` 返回空。删除它们不损失任何**当前可用**的能力，只是把静默失败变为显式 |
| 现网实测 — skills 目录 | `C:\ProgramData\SMC\Hermes\skills` **存在**（`skills.ts:154` 已覆盖，用户/托管技能不受影响）；`C:\ProgramData\SMC\Hermes\hermes-agent\skills` 不存在；ProgramRoot 无 `skills` 目录。仅 bundled 来源失效 |
| 现网实测 — .env ACL | 本机标准用户**可读** `C:\ProgramData\SMC\Hermes\.env` 并取到 `API_SERVER_KEY`。父 PRD §11/§21 假设的 ACL 阻断在本机未生效；此事实不改变本 PRD 范围，但应记入 v2.4 P1 的 Credential 议题 |
| Control owner | `isExternallyManagedOwner()` 仅对 `salt` / `opsi` 为 true（`src/shared/runtime/control-owner.ts:19-21`）；**仓库默认 owner 是 `direct`**（`src/main/hermes/control-owner.ts:64-65`），该 gate 在默认模式下**不生效**。本机因 `%ProgramData%\SMC\control-owner.json` 写了 `opsi` 才被 gate |
| 现有 spawn 护栏 | `apps/work/scripts/check-no-work-gateway-spawn.mjs:11` 只扫 `register.ts` 单文件，抓不到 `hermes.ts` 内部自恢复链 |
| 打包侧无关性 | `infra/windows/hermes-agent/` 的 layout（`SmcHermesManaged.psm1` `Get-SmcHermesManagedLayout`）与 release manifest 均不产生 `venv`；`Resolve-SmcHermesManagedApplyPython` 解析 `<ProgramRoot>\python\python.exe`。本 PRD 不修改任何打包文件 |

## Problem and Outcome

现象：Work 启动即打印 `[dashboard-gateway:default] warmup failed: Python interpreter not found at C:\ProgramData\SMC\Hermes\hermes-agent\venv\Scripts\pythonw.exe`，每次 Chat 提交再打印一次 `[chat] Hermes gateway stream unavailable; falling back to API stream`。同时 `hermes_runtime_probe` 报 `state: ready` / `gatewayHealthy: true`。

根因不是配置错误，而是 Work 内同时存在两套互斥的 Runtime 假设。`hermes-runtime-paths.ts` 把**数据目录** `HERMES_HOME` 当作**源码仓库根**，再往下拼 `hermes-agent/venv`。`TuiGatewayClient.startDashboardBackend` 在此基础上试图 spawn 一个本地 `hermes dashboard`；`shouldUseTuiGatewayClient()` 只判断是否处于测试环境，不判断 control owner，所以托管安装下这条路径必然失败。

需要强调的是，`/api/ws` 的丢失**不是**本次删除造成的。D1 spike 证明托管 release 缺少 `hermes_cli/web_dist` 且无源可构建，本地 dashboard 无论如何都启动不了；修正 Python 路径也不会让这条传输回来。本 PRD 只是把「每次重试后静默降级」改为「显式不可用」。

当前用户可见影响是**降级而非中断**：Chat 已 fallback 到 `:8642` API stream，代价是丢失 dashboard `/api/*` 才提供的能力（slash 目录、结构化工具事件、model library、session list），以及每条消息一次无效 spawn 尝试与误导性日志。除 Chat 外，`profiles` / `cronjobs` / `kanban` / `mcp` / `skills` / `auth` / `backup` / `import` / `dump` 等 IPC 处理器在托管安装下同样静默失效（返回空列表或抛错），只是没有像 Chat 那样打日志。

完成后：`apps/work` 生产路径不再存在任何 Python 解释器路径推导、任何 `-m hermes_cli.main` 调用、任何对 `HERMES_HOME/hermes-agent` 目录树的存在性依赖、任何「Hermes 进程映像是 Python」的假设。所有 CLI 能力经 `hermes-cli-runner` 的绝对路径 `hermes.exe` 调用，所有会话/健康/模型能力经 `getGatewayBaseUrl()`。local 模式 Chat 只有一条传输路径。启动与 Chat 日志不再出现 legacy 路径。

## Scope

- **In**：删除 `hermes-runtime-paths.ts` 的 10 个遗留导出及其全部生产调用点与 re-export；受影响主进程文件按能力改为 `hermes-cli-runner` 或 Gateway HTTP，或整体删除；删除 local TUI dashboard 传输（D1=c）；删除 Work 侧 Gateway spawn/restart 实现（PD-03，范围见 D5）；清理进程映像 Python 假设；清理 `hermes-sandbox.ps1` legacy 残留；新增回归护栏；同步 `apps/work/lat.md`、`apps/work/README.md` 与相关测试。
- **Out**：Hermes Agent 打包格式与 `infra/windows/hermes-agent/`；Gateway API 契约；`services/runtime`；Remote / SSH transport 与 remote OAuth dashboard（`dashboard.ts` 的 remote 分支、`lat.md/remote-dashboard-oauth.md` 保持原样）；`desktop.json` 迁出 `HERMES_HOME`（v2.4 P1 独立项）；`gateway-ports.ts` 语义冻结；Credential Manager / DPAPI；新增 Runtime Adapter 类型；Skill Run（v4.0.1 track）。
- **Out — `apps/desktop`**：`apps/desktop/src/main/hermes.ts:694-756` 有自己独立的 `-m hermes_cli.main` spawn（经 `getHermesPython()`），不 import `apps/work` 任何模块。血缘半径仅限 `apps/work`，实施时不得误伤 desktop。
- **Out — legacy 自安装引导 UI（D6=b）**：`renderer/src/constants.ts:1340-1343`、`renderer/src/App.tsx:172`、`i18n/locales/*/install.ts:28` 本轮不改，关闭条件见 D6。
- **Out — 护栏作用域**：PD-05 的字面量禁令仅作用于 `apps/work/src/main` 与 `apps/work/scripts`；`renderer/` 与 `i18n/` 因 D6 暂缓而排除。`tools/release/hermes/windows_runtime.py:402` 正当生成含 `hermes_cli.main` 的 shim，不在禁令范围。
- **Production Owner**：`hermes-cli-runner.ts` 是 Hermes CLI 调用的唯一 owner；`hermes-runtime-config.ts` 是路径与 endpoint 的唯一 SOT；`hermes-runtime-locator.ts#validateHermesHomeDir` 是 home 校验的唯一 owner；Gateway 进程 owner 见 D5。

## Current Capability Inventory

清点来自 [legacy 调用点全量清查](1ceb3389-a913-49a6-9d12-6210abb2c797)，并经 [独立 PRD 评审](e4854fde-ab05-400c-8423-cf461b022d3c) 逐行复核订正。

### A. 常量与兼容面

| 位置 | 遗留用法 | 托管下可达性 | 分类 |
|---|---|---|---|
| `runtime/hermes-runtime-paths.ts:71-78,84-104` | `HERMES_REPO` / `HERMES_VENV` / `HERMES_PYTHON` / `HERMES_SCRIPT` / `installBinariesFor` / `hermesCliArgs` | 每次 import 即计算不存在路径 | REMOVE（`installBinariesFor` 零生产 caller，仅 `tests/hermes-runtime-paths.test.ts:61-66`） |
| `runtime/hermes-runtime-paths.ts:70,79-81` | `HERMES_HOME` / `HERMES_ENV_FILE` / `HERMES_CONFIG_FILE` / `HERMES_AUTH_FILE` — module-level 快照 | 被 `config.ts:4`、`config-health.ts:32`、`model-discovery.ts:25`、`hermes.ts:3081`、`hermes-agent-compat.ts:13`、`kanban.ts`、`profiles.ts`、`cronjobs.ts`、`dashboard.ts` 引用 | REMOVE → 改调 `getHermesHome()`（关闭 ADR-07） |
| `runtime/hermes-runtime-paths.ts:46-60` | `looksLikeHermesHome`（零 caller）、`defaultHermesHome`（已 `@deprecated`） | 不可达 | REMOVE — 与 `hermes-runtime-locator.ts:29-36#validateHermesHomeDir` 重复，后者是 `runtime-manager.ts:124,132` 的实际 owner |
| `installer.ts:28-40` | re-export 上述 10 个符号 + `getEnhancedPath` / `setHermesHomeOverride` | **零消费者**的兼容面 | REMOVE（治理规则：无当前消费者的兼容面直接删） |

### B. Chat / Dashboard 传输（D1=c）

| 位置 | 遗留用法 | 托管下可达性 | 分类 |
|---|---|---|---|
| `hermes.ts` `TuiGatewayClient.startDashboardBackend` (651-741) | spawn `pythonw -m hermes_cli.main dashboard`，cwd=`HERMES_REPO` | **每次 Chat 可达**，必失败 | REMOVE |
| `hermes.ts` `shouldUseTuiGatewayClient` / `warmTuiGatewayClient` (911-929) | 仅 gate 测试环境 | 启动即可达 | REMOVE |
| `hermes.ts` `sendMessageViaTuiGateway` (1915+) 与 `sendMessage` TUI 分支 (~2708) | 经上述 client | Chat 主路径可达 | REMOVE |
| `hermes.ts` `tuiGatewayEnv` (873-898) | 注入 `HERMES_PYTHON_SRC_ROOT` / `PYTHONPATH=HERMES_REPO` | 随 TUI / STT / CLI 路径 | REMOVE |
| `dashboard-web-dist.ts`（整文件） | 依赖 `hermes_cli/web_dist` 与 `web/package.json` | 托管布局两者均不存在 | REMOVE |
| `hermes-agent-compat.ts:400` | patch `hermes_cli/web_server.py` | 文件在 site-packages 内，Work 无权且不应改 | REMOVE |
| `dashboard.ts:176-180,613,639,649-650` | 本地 spawn dashboard + compat patch | IPC `dashboard-status` / `start-dashboard` 可达 | REMOVE **仅本地 spawn 分支**；`getRemoteDashboardStatusForConfig`(:374) 等 remote/SSH 分支保持不变 |
| `renderer/…/useDashboardChatTransport.ts:155,1150` | `mode === "local"` 时启用 dashboard 传输并调 `startDashboard` | renderer 可达 | REPLACE — local 分支返回 false |
| `renderer/…/useSettingsData.ts:383-413,513` | Settings Transport 探针（"Active: Dashboard / Auto active: Legacy fallback"）与 remote OAuth 连接测试 | 用户可见 | REPLACE — local 模式下不再呈现 Dashboard 选项；remote 探针不变 |

### C. Gateway 生命周期（D5=b：改走 CLI，保留 `direct` 自恢复）

| 位置 | 遗留用法 | 托管下可达性 | 分类 |
|---|---|---|---|
| `hermes.ts` `getGatewaySpawnError` (3037-3048) | 检查 legacy 路径生成错误文案 | 文案误导 | REPLACE → `cliPathExists()` |
| `hermes.ts` `startGatewayDetailed` (3151-3215) | spawn `pythonw -m hermes_cli.main gateway`，cwd=`HERMES_REPO` | `direct`（**默认**）下可达；`opsi`/`salt` 被 :3152 gate | REPLACE → `spawnHermesCli(["gateway", ...])`；gate 逻辑不变 |
| `hermes.ts` `startGateway` (3284-3285) | 调 `startGatewayDetailed` | 被 `office-start.ts:40` 消费 | KEEP（随上游改为 CLI 语义） |
| `hermes.ts` `startGatewayWithRecovery` (3616,3643) | 调 `startGatewayDetailed` | **5 处内部自恢复**：`:430`(transcribeAudio)、`:2769`、`:2784`、`:2818`、`:2943` | KEEP；`:430` 随 PD-04 一并移除 |
| `hermes.ts` `restartGateway` (~3576) / `:3546` | 调 `startGatewayDetailed` | IPC `set-env` 等经 `register.ts:1037+` | KEEP（CLI 语义） |
| `hermes.ts` `restartGatewayViaCli` (3664) → `restartGatewayViaCliOnce` (3693) | spawn `gateway restart` | **`hermes.ts:3678-3679` 有 caller**；在 `hermes.ts` 之外无生产调用方 | REPLACE → `spawnHermesCli`；`tests/gateway-restart.test.ts`（约 510 行，覆盖并发去重/按 profile 排队/失败回滚）需改写而非删除 |
| `hermes/legacy-process/gateway-process.ts:4-11` | 整体再导出上述 spawn API | 兼容面 | KEEP（D5=b 下仍有真实消费者）；重命名与收敛留待后续 |
| `hermes.ts:3371-3374` `GATEWAY_IMAGE_PREFIXES = ["python","pythonw"]`；`profiles.ts:157` `pidIsAliveAs(pid,["python","pythonw"])` | 假定 Gateway 进程映像是 Python | 托管 Gateway 映像是 `hermes.exe`，判活必然失败 | REPLACE — 同属「Work 理解 Hermes 内部实现」违规 |

### D. CLI 子命令迁移

| 位置 | 遗留用法 | 托管下可达性 | 分类 |
|---|---|---|---|
| `hermes.ts` `sendMessageViaCli` (2351,2542) | `hermes chat -q` | session override / API 不可用时可达 | REPLACE → `spawnHermesCli` |
| `hermes.ts` `transcribeAudioViaLocalPython` (318,336) 与 `:430` 的 recovery 调用 | `python -c` 调 `tools.transcription_tools` | 实测 `:8642` 的 `/api/audio/transcribe` 返回 404，fallback 本身亦卡在 `existsSync(HERMES_PYTHON)`——**语音输入当前已完全不可用** | REMOVE（PD-04），并把失败面改为显式错误 |
| `installer.ts` (223,288,346,400,465) | `claw migrate` / `update` / `backup` / `import` / `dump` | backup/import/dump/claw-migrate 无 owner gate，**可达** | REPLACE → `runHermesCliSync` |
| `installer.ts:514` | 扫 `HERMES_REPO/plugins/memory` | 目录不存在 → 返回空 | REPLACE → `hermes plugins` 或 `<programRoot>` |
| `skills.ts` (188,349,384) | `skills browse/install/uninstall` | IPC 可达，当前失败 | REPLACE |
| `skills.ts` (154-155,234) | 目录同时含 `join(HERMES_HOME,"skills")` 与 `join(HERMES_REPO,"skills")`；`listBundledSkills` 产出 `source:"bundled"` 喂给 `Discover.tsx:76` | 当前返回空（`HERMES_REPO/skills` 不存在） | REMOVE bundled 来源（D4=a）；保留 `join(HERMES_HOME,"skills")`——实测该目录存在，用户技能不受影响 |
| `cronjobs.ts` (334-345) | `hermes cron`，cwd=`join(HERMES_HOME,"hermes-agent")` | cron IPC 可达 | REPLACE |
| `profiles.ts` (295,340,367) | `profile create/delete/use`，cwd 同上 | profile IPC 可达 | REPLACE |
| `kanban.ts` (122-136) | `hermes kanban`，cwd 同上 | 全部 kanban IPC 可达 | REPLACE |
| `mcp-servers.ts` (87-94,861,900,960) | `mcp test/catalog/install` | 本地模式可达（多处以 `!isRemoteMode()` 分流） | REPLACE |
| `hermes-auth.ts:116` | `auth add <provider> --type oauth` | IPC `oauth-login` 可达 | REPLACE |
| `model-discovery.ts` (106-109) | `python -c` 调 `hermes_cli.models` 的 `provider_model_ids` | 当前必失败，静默退回 curated | REMOVE（D4=a）；`:8642` 的 `/v1/models` 只返回单个网关别名，不能替代 |

### E. 引导 UI 与脚本

| 位置 | 遗留用法 | 分类 |
|---|---|---|
| `renderer/src/constants.ts:1340-1343` | 指导用户把 Hermes 装到 `$hermesHome\hermes-agent` | **Out（D6=b）**，已知负债 |
| `renderer/src/App.tsx:172` | 以「missing hermes-agent binaries」为由拒绝目录 | **Out（D6=b）**，已知负债 |
| `i18n/locales/*/install.ts:28` | 「包含 hermes-agent 文件夹的那个」 | **Out（D6=b）**，已知负债 |
| `apps/work/scripts/hermes-sandbox.ps1:24,174,241-261` | `Test-Path (Join-Path $Path "hermes-agent")` 判定 home、robocopy 排除、`sandboxVenv` PATH 清理 | REMOVE legacy 残留 |

### 兼容契约评估

按 `agent-workflow-governance`，REPLACE 必须 REMOVE，除非存在有当前消费者的有界兼容契约。经全仓复核（含 `.github/workflows/`、`scripts/`、`docs/`、`package.json`）**不存在这样的消费者**：

- `apps/work/scripts/hermes-sandbox.ps1` 的 `Sync-Config` 把 `hermes-agent` 列入 robocopy `$excludedDirs`（L174），沙箱 home 从不含 Python 源码树；`:241-261` 只做 PATH 清理。
- `scripts/dev.cjs` 直接 `electron-vite dev`，继承环境变量，本机即托管安装。
- `dev:fresh` 用空临时 `HERMES_HOME`，同样无 Python 树。

因此**不设** dev-only 兼容开关；legacy 路径整体删除。

## Proposed Decisions

- **PD-01**：`hermes-runtime-paths.ts` 只保留 runtime getter 再导出、`setHermesHomeOverride`、`getEnhancedPath`、`canInvokeHermesCli`、`MANAGED_GATEWAY_MESSAGE`。删除全部 10 个遗留导出，**含 `HERMES_HOME` / `HERMES_ENV_FILE` / `HERMES_CONFIG_FILE` / `HERMES_AUTH_FILE` 四个 module-level 快照**（关闭 ADR-07），以及零 caller 的 `looksLikeHermesHome` 与 `@deprecated` 的 `defaultHermesHome`。调用方改用 `getHermesHome()` 等 getter；home 校验统一到 `validateHermesHomeDir`。
- **PD-02**：所有 Hermes CLI 调用改经 `hermes-cli-runner`（`runHermesCliSync` / `runHermesCliAsync` / `spawnHermesCli`）。禁止任何模块自行 spawn 解释器。
- **PD-03**（D5=b）：删除 legacy Python spawn，Gateway 启动/重启改经 `spawnHermesCli(["gateway", ...])`。`salt` / `opsi` 下继续被 `isExternallyManagedOwner()` gate 拦截并返回 `MANAGED_GATEWAY_MESSAGE`；`direct` 下保留自恢复能力。`legacy-process/gateway-process.ts` 与 `gateway-restart.test.ts` 保留但改写为 CLI 语义。进程判活改用 `hermes` 映像（见 AC-13）。
- **PD-04**（spike 后修订）：`transcribeAudio` 的 Python fallback 删除。实测 `POST /api/audio/transcribe` 在 `:8642` 返回 404，且 Python fallback 本身已因 `HERMES_PYTHON` 不存在而失效——**语音输入在托管安装下当前已完全不可用**。删除不造成新损失，只是把静默失败改为显式错误。恢复语音输入需要 dashboard 可启动（阻塞于 web dist）或 Hermes 在 gateway 上新增 STT 路由，两者均属 Hermes/打包侧独立立项。
- **PD-05**：新增独立护栏脚本 `apps/work/scripts/check-no-legacy-hermes-paths.mjs` 并接入现有 composite `guard` 链。禁止 `apps/work` 源码出现：`hermes-agent[\\/]venv`、`pythonw`、`hermes_cli.main`、`hermes_cli/web_dist`，以及**从 `getHermesHome()` 派生 `hermes-agent` 子路径**的形态（`join(HERMES_HOME, "hermes-agent")` 等）。测试 fixture 除外。
- **PD-06**（D1=c）：删除 `TuiGatewayClient`、`sendMessageViaTuiGateway`、`dashboard-web-dist.ts`，以及 `dashboard.ts` 的本地 spawn 分支与 renderer 的 local dashboard 传输。local 模式 Chat 只有一条传输：`getGatewayBaseUrl()` 的 API stream。不保留「先试 TUI 再降级」的重试语义。remote / SSH / remote OAuth dashboard 传输不动。

## Decisions

- **D1 — 本地 dashboard 传输的去留。已裁定：删除（选项 c）。** spike 证明 `hermes.exe dashboard --skip-build` 因缺 web dist 直接退出，ProgramRoot 亦无 `web/` 源可供 recovery build，因此 `/api/ws` 在当前 release 下不可达，与 Work 侧路径是否修正无关。**四个消费者**全部纳入范围：主进程 `TuiGatewayClient`、renderer `useDashboardChatTransport`（`:155` local 分支）、Settings Transport 探针（`useSettingsData.ts:383-413`）、IPC `dashboard-status`/`start-dashboard` 的 local 分支。**明确接受的功能损失**：local 模式失去 dashboard `/api/*` 提供的 slash 命令目录、结构化工具事件、model library 与 session list（这已是当前事实行为，本次只是从「静默降级」变为「显式不可用」）。恢复前提是 Hermes release 预置 `hermes_cli/web_dist`，属打包侧独立立项；不得在 Work 侧重建第二套 dashboard 拉起逻辑。
- **D2 — Roadmap 归属。已裁定：** 挂到现有 `ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`，新增 `RM-16`，标注属 Runtime track、`Depends On` 为空、以 `PRD-WORK-v2.4` 作 provenance bridge（与 RM-13/RM-15 的 named-increment 处理一致）。
- **D3 — 分期粒度。已裁定：** 单一 `.plan.md`，三阶段 Todo。P0 消除必失败路径；P1 CLI 子命令迁移；P2 删除常量 + 回归护栏。AC-01/AC-02 是整体退出条件，不得在 P1 未完成时提前声明达成。

- **D4 — 无 CLI 等价物的能力如何收口。已 spike，裁定收敛为 (a)。** 原选 (b)「改走 Gateway HTTP」经实测**不可行**：`:8642` 只有 `/health` + `/v1/*`，`/api/skills`、`/api/models`、`/api/audio/transcribe` 全部 404；`/v1/models` 仅返回单个网关别名 `smc-copilot`，无法充当 provider model 列表。因此 `model-discovery.ts` 的 `provider_model_ids` 与 `skills.ts#listBundledSkills` 均 **REMOVE**。关键限定：二者**当前已经失效**（前者卡在 `existsSync(HERMES_PYTHON)`，后者读不存在的 `HERMES_REPO/skills` 返回空），所以删除不损失任何当前可用能力——model 列表本就在走 curated 回退，Discover 页本就没有 bundled 条目。用户已安装技能位于 `C:\ProgramData\SMC\Hermes\skills`，由 `skills.ts:154` 覆盖，不受影响。恢复 bundled/provider 列表需 Hermes 新增 gateway 路由或 dashboard 可启动，属独立立项。
- **D5 — `direct` owner 下的 Gateway 生命周期归属。已裁定：(b)。** 只删 legacy Python spawn，Gateway 启停改经 `spawnHermesCli(["gateway", ...])`；`salt`/`opsi` 继续被 gate 拦截，`direct` 保留自恢复。`gateway-restart.test.ts` 与 `legacy-process/gateway-process.ts` 保留并改写为 CLI 语义。
  - **与父 PRD 的冲突及其限定（需 R2 评审确认）**：v2.4 ADR-05 与 AC-07/AC-08/AC-09 无条件规定「Gateway 只有一个 Process Owner（OPSI Installer）」「Work 不启动 / 不终止 / 不重启 Gateway」。选项 (b) 在 `direct` 下让 Work 保留 Gateway 进程所有权，与之冲突。本 PRD 据此对父 PRD 作**有界限定**：AC-07/08/09 的适用范围收窄为**externally-managed owner（`salt` / `opsi`）**；`direct` 被明确定义为「无外部 Endpoint 管理方的独立/开发模式」，此模式下 Work 是 Gateway 的 owner。此限定不得扩散到 `salt`/`opsi`，且必须在实现中由 `isExternallyManagedOwner()` 单点判定，不得新增第二处 owner 分支。若 R2 评审不接受该限定，则回退到 D5(a)。
- **D6 — legacy 自安装引导 UI 的去留。已裁定：(b) 列入 Scope Out。** `constants.ts:1340-1343`、`App.tsx:172`、`i18n/locales/*/install.ts:28` 本轮不改。**关闭条件**：这些文案与校验属「Work 自安装引导」能力，其 owner 归属应与 `desktop.json` 迁出 `HERMES_HOME`（v2.4 P1）一并处理；在该项交付前，本 PRD 的 PD-05 护栏对 `renderer/` 与 `i18n/` 目录不生效，以免阻断。需在 Roadmap RM-16 的 Exit Criteria 中记录此残留为已知负债。

## Acceptance Criteria

- **AC-01**：`apps/work/src/main` 与 `apps/work/scripts` 中，`hermes-agent[\\/]venv`、`pythonw`、`hermes_cli\.main`、`hermes_cli/web_dist` 零命中，且不存在从 `getHermesHome()` 派生 `hermes-agent` 子路径的形态（含 `join(HERMES_HOME,"hermes-agent")`）。`renderer/` 与 `i18n/` 因 D6=b 暂不纳入。
- **AC-02**：`hermes-runtime-paths.ts` 不再导出该 10 个遗留符号（含四个 module-level 快照）、`looksLikeHermesHome`、`defaultHermesHome`；`installer.ts` 不再 re-export 其中任何一个。
- **AC-03**：托管安装下启动 Work，主进程日志不含 `Python interpreter not found`。
- **AC-04**：托管安装下提交一次 Chat，日志不含 `Hermes gateway stream unavailable; falling back to API stream`，且消息成功返回。
- **AC-05**：**本地托管模式下**，`profile` 列表/创建/切换、`cron` 增删改、`kanban` 读写、`mcp` catalog/test/install、`skills` 列表/安装、`oauth-login`、`backup`/`import`/`dump` 经 `hermes.exe` 实际成功（不再返回空或抛路径错误）。remote 模式行为不变。
- **AC-06**：Work 启动前后 `SMC Hermes Gateway` 计划任务 PID 不变；Work 退出后 Gateway 存活（v2.4 AC-19/AC-20）。
- **AC-07**：`dashboard-web-dist.ts` 已删除且无残留 import；`TuiGatewayClient` 与 `sendMessageViaTuiGateway` 已删除；local 模式 Chat 只存在一条传输路径。
- **AC-08**：remote / SSH / remote OAuth dashboard 传输未回归，既有测试全绿。
- **AC-09**：用户 PATH 不含 Hermes 时上述能力仍可用（绝对路径调用，v2.4 §34）。
- **AC-10**：`check-no-legacy-hermes-paths.mjs` 已接入 `guard`，对新引入的任一 AC-01 形态失败。
- **AC-11**（D5=b）：`direct` owner 下 Gateway 启动/重启经 `hermes.exe gateway` 实际成功，5 处自恢复路径不出现「入口存在但静默 no-op」；`salt`/`opsi` 下仍被 `isExternallyManagedOwner()` 单点拦截并返回 `MANAGED_GATEWAY_MESSAGE`。owner 判定不得出现第二处分支。
- **AC-12**（PD-04）：语音输入在托管安装下返回明确的「STT 不可用」错误，不再静默失败或尝试 Python fallback。
- **AC-13**：进程判活不再假定 Hermes 映像为 Python（`GATEWAY_IMAGE_PREFIXES`、`profiles.ts:157` `pidIsAliveAs`），改为匹配 `hermes` 映像。
- **AC-14**（D4=a）：`Discover` 页不再出现 `source:"bundled"` 条目，provider model 列表走 curated 回退且无报错；`C:\ProgramData\SMC\Hermes\skills` 中的用户技能仍正常列出与打开。三项行为在 PRD 中已记录为「删除前即不可用」。

## Verification

| ID | 类型 | 内容 |
|---|---|---|
| V01 | STATIC | `rg` 断言 AC-01 / AC-02 零命中 |
| V02 | UNIT | `npm --prefix apps/work exec -- vitest run`。受影响测试至少含：`hermes.test.ts`、`tui-gateway-stream.test.ts`、`hermes-runtime-paths.test.ts`、`gateway-restart.test.ts`、`installer-platform`、`remote-mode-url-and-spawn`、`cronjobs`、`cronjobs-ssh`、`profiles`、`hermes-api`、`hermes-auth`、`toolset-toggle`、`skills-content-security`、`session-cache-sync`、`hermes-cli-session-id`、`buildUserContent`、`oauth-model-discovery`、`electron-security.test.ts:82` 字面量断言 |
| V03 | STATIC | `npm --prefix apps/work run guard` + `typecheck` |
| V04 | LIVE | 托管真机：启动 Work，抓主进程日志断言 AC-03 |
| V05 | LIVE | 托管真机：Chat 提交一次，断言 AC-04 |
| V06 | LIVE | 托管真机：逐项验证 AC-05 各 IPC 能力 |
| V07 | LIVE | Gateway PID 前后对比，断言 AC-06 |
| V08 | STATIC | `lat check apps/work`，断言文档同步 |
| V09 | LIVE | 托管真机触发语音输入，断言 AC-12 的显式错误（`/api/audio/transcribe` 返回 404 已在 PRD 阶段实测确认，不需重复探测） |
| V10 | LIVE | `SMC_HERMES_CONTROL_OWNER=direct` 下停掉 Gateway 后触发自恢复，断言 AC-11 经 `hermes.exe gateway` 成功；再切 `opsi` 断言被拦截 |
| V11 | LIVE | 断言 AC-14：Discover 页无 bundled 条目、provider model 走 curated 无报错、`HERMES_HOME\skills` 用户技能正常 |

V04–V07、V09–V11 需 `acceptance_contract: smc.acceptance.v1` 与真机 preflight；不得以「环境缺失」记为产品 FAIL。

## Definition of Done

```text
[x] D1 / D2 / D3 / D4 / D5 / D6 已裁定并回写
[ ] R2 评审确认 D5(b) 对父 PRD AC-07/08/09 的有界限定可接受
[ ] PRD 独立评审 R2 PASS，status → APPROVED
[ ] 单一 Plan 生成并 APPROVED（三阶段 Todo）
[ ] Roadmap RM-16 已登记为 PLANNED，Exit Criteria 含 D6 已知负债
[ ] A/B/C/D 四组清单全部完成 REPLACE/REMOVE/KEEP-rewrite（E 组按 D6 顺延）
[ ] hermes-runtime-paths.ts 10 个遗留导出 + 两个死函数已删除
[ ] installer.ts re-export block 已删除
[ ] gateway-restart.test.ts 已改写为 CLI 语义
[ ] hermes-sandbox.ps1 legacy 残留已清理
[ ] check-no-legacy-hermes-paths.mjs 已接入 guard
[ ] V01-V11 全部 FRESH PASS
[ ] lat.md / README 已同步（i18n 按 D6 顺延）
[ ] Roadmap RM-16 按实现 commit 置 DONE
```

## 非目标重申

本 PRD 不是「让 Work 再适配一层 Hermes 目录」，而是完成 v2.4 未收口的 Runtime Ownership 收敛：Work 只经 `hermes.exe` 与 `127.0.0.1:8642` 使用 Hermes，不再知道 Hermes 内部用 Python、装在哪、包结构如何、进程映像叫什么。OPSI 变更 Hermes 内部实现时，Work 不需要同步改动。
