---
work_item_id: RM-01
version: v1.1.2
status: APPROVED
review_verdict: PASS
approved_at: 2026-09-09T18:20:00+08:00
target_branch: work/prd-v4.1
source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.1.2/RM-01
grounded_commit: 6e7516bf53d9c2144453c291a8b1405d32af43a9
grounding_mode: revision
proposal_source: reports/WORK PRD v4.1.0 — Managed Hermes Runtime Ownership Closure.md
parent_prd: docs/work/PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md
roadmap: docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md
supersedes:
  - docs/work/PRD-WORK-v2.4.1-legacy-self-install-runtime-removal.md
product_version: v4.1.0
base_product_version: v4.0.1
runtime_contract: managed-local-v1
---

# WORK PRD v4.1.0 — Managed Hermes Runtime Ownership Closure

本 Stage PRD 把 `apps/work` 从「自安装 Python 源码 Runtime + Gateway 进程监护」收口为 Managed Hermes 的 **Data Plane Client**：只经绝对路径 `hermes.exe` 与 `127.0.0.1:8642` 使用 Hermes。它整体替换未批准的 `PRD-WORK-v2.4.1-legacy-self-install-runtime-removal.md`（含已废止的 D5(b)），并关闭 `PRD-WORK-v2.4` 在 P0 显式延后、且仍残留于生产路径的 Self-Install 假设。不增加 Runtime Adapter，不修改 Hermes 打包，不虚构 Gateway `/api/*`。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Proposal | `reports/WORK PRD v4.1.0 — Managed Hermes Runtime Ownership Closure.md`（叙述稿，`status: IMPLEMENTATION-READY` 非合同状态） |
| Parent architecture | `docs/work/PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md` ADR-01/02/05/07，AC-07/08/09/18 |
| Parent P0 remainder | `.cursor/plans/work_v2.4_hermes_p0_48a52a3d.plan.md` 延后 `HERMES_PYTHON` spawn；清单未覆盖 `TuiGatewayClient`、Gateway 内部自恢复、`stopGateway` |
| Repository baseline | `6e7516bf53d9c2144453c291a8b1405d32af43a9`（HEAD） |
| Freshness | `source_revision` 变更为 Roadmap RM-01 → `REGROUND_REQUIRED`。HEAD 仍为 `6e7516bf`，Inventory 复用；本轮 `revision` 只关 Review B1/M1/M2/M3 |
| Roadmap | `docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md` **RM-01 READY**。不是 Skill-First RM-13/RM-14/RM-16 |
| Revision closed | B1/M2/M3 已关。M1 残留：Windows 听口检查失败不得 fail-open READY（v1.1.1）。v1.1.2：AC-02 保留 live `HERMES_HOME` 导出，只改二阶 module snapshot |
| Runtime getters | `apps/work/src/main/runtime/hermes-runtime-config.ts`：Windows 默认 home=`C:\ProgramData\SMC\Hermes`，programRoot=`D:\Programs\SMC\Hermes`，cliPath=`...\bin\hermes.exe`，gateway=`http://127.0.0.1:8642` |
| CLI runner | `apps/work/src/main/runtime/hermes-cli-runner.ts`：`runHermesCliSync` / `runHermesCliAsync` / `spawnHermesCli` 已存在，生产 CLI 调用未统一迁入 |
| Legacy path SOT | `apps/work/src/main/runtime/hermes-runtime-paths.ts:70-104`：`HERMES_HOME`/`HERMES_REPO`/`HERMES_VENV`/`HERMES_PYTHON`/`HERMES_SCRIPT`/`HERMES_ENV_FILE`/`HERMES_CONFIG_FILE`/`HERMES_AUTH_FILE`/`installBinariesFor`/`hermesCliArgs`；另有 `looksLikeHermesHome`、`defaultHermesHome` |
| Second-order snapshots | **In（module-level）：** `profiles.ts:23` `PROFILES_DIR`；`claw3d.ts:21-25` `HERMES_OFFICE_DIR` 及同文件 pid/port 常量；`attachment-staging.ts:18` `STAGING_ROOT`；`models.ts:12-13` `MODELS_FILE`/`MODEL_DEFS_FILE`。**KEEP（函数体内 `join(HERMES_HOME, …)`）：** `account-store.ts`、`gateway-ports.ts:32`、`hermes-auth.ts`、`installer.ts` logs、`skills.ts`、`utils.ts:56` `profileHome`、`config.ts`、`config-health.ts`。live `HERMES_HOME` 导出后这些调用点无需改 import
| Source-tree cwd | `profiles.ts:296,343,368`、`cronjobs.ts:345`、`kanban.ts:129`：`join(HERMES_HOME,"hermes-agent")` |
| Chat TUI | `hermes.ts` `TuiGatewayClient` / `warmTuiGatewayClient` / `sendMessageViaTuiGateway`；`shouldUseTuiGatewayClient()` 只排除测试，不看 control owner |
| Gateway IPC refuse | `ipc/register.ts:1767-1809` local `start/stop/restart-gateway` **不看 owner**，返回 `MANAGED_GATEWAY_MESSAGE` / `false`。权威语义：`apps/work/lat.md/runtime-connection.md:49-51` — `direct` 是连 `:8642`，**从不 spawn/kill Gateway** |
| Gateway spawn 仍在 Main | `hermes.ts` `startGatewayDetailed` / `startGatewayWithRecovery`（内部自恢复多处）/ `stopGateway:3330`（无 owner gate，可读 PID 并 `SIGTERM`）/ `restartGatewayViaCli`（仅测试消费者） |
| Spawn guard 缺口 | `apps/work/scripts/check-no-work-gateway-spawn.mjs` 只扫 `register.ts` |
| Skills | `listInstalledSkills` 读 `profileHome()/skills`（`utils.ts:54-56` → `HERMES_HOME` 或 `profiles/<name>`）。`listBundledSkills` 读 `HERMES_REPO/skills`。安全白名单含 `join(HERMES_HOME,"skills")` |
| Model discovery | `model-discovery.ts:103-131` `execFile(HERMES_PYTHON)` **无 existsSync 守卫**，ENOENT → `null` → curated 回退 |
| STT | `hermes.ts` 先 POST `${getApiUrl()}/api/audio/transcribe`，404 后 `transcribeAudioViaLocalPython`（`existsSync(HERMES_PYTHON)` 失败即抛） |
| Probe contract | `runtime-contract.ts` 含 `gateway_starting` / `gateway_stopped`。`LegacyLocalRuntimeAdapter.probeLocal` 在 `/health`+auth 后直接 `ready`，**不**看监听进程、**不**看工具 cwd。`runtime-reducer.ts` 把 `CONNECT_START` 写成 `gateway_starting`（UI connecting，不是 spawn）。`messaging-platforms.ts` 的 `gateway_stopped` 是平台配置态，类型不是 `HermesRuntimeState` |
| Python leftovers beyond AC-01 v1.0 | `model-discovery.ts` `hermes_cli.models`；`hermes.ts` `tools.transcription_tools`；`hermes-agent-compat.ts` `hermes_cli.web_server`；`GATEWAY_IMAGE_PREFIXES`/`profiles.ts` pythonw 判活 |
| Live spike（本会话，非仓内 fixture） | `hermes.exe dashboard --skip-build` 因无 `hermes_cli/web_dist` 立即退出；`:8642` 仅 `/health` + `/v1/*`；`/api/audio/transcribe`、`/api/skills`、`/api/status` 均为 404 |
| Control-owner default | `control-owner.ts:64-65` 默认 `direct`；`isExternallyManagedOwner` 仅 `salt`/`opsi`。OPSI 在 readiness 失败或 `Restore-SmcControlOwner` 删除 json 时现场会回落到 `direct`，且 SYSTEM Gateway 可能已存在 |
| Out of blast radius | `apps/desktop` 有独立 `getHermesPython()` spawn，不 import `apps/work` |

## Problem and Outcome

托管安装下 Gateway `:8642` 已 healthy，但 Work 仍按 `HERMES_HOME/hermes-agent/venv/Scripts/pythonw.exe` 拉起本地 dashboard / Python CLI。启动与每次 Chat 打印 interpreter-not-found 后 fallback 到 API stream。这不是路径配错，而是第二套 Self-Install Runtime 尚未删除。

上一份 2.4.1 草稿曾把 `direct` 解释成「Work 可拥有 Gateway」。现行 lat.md 与 IPC 已否定该读法；D5(b) 废止。生产默认 `runtimeContract=managed-local-v1`，因此 **即使 `controlOwner=direct`**，「Choose Hermes directory」等 Self-Install 入口也必须不可达（当前 UI 只对 `opsi|salt` 隐藏）。v4.1.0 成功标准是五件事同时成立：Legacy Python Runtime 不存在、Work 不是 Gateway Process Owner、Managed Runtime Context 指向 ProgramData 而非 `%LOCALAPPDATA%\hermes`、Local Chat 单传输、CLI 管理能力经 `hermes.exe` 恢复。Extended dashboard 能力缺口显式登记，不通过 Python 源码树补回。

## Scope

- **In：** 删除 Self-Install 路径常量与二阶 snapshot；CLI 调用收敛到现有 `hermes-cli-runner`；删除 Local TUI/dashboard spawn 与 `dashboard-web-dist`；删除 Work 侧 Gateway start/stop/restart/recovery/PID kill 与 Python 映像假设；STT/bundled skills/provider Python discovery 改为显式不可用或 curated；Runtime probe 增加 Context 校验与 CONFLICT，去掉 supervisor 态；Managed 模式下 Self-Install UI 不可达；扩大 spawn/legacy 护栏；同步 `lat.md` / README。
- **Out：** `infra/windows/hermes-agent/**` 与 release 打包；Gateway 新增 `/api/*`；Dashboard web_dist 预置；Credential Manager / `.env` ACL（登记 `WORK-HERMES-CREDENTIAL-HARDENING`）；完整清扫 Renderer 安装文案以实现删除为目标但不阻塞：零消费者 `INSTALL_CMD*` 本 PRD REMOVE，其余按 C09 生产不可达；`apps/desktop`；`services/runtime`；Skill Run v4.0.1 track；新增 Adapter / `managed-local-v2`。
- **Production Owner：** `hermes-runtime-config.ts` 拥有路径与 endpoint；`hermes-cli-runner.ts` 拥有 CLI 调用；`RuntimeManager` + locator 拥有 probe/connect；OPSI Installer 拥有 Gateway 进程；Chat local transport 拥有 `:8642` API/SSE；Remote/SSH/OAuth dashboard 保持既有 owner。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Runtime descriptor / getters | `hermes-runtime-config.ts` | home/programRoot/cli/gateway 可解析 | EXISTS |
| Legacy path constants + `hermesCliArgs` | `hermes-runtime-paths.ts` | import 即拼 `HERMES_HOME/hermes-agent/venv` | CONFLICT |
| Module-level path snapshots | paths + `profiles`/`claw3d`/`attachment-staging`/`models` 等 | ADR-07 未关闭；禁止用 module-level `const` 再接 `getHermesHome()` | CONFLICT |
| Absolute CLI runner | `hermes-cli-runner.ts` | 已实现；多数 domain 未使用 | PARTIAL |
| Profile / cron / kanban / mcp / skills CLI / auth / backup / dump | 各 domain 模块 | `HERMES_PYTHON` + `cwd=hermes-agent` | CONFLICT |
| Local Chat TUI `/api/ws` | `TuiGatewayClient` + renderer dashboard transport | 每次尝试，托管必失败后 fallback `:8642` | CONFLICT |
| Local dashboard build | `dashboard-web-dist.ts` | 依赖不存在的 `web/` workspace | CONFLICT |
| Remote/SSH dashboard | `dashboard.ts` remote 分支 | 独立传输 | EXISTS |
| Gateway IPC refuse | `register.ts` local handlers | 无条件拒绝 start/stop/restart | EXISTS |
| Gateway process supervisor | `hermes.ts` start/stop/restart/recovery | IPC 已拒，内部路径仍 spawn/kill PID | CONFLICT |
| `direct` 语义 | lat.md + default owner | 文档：只探测不 spawn；代码默认 owner=`direct` 且内部 spawn 未关 | CONFLICT |
| Probe states | `runtime-contract.ts` + `runtime-reducer.ts` | 含 supervisor 态名；health+auth 即 ready；UI CONNECT_START 误用 `gateway_starting` | CONFLICT |
| User skills | `listInstalledSkills` via `profileHome` | 读 Hermes **数据**目录 skills | EXISTS |
| Bundled skills | `listBundledSkills` | `HERMES_REPO/skills`，托管返回空 | CONFLICT |
| Provider model Python discovery | `runProviderModelIdsPython` | ENOENT 后 curated | CONFLICT |
| STT | Gateway `/api/audio/transcribe` + Python fallback | 路由 404 且 Python 不可用 | CONFLICT |
| Managed context vs AppData hermes | 无独立校验 | `/health` 200 即可 ready；工具 cwd 可漂到 `%LOCALAPPDATA%\hermes` | MISSING |
| Self-install UI | Renderer `App.tsx` / i18n `install.ts` | 文案仍指导 `hermes-agent` 目录；可达性未在本轮做 UI 路径证明 | PARTIAL |
| Renderer `INSTALL_CMD*` | `renderer/src/constants.ts:1339-1355` | `UNIX_INSTALL_CMD` / `WINDOWS_INSTALL_CMD` / `INSTALL_CMD` 全仓零消费者 | CONFLICT |
| Spawn guard | `check-no-work-gateway-spawn.mjs` | 只覆盖 `register.ts` | PARTIAL |
| Sandbox script | `hermes-sandbox.ps1` | 排除 `hermes-agent` 拷贝但仍用其判定/PATH 清理 | PARTIAL |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Runtime paths | Existing config getters | `getHermesHome()` 为 SOT；保留 live `HERMES_HOME` 导出（禁止 `export const HERMES_HOME = getHermesHome()`）；删除 Self-Install 路径常量；禁止从 home 拼 `hermes-agent`/`venv`；只拆除二阶 module snapshot | MODIFY |
| Hermes CLI | Existing `hermes-cli-runner` | 全部管理 CLI 经绝对路径 `hermes.exe`；cwd 不是源码树 | REPLACE |
| Local Chat transport | Existing Gateway HTTP/SSE | 单主链 `:8642`；无 TUI warmup/fallback 日志 | REMOVE（TUI）+ KEEP（API） |
| Local dashboard lifecycle | — | 不 spawn、不 build web dist | REMOVE |
| Remote/SSH/OAuth dashboard | Existing owners | 行为不变 | KEEP |
| Gateway process lifecycle | OPSI / Managed Installer | Work 任何 owner（含默认 `direct`）都不 start/stop/restart/kill | REMOVE |
| Probe | Existing RuntimeManager / LegacyLocalRuntimeAdapter | 见 C05：READY / UNAVAILABLE / CONFLICT；UI connecting 不是 RuntimeState；不解析 Chat 入 Probe | MODIFY |
| User/enterprise skills | Existing skills listing | `HERMES_HOME`（及 profile）skills 继续列出 | KEEP |
| Bundled `HERMES_REPO` skills | — | 不再作为来源 | REMOVE |
| Provider catalog | Existing curated + 用户配置 | 不以 `/v1/models` 网关别名当 provider 列表 | REMOVE（Python discovery） |
| STT | Existing transcribe IPC | 明确 capability unavailable，不找 Python | REMOVE（fallback） |
| Managed Self-Install UI | Existing Renderer gates | `managed-local-v1` 或 `opsi`/`salt` 下不可达 Install/Choose folder/Create venv | MODIFY |
| Guards | Existing `guard` 链 | legacy 路径字面量 + Main 全树 Gateway lifecycle 均失败 | MODIFY |
| Extended dashboard APIs | Follow-up `WORK-HERMES-EXTENDED-API` | slash / structured tools / STT / dynamic models 不阻塞本版本 | KEEP absent |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Legacy Self-Install path API 与二阶 snapshot | REMOVE | ADR-07：home 不是 repo；snapshot 使 override 失效 |
| C02 | Domain Hermes CLI 调用 | REPLACE | 唯一 CLI owner 已是 `hermes-cli-runner`；Python `-m hermes_cli.main` 必须 REMOVE |
| C03 | Local TUI dashboard transport 与 web-dist | REMOVE | 托管 release 无 web_dist；继续尝试只产生误导日志 |
| C04 | Work Gateway process supervisor（含 `stopGateway` PID kill、内部 recovery、Python 映像判活） | REMOVE | 父 PRD AC-07/08/09 与 lat.md Direct 语义；D5(b) 废止 |
| C05 | Probe 合同与 Renderer 连接态 | MODIFY | 删除 supervisor 态；冻结只读 Probe 输入与 CONFLICT；UI connecting 不得表示 Work 正在 start Gateway；不新增 Adapter |
| C06 | STT Python fallback | REMOVE | `/api/audio/transcribe` 不在 `:8642`；当前已不可用，改为显式错误 |
| C07 | Provider Python model discovery | REMOVE | `/v1/models` 仅为网关别名；保留 curated |
| C08 | Bundled `HERMES_REPO` skills | REMOVE | 用户 skills 仍走数据目录 |
| C09 | Managed Self-Install UI 可达性 | MODIFY | 可达文案须生产不可达。零消费者的 `INSTALL_CMD*` 直接 REMOVE，不按「源码可留」处理 |
| C10 | CI guards | MODIFY | 现有 spawn 护栏范围不足；需覆盖 legacy 字面量与 `src/main` lifecycle |
| C11 | Remote/SSH/OAuth / Skill Run / Installer 打包 | KEEP | 非本能力 |

## Replacement / Removal Matrix

| Replaced Production Path | Existing Owner | Target Path | Removal Condition |
|---|---|---|---|
| `HERMES_PYTHON` + `hermesCliArgs` + `cwd=HERMES_HOME/hermes-agent` | 各 domain 模块 | `hermes-cli-runner` 绝对路径 `hermes.exe` | 本 PRD 实现合入后生产零调用；常量删除 |
| Local `TuiGatewayClient` / `sendMessageViaTuiGateway` / `dashboard-web-dist` | `hermes.ts` + dashboard | Local Chat 只走 `getGatewayBaseUrl()` API/SSE | 同 commit 删除 spawn 与 fallback 文案 |
| `startGateway*` / `stopGateway` / `restartGateway*` / PID `SIGTERM` | `hermes.ts` | OPSI `SMC Hermes Gateway` 计划任务 | 同 commit 删除实现；IPC 继续拒绝；内部 recovery 改为 UNAVAILABLE |
| `runProviderModelIdsPython` | `model-discovery.ts` | curated + 用户已配置模型 | 同 commit 删除 Python helper |
| `transcribeAudioViaLocalPython` | `hermes.ts` | 显式 STT unavailable | 同 commit；不以 Python 或虚构 `/api` 补回 |
| `listBundledSkills` → `HERMES_REPO/skills` | `skills.ts` | 仅数据目录 installed skills | 同 commit；Discover 不再出现 `source=bundled` |
| Probe `gateway_starting`/`gateway_stopped` 作为 Work 拥有进程的语义；health-only READY | Runtime contract + reducer | READY / UNAVAILABLE / CONFLICT + UI `connecting` 布尔 | 同 commit；Messaging platform 字符串 `gateway_stopped` **不是**被替换路径 |

无当前消费者的兼容面（`installBinariesFor`、`installer.ts` 路径 re-export、`restartGatewayViaCli`/`restartGatewayViaCliOnce` 仅测试、`looksLikeHermesHome`、Renderer `INSTALL_CMD*`）直接 REMOVE，不保留 shell。`tests/gateway-restart.test.ts` 不得改写成第二套 restart owner。

## Compatibility Contract

- **Remote / SSH / remote OAuth dashboard：** 当前消费者为远程连接用户。本 PRD 不改其 transport。关闭条件：独立 Remote PRD，不在本 Roadmap RM-01。
- **Renderer Self-Install 文案源码：** `INSTALL_CMD*` 零消费者 → 本 PRD REMOVE。其余 `App.tsx` / i18n 安装向导：若托管布局下不可达则本 PRD REMOVE；若仍可达则仅允许源码暂留且必须被 C09 门禁挡住。完整删除不另立模糊「随 P1 一并处理」。
- **Extended Hermes UI（slash、structured tools、STT、dynamic provider catalog、bundled catalog）：** 当前在托管安装下已不可用。不设兼容层。恢复条件：独立 `WORK-HERMES-EXTENDED-API`，且必须走稳定 Gateway/Contract，禁止 Python 源码树。
- **`.env` ACL / API_SERVER_KEY 暴露：** 不阻塞本 PRD。登记 `WORK-HERMES-CREDENTIAL-HARDENING`。
- **禁止：** `direct` 默认模式保留 Work 拉起 Gateway；`SMC_WORK_OWNS_GATEWAY` 之类非默认开关除非另立有界契约（本 PRD 不引入）。

- **开发机：** Main Process 同样不得 spawn Gateway。开发用独立 CLI / Dev Launcher 启动 Gateway，不引入 `SMC_WORK_OWNS_GATEWAY`。
- **Messaging 平台态 `gateway_stopped`：** 表示平台已启用但 Gateway 未运行的配置态，不是 `HermesRuntimeState`。C05 不得改其语义。

## C05 Probe 行为冻结

不新增 Adapter、不新增 HTTP 合同、不把 Chat 文本解析进 Probe。Owner 仍是现有 RuntimeManager / LegacyLocalRuntimeAdapter。

### 只读输入

1. **Locator 期望值**（已有）：`homePath`、`executablePath`、`endpoint`。
2. **Gateway `/health` + authentication**（已有）。
3. **配置端口上的监听进程映像**（只读 OS 诊断，归同一 Probe Owner）：OwningProcess 的可执行路径。禁止对 PID 发信号。

Windows 托管（本 PRD 生产验收面）：听口检查是 READY 的硬门，失败不得当作「未观察」而放行。非 Windows 不作为 CONFLICT / 听口硬门的必测面。

Chat 回报的 `HERMES_HOME` / `TERMINAL_CWD` **不是** Probe 输入（见 AC-12）。

### 可观察状态

| 状态 | 何时 | Work 行为 |
|---|---|---|
| UNAVAILABLE | `/health` 失败或 auth 失败（含 connection refused / timeout） | 显示不可用；允许 retry/reconnect；**禁止** start Gateway |
| CONFLICT | 配置端口上存在监听，且其可执行路径 ≠ Locator `executablePath`（期望 `getHermesCliPath()`） | **不得**报告 READY；**禁止** kill/stop 该 PID；提示所有权冲突，修复属 OPSI/Installer |
| configuration_error（或等价非 READY） | **Windows 托管：** 听口检查失败（权限/API 错误、无法解析 OwningProcess 可执行路径）；或 health 成功但检查结果为「无监听」 | **不得**报告 READY；**禁止**把检查失败解释为「跳过听口」；不 start/kill Gateway |
| READY（Windows 托管） | health 成功 **且** auth 成功 **且** 听口检查**成功完成** **且** 监听可执行路径 = 期望 CLI **且** Locator `homePath` 不是 `%LOCALAPPDATA%\hermes` | 允许 Chat / CLI |
| READY（非 Windows） | health 成功 **且** auth 成功 **且** Locator `homePath` 不是 `%LOCALAPPDATA%\hermes` | 允许 Chat / CLI；听口不是本 PRD 必测面 |
| runtime_missing / runtime_invalid / configuration_error | Locator 既有失败 | 保持；不是 CONFLICT |

`/health=200` 单独不得等于 READY。

`runtimeContextVerified`（Windows 托管）仅在听口检查**成功完成**且 Locator home + CLI 路径 + 监听映像均核对后为真。听口检查失败时该标志不得为真。它 **不** 证明 Agent 工具 cwd。若 AC-12 LIVE 发现 `TERMINAL_CWD`/`HERMES_HOME` 落入 AppData，而 Probe 已 READY：判定为 **Installer defect**，阻断本 Work 实施，禁止用 Python Runtime 或改 Probe 去“猜”进程环境。

### Renderer 连接态（M3）

- `HermesRuntimeState` **删除** `gateway_starting`、`gateway_stopped`（监护语义）。
- Renderer 已有 `connecting` 布尔值；`CONNECT_START` / Retry 只表示正在探测，**不得**把 RuntimeState 设为 starting/recovering，也不得暗示 Work 正在拉起 Gateway。
- 连接中的可观察表现：connecting=true，上次 Probe 态保持或显示 UNAVAILABLE，直到新 Probe 返回。
- 既有 `runtime_missing` / `runtime_invalid` / `gateway_unreachable` / `gateway_auth_failed` / `configuration_error` / `ready` 可保留；UNAVAILABLE 可映射到 `gateway_unreachable` 的可观察含义，不必再发明第三套 Adapter。
- 增加可观察 `conflict`（名称由 Plan 绑定到既有 errorCode 或新 state 字面量，但必须能与 UNAVAILABLE 区分）。

## Contract and Security Boundary

- Work 不安装、不升级、不修复 Hermes，不注册计划任务。
- Work 不对非自身 spawn 的 PID 发信号；诊断 `:8642` 监听只读。
- CLI 使用 `getHermesCliPath()`，不依赖用户 PATH。
- Renderer 不得成为 Runtime SoT；不得为放行 install/spawn 自报 owner。
- 不得把 `:8642 /health=200` 单独映射为 READY。Windows 托管下听口检查失败也不得映射为 READY。
- 不得新增 Runtime Adapter 或 `managed-local-v2`。
- Control Plane 失败不得主动杀掉已运行 Data Plane（停 Work 不得停 SYSTEM Gateway）。

## Acceptance Criteria

- **AC-01**: `apps/work/src/main` 与 `apps/work/scripts` 生产代码不得再假设 Hermes Python Source Runtime。可观察禁令（不绑死某一正则实现）包括：不得调用 `pythonw` / Hermes venv 解释器；不得 `python -m` / `-c` 执行 `hermes_cli.*`（含 `hermes_cli.main`、`hermes_cli.models`、`hermes_cli.web_server`）或 `tools.transcription_tools`；不得出现 `hermes-agent/venv`、`hermes_cli/web_dist`、`HERMES_REPO`、`HERMES_VENV`、`HERMES_PYTHON`；不得从 `getHermesHome()` 拼接 `hermes-agent`/`venv`。测试夹具若保留历史字面量不得进入生产图。
- **AC-02**: `hermes-runtime-paths.ts` 删除 Self-Install 路径导出：`HERMES_PYTHON` / `HERMES_REPO` / `HERMES_VENV` / `HERMES_SCRIPT` / `HERMES_ENV_FILE` / `HERMES_CONFIG_FILE` / `HERMES_AUTH_FILE` / `hermesCliArgs` / `installBinariesFor` / `looksLikeHermesHome` / `defaultHermesHome`。**保留** `HERMES_HOME` 导出，且禁止 `export const HERMES_HOME = getHermesHome()`；该绑定必须 live，经本模块读取时等于当时的 `getHermesHome()`。`installer.ts` 不再 re-export 上述 Self-Install 符号（可继续 re-export live `HERMES_HOME` / `getEnhancedPath` / `setHermesHomeOverride`）。二阶 module snapshot **只**转换 `STAGING_ROOT`、`PROFILES_DIR`、`MODELS_FILE`/`MODEL_DEFS_FILE`、`HERMES_OFFICE_DIR`（及 `claw3d.ts` 内其余顶层 `join(HERMES_HOME, …)` 常量）。函数体内 `join(HERMES_HOME, …)` KEEP。
- **AC-03**: 所有 Hermes CLI 管理操作经 `hermes-cli-runner`；domain 模块不直接 spawn `python`/`pythonw`/`hermes`。
- **AC-04**: `apps/work/src/main` 无生产可达 Gateway start/stop/restart/recovery；Work 退出后 Managed Gateway PID 不变；`direct` 与 `opsi` 均不得自行 start。
- **AC-05**: 托管真机启动日志不含 `Python interpreter not found`、dashboard warmup failed、web dist recovery。
- **AC-06**: 托管真机 Chat 成功；日志不含 `Hermes gateway stream unavailable; falling back to API stream`。
- **AC-07**: 本地托管下 profile list/create/use/delete 经 `hermes.exe` 成功。
- **AC-08**: 本地托管下当前 UI 可达的 cron / kanban / mcp 操作成功。
- **AC-09**: `HERMES_HOME\skills`（及 profile skills）正常列出；skill install 经 CLI 成功；无 `source=bundled`。
- **AC-10**: Provider Python discovery 不存在；curated/用户配置模型可用；`/v1/models` 别名不污染 provider catalog。
- **AC-11**: 本地 STT 返回明确 capability unavailable；不寻找 Python/venv。
- **AC-12**: 真机 Agent 工具 runtime 的 `HERMES_HOME` 与 `TERMINAL_CWD` 为 Managed 数据目录与 `workspace`，不进入 `%LOCALAPPDATA%\hermes`。
- **AC-13**: 生产默认 `managed-local-v1` 下（含 `controlOwner=direct`）以及 `controlOwner=opsi` 或 `salt` 时，用户不能进入 Install Hermes / Choose Hermes directory / Create venv。Retry 只做 Probe，不打开 Self-Install。
- **AC-14**: 用户 PATH 去掉 Hermes 后 CLI 能力仍可用。
- **AC-15**: 停掉 Managed Gateway 后 Work 为 UNAVAILABLE 且不 start Gateway。Retry/Reconnect 期间 UI 可为 connecting，RuntimeState 不得变为 starting Gateway。
- **AC-16**: 外部恢复 Gateway 后 Work retry 到 READY，无需重启 Work。
- **AC-17**: 关闭 Work 后 Managed Gateway 仍存活。
- **AC-18**: remote / SSH / remote OAuth dashboard 行为不回归。
- **AC-19**: `npm --prefix apps/work run guard` 对重新引入 Python Runtime、Source Runtime、Gateway spawn 失败。
- **AC-20**: typecheck、focused unit、`lat check apps/work` 通过。
- **AC-21**: Windows 托管：配置端口听口检查必须成功完成才能 READY。可执行路径 ≠ 期望 `hermes.exe` → CONFLICT，不 kill。听口检查失败（无法读取 OwningProcess / 无法解析映像）或 health 成功但无本地监听 → 非 READY（UNAVAILABLE 或 `configuration_error`），**禁止**当作未观察而放行。Messaging 平台配置态不因此改名。


## Definition of Done

- **DOD-01**: AC-01 through AC-21 blocking Acceptance Claims PASS; no blocking FAIL deferred to a later Roadmap Item.
- **DOD-02**: Production apps/work Main/scripts have no Hermes Python Source Runtime and no Work Gateway process lifecycle.
- **DOD-03**: lat.md and README match the Data Plane Client contract; follow-up debts remain registered not implemented.
- **DOD-04**: Implementation commit does not include Runtime Roadmap DONE; Roadmap status updates separately after evidence.

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| AC-01 | 无 Hermes Python/source Runtime | 生产 main/scripts 无 venv、pythonw、`hermes_cli.*`、transcription_tools、HERMES_REPO/VENV/PYTHON | 是 | 源码仍有 hermes_cli.models / web_server / transcription_tools | FAILED | NEW_EVIDENCE | Review M2 扩禁令 |
| AC-02 | live HERMES_HOME；无 Self-Install 路径导出；无二阶 module snapshot | 导出集与 named snapshot 消失 | 是 | 源码存在 snapshot 与 PYTHON 导出 | FAILED（现状） | NEW_EVIDENCE | 实现后必须重证 |
| AC-03 | CLI 单 owner | 无 domain spawn python | 是 | 多文件仍 spawn | FAILED | NEW_EVIDENCE | |
| AC-04 | Work 无 Gateway lifecycle | 无 start/stop/kill；PID 不变 | 是 | IPC 已拒但 Main 仍 stop/start | FAILED | NEW_EVIDENCE | 含 `stopGateway` |
| AC-05 | 启动无 Python/TUI 日志 | 主进程日志 | 是 | 现场已观测 FAIL | FAILED | TARGETED_RERUN | 实现必须消灭该日志 |
| AC-06 | Chat 单传输成功 | 响应且无 fallback 日志 | 是 | 现场 Chat 能走 API 但打 fallback | FAILED（日志） | TARGETED_RERUN | |
| AC-07 | profile CLI | 真机 CRUD | 是 | 现状走 Python cwd | FAILED | NEW_EVIDENCE | |
| AC-08 | cron/kanban/mcp | 真机可达操作 | 是 | 同上 | FAILED | NEW_EVIDENCE | |
| AC-09 | skills 数据目录 | 列表+install；无 bundled | 是 | `listInstalledSkills` 已指向 home | PARTIAL | TARGETED_RERUN | bundled 删除不得误伤 installed |
| AC-10 | 无 Python model discovery | curated 可用 | 是 | ENOENT 已回退 curated | PARTIAL | NEW_EVIDENCE | 删除 helper 后须仍可用 |
| AC-11 | STT 显式不可用 | 明确错误 | 是 | 404+Python throw | FAILED | NEW_EVIDENCE | |
| AC-12 | Managed context | HERMES_HOME/TERMINAL_CWD | 是 | 现场曾见 AppData hermes | FAILED | NEW_EVIDENCE | |
| AC-13 | Self-install 不可达 | managed-local-v1 含 direct 无 Choose folder | 是 | 仅 opsi/salt 隐藏入口 | FAILED（现状） | NEW_EVIDENCE | 默认合同已是 managed-local-v1 |
| AC-14 | PATH 独立 | 去 PATH 后 CLI 成功 | 是 | runner 已用绝对路径 | NOT_TESTED | NEW_EVIDENCE | |
| AC-15 | Gateway down → UNAVAILABLE | 不 spawn；connecting ≠ starting | 是 | 内部 recovery 仍可能 spawn | FAILED | NEW_EVIDENCE | |
| AC-16 | 外部恢复 → READY | retry 无需重启 Work | 是 | 无正式证据 | NOT_TESTED | NEW_EVIDENCE | |
| AC-17 | Work exit Gateway 存活 | PID | 是 | 父 PRD 要求；`stopGateway` 风险 | NOT_TESTED | NEW_EVIDENCE | |
| AC-18 | remote/SSH | 既有测试 | 是 | 既有测试套件 | PROVEN_BUT_AFFECTED | TARGETED_RERUN | dashboard.ts local 删除可能误伤 |
| AC-19 | guard | guard FAIL on reintro | 是 | spawn 护栏仅 register.ts | PARTIAL | NEW_EVIDENCE | |
| AC-20 | typecheck/unit/lat | 命令 PASS | 是 | 无本范围证据 | NOT_TESTED | NEW_EVIDENCE | |
| AC-21 | Windows 听口硬门 | 检查成功且 exe 匹配才 READY；失败或错误 exe 均非 READY；不 kill | 是 | Probe 现只看 health+auth；v1.1.0 READY 含「若能观察」fail-open | FAILED（合同缺口） | NEW_EVIDENCE | Review M1 residual fail-closed |

禁止把 AC-05/AC-06 的现场 FAIL 改写成 observation 后 closure。

## Non-Goals / Follow-ups

- `WORK-HERMES-EXTENDED-API`：slash、structured tool events、STT、dynamic provider catalog、dashboard session API。
- `WORK-HERMES-CREDENTIAL-HARDENING`：`.env` ACL、DPAPI、secret injection。
- Installer defect：若 LIVE 证明 `TERMINAL_CWD` 错误来自 Installer，**阻断**本 Work 实施并单独立项，禁止在本 PRD 改 `infra/windows/hermes-agent`。

## Rollback

不允许把 Python Runtime / TUI / Work Gateway Supervisor 作为正式 rollback。P0 则回滚整个 `apps/work` 至 v4.0.1；Managed Installer 不回滚。禁止部分恢复形成第三种混合状态。
