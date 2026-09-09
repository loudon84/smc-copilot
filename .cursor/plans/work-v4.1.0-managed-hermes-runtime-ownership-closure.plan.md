---
name: Work v4.1.0 Managed Hermes Runtime Ownership Closure
overview: Remove Work Self-Install Python runtime and Gateway process ownership so apps/work is only a managed Hermes data-plane client.
todos:
  - id: t1-path-api-and-cli-convergence
    content: "T1 — Path API and CLI convergence [C01, C02, C08]"
    status: completed
  - id: t2-remove-tui-dashboard-gateway-supervisor
    content: "T2 — Remove local TUI, dashboard dist, and Gateway supervisor [C03, C04, C06]"
    status: completed
  - id: t3-probe-listen-inspect-connecting
    content: "T3 — Probe contract, listen inspect, and connecting state [C05]"
    status: completed
  - id: t4-remove-provider-python-model-discovery
    content: "T4 — Remove provider Python model discovery [C07]"
    status: completed
  - id: t5-managed-self-install-ui-unreachable
    content: "T5 — Managed Self-Install UI unreachable [C09]"
    status: completed
  - id: t6-guards-sandbox-and-contract-docs
    content: "T6 — Guards, sandbox, and contract docs [C10]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-V4.1.0-RUNTIME-RM-01
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.1.2/RM-01
grounded_commit: 6e7516bf53d9c2144453c291a8b1405d32af43a9
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.1.0 Managed Hermes Runtime Ownership Closure Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md)

## Scope

- In: Delete Self-Install path constants (not live `HERMES_HOME`); convert second-order **module** snapshots only; route Hermes CLI through existing `hermes-cli-runner`; remove local TUI/dashboard spawn and web-dist; remove Work Gateway start/stop/restart/recovery/PID kill; STT and bundled-skills and provider Python discovery become explicit unavailable or curated; probe READY requires Windows listen inspect fail-closed; managed-local-v1 Self-Install UI unreachable including `direct`; expand guards; sync lat.md (`runtime-connection.md`, `model-selection.md`) / README.
- Out: Hermes installer/packaging; new Gateway `/api/*`; Credential/DPAPI; Skill Run track; `apps/desktop`; new Runtime Adapter; `SMC_WORK_OWNS_GATEWAY`.
- Production Owner inherited from PRD: `hermes-runtime-config.ts` owns paths/endpoint; `hermes-cli-runner.ts` owns CLI; RuntimeManager/LegacyLocalRuntimeAdapter owns probe; OPSI owns Gateway process; local Chat owns `:8642` HTTP/SSE; remote/SSH/OAuth dashboard keep current owners.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/runtime/hermes-runtime-paths.ts#HERMES_PYTHON` | module snapshot `export const HERMES_HOME = getHermesHome()` plus Self-Install `HERMES_REPO`/`HERMES_VENV`/`HERMES_PYTHON`/`hermesCliArgs`; installer re-exports those symbols; second-order module `join(HERMES_HOME, ...)` | `export const HERMES_PYTHON`; `PROFILES_DIR`; `STAGING_ROOT`; `MODELS_FILE`; `HERMES_OFFICE_DIR` | installer (Self-Install re-exports), profiles, claw3d, attachment-staging, models | KEEP live `HERMES_HOME`; REMOVE Self-Install exports; convert named module snapshots only | PASS |
| C02 | `apps/work/src/main/profiles.ts#listProfiles` | domain modules `execFile(HERMES_PYTHON)` with `cwd=hermes-agent`; installer Python spawn | `listProfiles`; `listCronJobs`; `listBoards`; `listMcpServers`; `installSkill`; `runHermesAuthLogin`; `runHermesDump` | renderer IPC domain handlers | REUSE_EXISTING `runHermesCliSync`/`runHermesCliAsync`/`spawnHermesCli`; cwd already `getHermesProgramRoot()` | PASS |
| C03 | `apps/work/src/main/hermes.ts#warmTuiGatewayClient` | TUI warmup on every local chat; `dashboard-web-dist.ts` builds missing web workspace; `lat.md/model-selection.md` still documents Python CLI session-override fallback | `warmTuiGatewayClient`; `ensureLocalDashboardWebDist`; `startDashboard`; `ensureLocalDashboardCompatibility`; `lat.md` heading `Text-only legacy fallback routes via CLI` | `shouldUseTuiGatewayClient`; `hermes.test.ts` `@lat` on that heading | REMOVE_ONLY local TUI/web-dist; KEEP remote dashboard helpers; MODIFY lat.md CLI-fallback section in place (keep heading) | PASS |
| C04 | `apps/work/src/main/hermes.ts#startGatewayWithRecovery` | IPC refuses lifecycle; Main still spawn/kill via recovery and `stopGateway` | `startGatewayDetailed`; `stopGateway`; `startGatewayWithRecovery` | chat/STT call sites | REMOVE_ONLY; `LegacyLocalRuntimeAdapter.restart` already refuses | PASS |
| C05 | `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal` | health+auth => `ready`; reducer maps CONNECT_START to `gateway_starting` | `probeLocal`; `HermesRuntimeState`; `runtimeReducer`; `probeGatewayHealth` | RuntimeManager logs probe; RuntimePane Retry | MODIFY_EXISTING probe + HTTP helpers; listen inspect in same probe owner; no new Adapter | PASS |
| C06 | `apps/work/src/main/hermes.ts#transcribeAudio` | `/api/audio/transcribe` then `transcribeAudioViaLocalPython` | `transcribeAudio`; `transcribeAudioViaLocalPython` | renderer voice IPC | stop after HTTP failure with explicit unavailable; do not add `/api` | PASS |
| C07 | `apps/work/src/main/model-discovery.ts#runProviderModelIdsPython` | `execFile(HERMES_PYTHON)` ENOENT then curated | `runProviderModelIdsPython` | `discoverProviderModels` | REMOVE helper; KEEP curated lists | PASS |
| C08 | `apps/work/src/main/skills.ts#listBundledSkills` | reads `HERMES_REPO/skills`; UI `source=bundled` | `listBundledSkills`; `listInstalledSkills` already uses `profileHome` | Discover/Skills renderer | REMOVE bundled; KEEP installed listing | PASS |
| C09 | `apps/work/src/renderer/src/components/settings/RuntimePane.tsx#RuntimePane` | Choose folder hidden only for opsi/salt; default contract is `managed-local-v1` | `RuntimePane`; `ConnectionErrorScreen`; `INSTALL_CMD` | Settings runtime section; connection error | MODIFY gate to contract+owner; REMOVE zero-consumer `INSTALL_CMD*` | PASS |
| C10 | `apps/work/scripts/check-no-work-gateway-spawn.mjs` | scans only `register.ts` | file header invariant `MANAGED_GATEWAY_MESSAGE` | `package.json` `guard` | MODIFY spawn scan to `src/main`; ADD generated legacy-runtime guard; sandbox.ps1 MODIFY | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | `apps/work/src/main` 与 `apps/work/scripts` 生产代码不得再假设 Hermes Python Source Runtime。可观察禁令（不绑死某一正则实现）包括：不得调用 `pythonw` / Hermes venv 解释器；不得 `python -m` / `-c` 执行 `hermes_cli.*`（含 `hermes_cli.main`、`hermes_cli.models`、`hermes_cli.web_server`）或 `tools.transcription_tools`；不得出现 `hermes-agent/venv`、`hermes_cli/web_dist`、`HERMES_REPO`、`HERMES_VENV`、`HERMES_PYTHON`；不得从 `getHermesHome()` 拼接 `hermes-agent`/`venv`。测试夹具若保留历史字面量不得进入生产图。 | BEHAVIOR | C01, C02, C03, C06, C07, C08, C10 | T1, T2, T4, T6 | V01, V03 | UNIT | yes |
| AC-02 | AC | `hermes-runtime-paths.ts` 删除 Self-Install 路径导出：`HERMES_PYTHON` / `HERMES_REPO` / `HERMES_VENV` / `HERMES_SCRIPT` / `HERMES_ENV_FILE` / `HERMES_CONFIG_FILE` / `HERMES_AUTH_FILE` / `hermesCliArgs` / `installBinariesFor` / `looksLikeHermesHome` / `defaultHermesHome`。**保留** `HERMES_HOME` 导出，且禁止 `export const HERMES_HOME = getHermesHome()`；该绑定必须 live，经本模块读取时等于当时的 `getHermesHome()`。`installer.ts` 不再 re-export 上述 Self-Install 符号（可继续 re-export live `HERMES_HOME` / `getEnhancedPath` / `setHermesHomeOverride`）。二阶 module snapshot **只**转换 `STAGING_ROOT`、`PROFILES_DIR`、`MODELS_FILE`/`MODEL_DEFS_FILE`、`HERMES_OFFICE_DIR`（及 `claw3d.ts` 内其余顶层 `join(HERMES_HOME, …)` 常量）。函数体内 `join(HERMES_HOME, …)` KEEP。 | BEHAVIOR | C01 | T1 | V01 | UNIT | yes |
| AC-03 | AC | 所有 Hermes CLI 管理操作经 `hermes-cli-runner`；domain 模块不直接 spawn `python`/`pythonw`/`hermes`。 | BEHAVIOR | C02 | T1 | V02 | UNIT | yes |
| AC-04 | AC | `apps/work/src/main` 无生产可达 Gateway start/stop/restart/recovery；Work 退出后 Managed Gateway PID 不变；`direct` 与 `opsi` 均不得自行 start。 | LIFECYCLE | C04 | T2 | V03, V10 | UNIT | yes |
| AC-05 | AC | 托管真机启动日志不含 `Python interpreter not found`、dashboard warmup failed、web dist recovery。 | BEHAVIOR | C03 | T2 | V04 | UNIT | yes |
| AC-06 | AC | 托管真机 Chat 成功；日志不含 `Hermes gateway stream unavailable; falling back to API stream`。 | BEHAVIOR | C03 | T2 | V04 | UNIT | yes |
| AC-07 | AC | 本地托管下 profile list/create/use/delete 经 `hermes.exe` 成功。 | BEHAVIOR | C02 | T1 | V05 | UNIT | yes |
| AC-08 | AC | 本地托管下当前 UI 可达的 cron / kanban / mcp 操作成功。 | BEHAVIOR | C02 | T1 | V05 | UNIT | yes |
| AC-09 | AC | `HERMES_HOME\skills`（及 profile skills）正常列出；skill install 经 CLI 成功；无 `source=bundled`。 | BEHAVIOR | C02, C08 | T1 | V05 | UNIT | yes |
| AC-10 | AC | Provider Python discovery 不存在；curated/用户配置模型可用；`/v1/models` 别名不污染 provider catalog。 | BEHAVIOR | C07 | T4 | V06 | UNIT | yes |
| AC-11 | AC | 本地 STT 返回明确 capability unavailable；不寻找 Python/venv。 | BEHAVIOR | C06 | T2 | V07 | UNIT | yes |
| AC-12 | AC | 真机 Agent 工具 runtime 的 `HERMES_HOME` 与 `TERMINAL_CWD` 为 Managed 数据目录与 `workspace`，不进入 `%LOCALAPPDATA%\hermes`。 | BEHAVIOR | C05 | T3 | V08 | UNIT | yes |
| AC-13 | AC | 生产默认 `managed-local-v1` 下（含 `controlOwner=direct`）以及 `controlOwner=opsi` 或 `salt` 时，用户不能进入 Install Hermes / Choose Hermes directory / Create venv。Retry 只做 Probe，不打开 Self-Install。 | BEHAVIOR | C09 | T5 | V09 | UNIT | yes |
| AC-14 | AC | 用户 PATH 去掉 Hermes 后 CLI 能力仍可用。 | BEHAVIOR | C02 | T1 | V05 | UNIT | yes |
| AC-15 | AC | 停掉 Managed Gateway 后 Work 为 UNAVAILABLE 且不 start Gateway。Retry/Reconnect 期间 UI 可为 connecting，RuntimeState 不得变为 starting Gateway。 | LIFECYCLE | C04, C05 | T2, T3 | V10 | UNIT | yes |
| AC-16 | AC | 外部恢复 Gateway 后 Work retry 到 READY，无需重启 Work。 | LIFECYCLE | C05 | T3 | V10 | UNIT | yes |
| AC-17 | AC | 关闭 Work 后 Managed Gateway 仍存活。 | LIFECYCLE | C04 | T2 | V10 | UNIT | yes |
| AC-18 | AC | remote / SSH / remote OAuth dashboard 行为不回归。 | SCOPE | C03, C11 | T2 | V11 | UNIT | yes |
| AC-19 | AC | `npm --prefix apps/work run guard` 对重新引入 Python Runtime、Source Runtime、Gateway spawn 失败。 | BEHAVIOR | C10 | T6 | V03 | UNIT | yes |
| AC-20 | AC | typecheck、focused unit、`lat check apps/work` 通过。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07, C08, C09, C10 | T1, T2, T3, T4, T5, T6 | V12 | UNIT | yes |
| AC-21 | AC | Windows 托管：配置端口听口检查必须成功完成才能 READY。可执行路径 ≠ 期望 `hermes.exe` → CONFLICT，不 kill。听口检查失败（无法读取 OwningProcess / 无法解析映像）或 health 成功但无本地监听 → 非 READY（UNAVAILABLE 或 `configuration_error`），**禁止**当作未观察而放行。Messaging 平台配置态不因此改名。 | LIFECYCLE | C05 | T3 | V13 | UNIT | yes |
| DOD-01 | DOD | AC-01 through AC-21 blocking Acceptance Claims PASS; no blocking FAIL deferred to a later Roadmap Item. | EVIDENCE | C01, C02, C03, C04, C05, C06, C07, C08, C09, C10 | T1, T2, T3, T4, T5, T6 | V01, V02, V03, V04, V05, V06, V07, V08, V09, V10, V11, V12, V13 | UNIT | yes |
| DOD-02 | DOD | Production apps/work Main/scripts have no Hermes Python Source Runtime and no Work Gateway process lifecycle. | BEHAVIOR | C01, C04 | T1, T2, T6 | V01, V03 | UNIT | yes |
| DOD-03 | DOD | lat.md and README match the Data Plane Client contract; follow-up debts remain registered not implemented. | OPERATIONS | C03, C10 | T2, T6 | V12 | DOCUMENT_SEMANTIC | yes |
| DOD-04 | DOD | Implementation commit does not include Runtime Roadmap DONE; Roadmap status updates separately after evidence. | OPERATIONS | C10 | T6 | V12 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Local connect | AC-15, AC-16, AC-21 | Work start / Retry | connecting boolean true; last probe unchanged | `probeLocal` READY | `probeLocal` UNAVAILABLE / CONFLICT / configuration_error; never startGateway | V10, V13 |
| Chat send | AC-06 | user submit | existing stream in flight | Gateway HTTP/SSE | explicit error; no TUI fallback; no recovery spawn | V04 |
| Gateway down/up | AC-04, AC-15, AC-16, AC-17 | stop/start Managed task; Work exit | UNAVAILABLE while down | probe READY after external recover | no Work PID signal | V03, V10 |
| STT | AC-11 | voice input | no in-flight STT session | transcribeAudio has no success path | transcribeAudio explicit unavailable | V07 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Probe | AC-15, AC-21 | `probeLocal` | `HermesRuntimeProbe` IPC | Renderer runtime store | state, endpoint, homePath, executablePath, gatewayHealthy, authenticated | LegacyLocalRuntimeAdapter | inspect fail => not READY; wrong exe => conflict | retry = re-probe only | V10, V13 |
| Chat | AC-06 | Chat Main | Gateway `/v1/chat/completions` SSE | Renderer transcript | endpoint from `getGatewayBaseUrl` | existing Chat owner | no TUI; no startGatewayWithRecovery | existing request abort | V04 |
| CLI | AC-03, AC-07, AC-14 | domain modules | `runHermesCli*` argv | hermes.exe | absolute `getHermesCliPath()` | hermes-cli-runner | missing cli => empty/error, no python | command+args | V02, V05 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | production main/scripts have no hermes_cli.*/pythonw/venv/HERMES_PYTHON | yes | source still contains leftovers | FAILED | NEW_EVIDENCE | - | V01 |
| CLM-02 | AC-02 | live HERMES_HOME; no Self-Install path exports; named module snapshots gone | yes | snapshots and PYTHON export exist | FAILED | NEW_EVIDENCE | - | V01 |
| CLM-03 | AC-03 | no domain spawn python/hermes | yes | domain execFile HERMES_PYTHON | FAILED | NEW_EVIDENCE | - | V02 |
| CLM-04 | AC-04 | no start/stop/kill Gateway | yes | stopGateway/startGatewayWithRecovery exist | FAILED | NEW_EVIDENCE | - | V03 |
| CLM-05 | AC-05 | no Python/TUI logs | yes | live FAIL this session | FAILED | TARGETED_RERUN | previous live log strings must disappear after TUI/Python removal | V04 |
| CLM-06 | AC-06 | chat OK without fallback log | yes | live FAIL log | FAILED | TARGETED_RERUN | previous TUI fallback log must disappear | V04 |
| CLM-07 | AC-07 | profile CRUD via hermes.exe | yes | python cwd | FAILED | NEW_EVIDENCE | - | V05 |
| CLM-08 | AC-08 | cron/kanban/mcp reachable ops | yes | python cwd | FAILED | NEW_EVIDENCE | - | V05 |
| CLM-09 | AC-09 | installed skills; no bundled | yes | listInstalledSkills OK; bundled still present | FAILED | NEW_EVIDENCE | - | V05 |
| CLM-10 | AC-10 | no Python discovery; curated OK | yes | ENOENT fallback | FAILED | NEW_EVIDENCE | - | V06 |
| CLM-11 | AC-11 | STT explicit unavailable | yes | 404+Python throw | FAILED | NEW_EVIDENCE | - | V07 |
| CLM-12 | AC-12 | managed HERMES_HOME/TERMINAL_CWD | yes | AppData incident | FAILED | NEW_EVIDENCE | - | V08 |
| CLM-13 | AC-13 | no Choose folder on managed-local-v1 | yes | hidden only opsi/salt | FAILED | NEW_EVIDENCE | - | V09 |
| CLM-14 | AC-14 | CLI without PATH hermes | yes | runner uses absolute path | NOT_TESTED | NEW_EVIDENCE | - | V05 |
| CLM-15 | AC-15 | down => UNAVAILABLE no spawn | yes | recovery spawn | FAILED | NEW_EVIDENCE | - | V10 |
| CLM-16 | AC-16 | external recover => READY | yes | none | NOT_TESTED | NEW_EVIDENCE | - | V10 |
| CLM-17 | AC-17 | Work exit Gateway lives | yes | stopGateway risk | NOT_TESTED | NEW_EVIDENCE | - | V10 |
| CLM-18 | AC-18 | remote/SSH unchanged | yes | existing tests | PASS | TARGETED_RERUN | local dashboard spawn/web-dist deletion shares dashboard.ts | V11 |
| CLM-19 | AC-19 | guard catches reintro | yes | spawn guard register.ts only | FAILED | NEW_EVIDENCE | - | V03 |
| CLM-20 | AC-20 | typecheck/unit/lat | yes | none for this slice | NOT_TESTED | NEW_EVIDENCE | - | V12 |
| CLM-21 | AC-21 | Windows listen fail-closed | yes | health-only ready | FAILED | NEW_EVIDENCE | - | V13 |
| CLM-22 | DOD-01 | all blocking claims PASS | yes | no closure evidence | NOT_TESTED | NEW_EVIDENCE | - | V12 |
| CLM-23 | DOD-02 | no Python runtime or Work Gateway lifecycle in production | yes | leftovers remain | FAILED | NEW_EVIDENCE | - | V01, V03 |
| CLM-24 | DOD-03 | lat.md/README match data-plane client | yes | docs still describe self-install paths | FAILED | NEW_EVIDENCE | - | V12 |
| CLM-25 | DOD-04 | implementation commit excludes Roadmap DONE | yes | none | NOT_TESTED | NEW_EVIDENCE | - | V12 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|
| SCN-01 | CLM-05, CLM-06 | V04 | packaged or `npm run dev:work` against managed Gateway | Chat UI; main logs | Gateway :8642 healthy; managed home | start Work; send Chat | no Python/TUI/fallback logs; assistant response | ENV-02 |
| SCN-02 | CLM-07, CLM-08, CLM-09, CLM-14 | V05 | same Work + hermes.exe | profile/cron/kanban/mcp/skills UI | PATH without Hermes | CRUD/list/install reachable ops | success via absolute CLI | ENV-02 |
| SCN-03 | CLM-12 | V08 | Chat tool runtime | Chat | Probe READY | ask agent HERMES_HOME/TERMINAL_CWD/cwd | ProgramData home+workspace; else BLOCK installer | ENV-02 |
| SCN-04 | CLM-15, CLM-16, CLM-17 | V10 | SMC Hermes Gateway task | admin stop/start task | Work open | stop task; retry; start task; retry; quit Work | UNAVAILABLE no spawn; READY after recover; PID unchanged on quit | ENV-02 |
| SCN-05 | CLM-21 | V13 | listener on 8642 | Windows listen inspect | foreign exe or inspect-denied fixture | probe | CONFLICT or configuration_error; never READY; no kill | ENV-02 |

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|
| ENV-01 | - | - | - | LOCAL_WORKTREE | - |
| ENV-02 | - | `curl -sS -o NUL -w "%{http_code}" http://127.0.0.1:8642/health` | - | COMMAND | health 200 and `getHermesCliPath` exists |

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-02, CLM-23 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/hermes-runtime-paths.test.ts --pool=threads --maxWorkers=1', shell=True))"` | no pythonw/hermes_cli.*/HERMES_PYTHON in production main/scripts; HERMES_HOME live after override; named module snapshots gone | fixtures may keep literals; function-body join(HERMES_HOME) KEEP | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V02 | CLM-03 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/profiles.test.ts tests/cronjobs.test.ts tests/mcp-servers.test.ts tests/kanban-unsupported.test.ts tests/skills-cli-output.test.ts tests/hermes-auth.test.ts --pool=threads --maxWorkers=1', shell=True))"` | no execFile python; uses runHermesCli* | PATH hermes spawn forbidden | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V03 | CLM-04, CLM-19, CLM-23 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run guard', shell=True))"` | guard PASS; intentional reintro FAIL | startGatewayWithRecovery absent in main | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V04 | CLM-05, CLM-06 | LIVE | LIVE | SCN-01 Work start + Chat | response; forbidden log strings absent | no TUI fallback | LOCAL_TRANSIENT | ENV-02 | TARGETED_RERUN | yes |
| V05 | CLM-07, CLM-08, CLM-09, CLM-14 | LIVE | LIVE | SCN-02 UI ops with PATH stripped | CRUD/list success | pythonw never launched | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V06 | CLM-10 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/model-discovery.test.ts --pool=threads --maxWorkers=1', shell=True))"` | curated lists; helper gone; /v1/models alias unused as provider catalog | Python discovery absent | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V07 | CLM-11 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/hermes.test.ts --pool=threads --maxWorkers=1', shell=True))"` | capability unavailable; no HERMES_PYTHON | Python fallback absent | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V08 | CLM-12 | LIVE | LIVE | SCN-03 Chat cwd report | managed ProgramData paths | AppData hermes => BLOCK installer not Work python | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V09 | CLM-13 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/components/settings/RuntimePane.test.tsx src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | Choose folder hidden for managed-local-v1 including direct | INSTALL_CMD* gone | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V10 | CLM-15, CLM-16, CLM-17 | LIVE | LIVE | SCN-04 task stop/start/quit | UNAVAILABLE; READY after recover; PID stable | Work did not spawn | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V11 | CLM-18 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/dashboard-remote.test.ts tests/dashboard-launch.test.ts tests/dashboard-web-dist.test.ts --pool=threads --maxWorkers=1', shell=True))"` | remote/SSH dashboard tests PASS | local dashboard spawn gone | LOCAL_TRANSIENT | ENV-01 | TARGETED_RERUN | yes |
| V12 | CLM-20, CLM-22, CLM-24, CLM-25 | UNIT | LOCAL | `python -c "import subprocess,sys; cmds=['npm --prefix apps/work run typecheck','npm --prefix apps/work test','lat check apps/work']; sys.exit(0 if all(subprocess.call(c,shell=True)==0 for c in cmds) else 1)"` | all PASS; docs mention data-plane client | no roadmap DONE in impl commit | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V13 | CLM-21 | LIVE | LIVE | SCN-05 listen mismatch or inspect failure | not READY; no kill | health-only must not READY | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/main/runtime/hermes-runtime-paths.ts#HERMES_PYTHON`
- `apps/work/src/main/runtime/hermes-cli-runner.ts#runHermesCliAsync`
- `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal`
- `apps/work/src/main/hermes.ts#warmTuiGatewayClient`
- `apps/work/src/main/hermes.ts#startGatewayWithRecovery`
- `apps/work/src/main/hermes.ts#transcribeAudio`

## Triggered Read

- If T1 CLI command output parsing breaks: the corresponding domain test next to `profiles.ts` / `cronjobs.ts` / `kanban.ts` / `mcp-servers.ts`
- If Windows listen inspect cannot use Node net-stat APIs: `apps/work/src/main/runtime/gateway-probe.ts#probeGatewayHealth` only
- If App.tsx wizard still reachable after C09: `apps/work/src/renderer/src/App.tsx` install branch only
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/runtime/hermes-runtime-paths.ts#HERMES_PYTHON` | PROD | REMOVE | hermes-runtime-paths | T1 | live HERMES_HOME; no Self-Install exports | Legacy path API | no |
| C01 | `apps/work/src/main/installer.ts` | PROD | MODIFY | installer.ts | T1 | no Self-Install path re-exports | Legacy path API | no |
| C01 | `apps/work/src/main/profiles.ts#PROFILES_DIR` | PROD | MODIFY | profiles.ts | T1 | no module snapshot | Legacy path API | no |
| C01 | `apps/work/src/main/claw3d.ts#HERMES_OFFICE_DIR` | PROD | MODIFY | claw3d.ts | T1 | getter-based office/pid/port paths | Legacy path API | no |
| C01 | `apps/work/src/main/attachment-staging.ts#STAGING_ROOT` | PROD | MODIFY | attachment-staging.ts | T1 | getter-based staging root | Legacy path API | no |
| C01 | `apps/work/src/main/models.ts#MODELS_FILE` | PROD | MODIFY | models.ts | T1 | getter-based model files | Legacy path API | no |
| C02 | `apps/work/src/main/profiles.ts#listProfiles` | PROD | MODIFY | profiles.ts | T1 | CLI via runner | Domain Hermes CLI | no |
| C02 | `apps/work/src/main/cronjobs.ts#listCronJobs` | PROD | MODIFY | cronjobs.ts | T1 | CLI via runner | Domain Hermes CLI | no |
| C02 | `apps/work/src/main/kanban.ts#listBoards` | PROD | MODIFY | kanban.ts | T1 | CLI via runner | Domain Hermes CLI | no |
| C02 | `apps/work/src/main/mcp-servers.ts#listMcpServers` | PROD | MODIFY | mcp-servers.ts | T1 | CLI via runner | Domain Hermes CLI | no |
| C02 | `apps/work/src/main/skills.ts#installSkill` | PROD | MODIFY | skills.ts | T1 | CLI via runner | Domain Hermes CLI | no |
| C02 | `apps/work/src/main/hermes-auth.ts#runHermesAuthLogin` | PROD | MODIFY | hermes-auth.ts | T1 | CLI via runner | Domain Hermes CLI | no |
| C02 | `apps/work/src/main/installer.ts#runHermesDump` | PROD | MODIFY | installer.ts | T1 | CLI via runner | Domain Hermes CLI | no |
| C03 | `apps/work/src/main/hermes.ts#warmTuiGatewayClient` | PROD | REMOVE | hermes.ts | T2 | local chat Gateway-only | Local TUI/web-dist | no |
| C03 | `apps/work/src/main/dashboard-web-dist.ts#ensureLocalDashboardWebDist` | PROD | REMOVE | dashboard-web-dist.ts | T2 | no local web-dist build | Local TUI/web-dist | no |
| C03 | `apps/work/src/main/dashboard.ts#startDashboard` | PROD | MODIFY | dashboard.ts | T2 | local spawn gone; remote kept | Local TUI/web-dist | no |
| C03 | `apps/work/src/main/hermes-agent-compat.ts#ensureLocalDashboardCompatibility` | PROD | MODIFY | hermes-agent-compat.ts | T2 | no python web_server | Local TUI/web-dist | no |
| C03 | `apps/work/lat.md/model-selection.md` | DOC | MODIFY | lat.md | T2 | CLI fallback section closed; keep `@lat` heading | Local TUI/web-dist | no |
| C04 | `apps/work/src/main/hermes.ts#startGatewayWithRecovery` | PROD | REMOVE | hermes.ts | T2 | no spawn/kill | Gateway supervisor | no |
| C04 | `apps/work/src/main/hermes.ts#stopGateway` | PROD | REMOVE | hermes.ts | T2 | no PID SIGTERM | Gateway supervisor | no |
| C04 | `apps/work/src/main/hermes.ts#startGatewayDetailed` | PROD | REMOVE | hermes.ts | T2 | no detailed start | Gateway supervisor | no |
| C05 | `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal` | PROD | MODIFY | LegacyLocalRuntimeAdapter | T3 | READY fail-closed listen inspect | Probe contract | no |
| C05 | `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeState` | PROD | MODIFY | runtime-contract | T3 | no gateway_starting/stopped | Probe contract | no |
| C05 | `apps/work/src/renderer/src/runtime/runtime-reducer.ts#runtimeReducer` | PROD | MODIFY | runtime-reducer | T3 | CONNECT_START only connecting | Probe contract | no |
| C05 | `apps/work/src/main/runtime/gateway-probe.ts#probeGatewayHealth` | PROD | MODIFY | gateway-probe | T3 | optional listen inspect helper | Probe contract | no |
| C06 | `apps/work/src/main/hermes.ts#transcribeAudio` | PROD | MODIFY | hermes.ts | T2 | explicit STT unavailable | STT Python fallback | no |
| C07 | `apps/work/src/main/model-discovery.ts#runProviderModelIdsPython` | PROD | REMOVE | model-discovery | T4 | curated only | Provider Python discovery | no |
| C08 | `apps/work/src/main/skills.ts#listBundledSkills` | PROD | REMOVE | skills.ts | T1 | installed skills only | Bundled skills | no |
| C09 | `apps/work/src/renderer/src/components/settings/RuntimePane.tsx#RuntimePane` | PROD | MODIFY | RuntimePane | T5 | Self-Install unreachable | Managed UI gate | no |
| C09 | `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.tsx#ConnectionErrorScreen` | PROD | MODIFY | ConnectionErrorScreen | T5 | no Choose folder on managed-local-v1 | Managed UI gate | no |
| C09 | `apps/work/src/renderer/src/constants.ts#INSTALL_CMD` | PROD | REMOVE | constants.ts | T5 | INSTALL_CMD* gone | Managed UI gate | no |
| C10 | `apps/work/scripts/check-no-work-gateway-spawn.mjs` | PROD | MODIFY | work guard | T6 | main-tree spawn fails | CI guards | no |
| C10 | `apps/work/scripts/check-no-legacy-hermes-runtime.mjs` | PROD | ADD | work guard | T6 | python/source literals fail | CI guards | yes |
| C10 | `apps/work/package.json` | CONFIG | MODIFY | apps/work package | T6 | guard includes new script | CI guards | no |
| C10 | `apps/work/scripts/hermes-sandbox.ps1` | CONFIG | MODIFY | sandbox | T6 | data-home only | CI guards | no |
| C10 | `apps/work/lat.md/runtime-connection.md` | DOC | MODIFY | lat.md | T6 | data-plane client contract | CI guards | no |
| C10 | `apps/work/README.md` | DOC | MODIFY | README | T6 | no self-install runtime | CI guards | no |
| C01 | `apps/work/tests/hermes-runtime-paths.test.ts` | TEST | MODIFY | hermes-runtime-paths tests | T1 | live HERMES_HOME; no Self-Install export assertions | Legacy path API | no |
| C01 | `apps/work/tests/installer-platform.test.ts` | TEST | MODIFY | installer tests | T1 | no HERMES_PYTHON import | Legacy path API | no |
| C02 | `apps/work/tests/profiles.test.ts` | TEST | MODIFY | profiles tests | T1 | runner-based CLI | Domain Hermes CLI | no |
| C02 | `apps/work/tests/cronjobs.test.ts` | TEST | MODIFY | cronjobs tests | T1 | runner-based CLI | Domain Hermes CLI | no |
| C02 | `apps/work/tests/cronjobs-ssh.test.ts` | TEST | MODIFY | cronjobs ssh tests | T1 | runner-based CLI | Domain Hermes CLI | no |
| C02 | `apps/work/tests/mcp-servers.test.ts` | TEST | MODIFY | mcp tests | T1 | runner-based CLI | Domain Hermes CLI | no |
| C02 | `apps/work/tests/kanban-unsupported.test.ts` | TEST | MODIFY | kanban tests | T1 | runner-based CLI | Domain Hermes CLI | no |
| C02 | `apps/work/tests/skills-cli-output.test.ts` | TEST | MODIFY | skills cli tests | T1 | runner-based CLI | Domain Hermes CLI | no |
| C02 | `apps/work/tests/hermes-auth.test.ts` | TEST | MODIFY | hermes-auth tests | T1 | runner-based CLI | Domain Hermes CLI | no |
| C03 | `apps/work/src/main/tui-gateway-stream.test.ts` | TEST | MODIFY | tui stream tests | T2 | no TUI env helpers required for local chat | Local TUI/web-dist | no |
| C03 | `apps/work/tests/dashboard-web-dist.test.ts` | TEST | MODIFY | dashboard-web-dist tests | T2 | local dist unused | Local TUI/web-dist | no |
| C04 | `apps/work/src/main/hermes/legacy-process/gateway-process.ts` | PROD | MODIFY | gateway-process | T2 | no spawn/kill re-export of live supervisor | Gateway supervisor | no |
| C04 | `apps/work/src/main/hermes/index.ts` | PROD | MODIFY | hermes index | T2 | stopGateway export is non-killing refuse | Gateway supervisor | no |
| C04 | `apps/work/tests/gateway-restart.test.ts` | TEST | MODIFY | gateway-restart tests | T2 | prove no Work spawn/kill | Gateway supervisor | no |
| C04 | `apps/work/tests/remote-mode-url-and-spawn.test.ts` | TEST | MODIFY | remote spawn tests | T2 | local start refused | Gateway supervisor | no |
| C04 | `apps/work/tests/hermes-cli-session-id.test.ts` | TEST | MODIFY | session-id tests | T2 | stopGateway does not kill | Gateway supervisor | no |
| C05 | `apps/work/tests/runtime-adapter.test.ts` | TEST | MODIFY | runtime-adapter tests | T3 | Windows listen inspect fail-closed | Probe contract | no |
| C05 | `apps/work/src/renderer/src/runtime/runtime-reducer.test.ts` | TEST | ADD | runtime-reducer tests | T3 | CONNECT_START is connecting only | Probe contract | yes |
| C06 | `apps/work/src/main/hermes.test.ts` | TEST | MODIFY | hermes tests | T2 | STT explicit unavailable | STT Python fallback | no |
| C07 | `apps/work/tests/model-discovery.test.ts` | TEST | MODIFY | model-discovery tests | T4 | no Python helper | Provider Python discovery | no |
| C07 | `apps/work/tests/oauth-model-discovery.test.ts` | TEST | MODIFY | oauth model tests | T4 | no HERMES_PYTHON mock dependency | Provider Python discovery | no |
| C08 | `apps/work/src/renderer/src/screens/Skills/Skills.test.tsx` | TEST | MODIFY | Skills tests | T1 | no bundled source | Bundled skills | no |
| C09 | `apps/work/src/renderer/src/components/settings/RuntimePane.test.tsx` | TEST | ADD | RuntimePane tests | T5 | managed-local-v1 hides Choose folder | Managed UI gate | yes |
| C09 | `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | TEST | ADD | ConnectionError tests | T5 | managed-local-v1 hides Choose folder | Managed UI gate | yes |
| C11 | `apps/work/src/main/dashboard.ts#getRemoteDashboardStatusForConfig` | PROD | KEEP | dashboard.ts | - | remote/SSH/OAuth unchanged | Remote dashboard | no |

## Domain Activation Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C05 | `apps/work/src/renderer/src/runtime/runtime-reducer.test.ts` | No existing suite covers CONNECT_START vs gateway_starting. | Test-only coverage of the existing runtime-reducer owner. |
| C09 | `apps/work/src/renderer/src/components/settings/RuntimePane.test.tsx` | Choose-folder gate has no focused suite. | Test-only coverage of existing RuntimePane. |
| C09 | `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | Connection error Self-Install gate has no focused suite. | Test-only coverage of existing ConnectionErrorScreen. |
| C10 | `apps/work/scripts/check-no-legacy-hermes-runtime.mjs` | Existing spawn guard only scans `register.ts` and cannot fail closed on Python/source runtime literals. | Same `package.json` guard owner; no new production runtime module. |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | ADR-07 snapshots bind import-time home; `path.join` requires a real string | KEEP live `export let HERMES_HOME` synced from `getHermesHome()`; REMOVE Self-Install exports; convert only named module snapshots |
| C02 | REUSE_EXISTING | runner already uses absolute hermes.exe | migrate callers; do not wrap python |
| C03 | REMOVE_ONLY | web_dist absent on managed release; `@lat` heading must remain | delete TUI client and dashboard-web-dist; keep remote startDashboard; close lat.md CLI-fallback body in place |
| C04 | REMOVE_ONLY | lat.md Direct never spawn/kill; IPC already refuses | delete recovery/stopGateway; adapter.restart already refuses |
| C05 | MODIFY_EXISTING | probeLocal already owns ready mapping | extend probeLocal + gateway-probe; Windows inspect fail-closed; no Adapter |
| C06 | MODIFY_EXISTING | transcribeAudio already has HTTP then Python | stop after HTTP failure with explicit error |
| C07 | REMOVE_ONLY | helper already null-falls to curated | delete helper |
| C08 | REMOVE_ONLY | listInstalledSkills already reads data home | delete listBundledSkills production path |
| C09 | MODIFY_EXISTING | managedMode already exists | gate on managed-local-v1, not only opsi/salt |
| C10 | MINIMAL_NEW | guard script already in package.json | widen spawn scan; one new literal guard file |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C02, C08 | `apps/work/src/main/runtime/hermes-runtime-paths.ts#HERMES_PYTHON`, `apps/work/src/main/installer.ts`, `apps/work/src/main/profiles.ts#PROFILES_DIR`, `apps/work/src/main/claw3d.ts#HERMES_OFFICE_DIR`, `apps/work/src/main/attachment-staging.ts#STAGING_ROOT`, `apps/work/src/main/models.ts#MODELS_FILE`, `apps/work/src/main/profiles.ts#listProfiles`, `apps/work/src/main/cronjobs.ts#listCronJobs`, `apps/work/src/main/kanban.ts#listBoards`, `apps/work/src/main/mcp-servers.ts#listMcpServers`, `apps/work/src/main/skills.ts#installSkill`, `apps/work/src/main/hermes-auth.ts#runHermesAuthLogin`, `apps/work/src/main/installer.ts#runHermesDump`, `apps/work/src/main/skills.ts#listBundledSkills`, `apps/work/tests/hermes-runtime-paths.test.ts`, `apps/work/tests/installer-platform.test.ts`, `apps/work/tests/profiles.test.ts`, `apps/work/tests/cronjobs.test.ts`, `apps/work/tests/cronjobs-ssh.test.ts`, `apps/work/tests/mcp-servers.test.ts`, `apps/work/tests/kanban-unsupported.test.ts`, `apps/work/tests/skills-cli-output.test.ts`, `apps/work/tests/hermes-auth.test.ts`, `apps/work/src/renderer/src/screens/Skills/Skills.test.tsx` | `apps/work/src/main/runtime/hermes-cli-runner.ts#runHermesCliAsync`, `apps/work/src/main/runtime/hermes-runtime-config.ts` | T2, T4 | no |
| T2 | C03, C04, C06 | `apps/work/src/main/hermes.ts#warmTuiGatewayClient`, `apps/work/src/main/dashboard-web-dist.ts#ensureLocalDashboardWebDist`, `apps/work/src/main/dashboard.ts#startDashboard`, `apps/work/src/main/hermes-agent-compat.ts#ensureLocalDashboardCompatibility`, `apps/work/src/main/hermes.ts#startGatewayWithRecovery`, `apps/work/src/main/hermes.ts#stopGateway`, `apps/work/src/main/hermes.ts#startGatewayDetailed`, `apps/work/src/main/hermes.ts#transcribeAudio`, `apps/work/src/main/hermes/legacy-process/gateway-process.ts`, `apps/work/src/main/hermes/index.ts`, `apps/work/src/main/tui-gateway-stream.test.ts`, `apps/work/tests/dashboard-web-dist.test.ts`, `apps/work/tests/gateway-restart.test.ts`, `apps/work/tests/remote-mode-url-and-spawn.test.ts`, `apps/work/tests/hermes-cli-session-id.test.ts`, `apps/work/src/main/hermes.test.ts`, `apps/work/lat.md/model-selection.md` | `apps/work/src/main/runtime/hermes-runtime-paths.ts#HERMES_PYTHON` | - | no |
| T3 | C05 | `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal`, `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeState`, `apps/work/src/renderer/src/runtime/runtime-reducer.ts#runtimeReducer`, `apps/work/src/main/runtime/gateway-probe.ts#probeGatewayHealth`, `apps/work/tests/runtime-adapter.test.ts`, `apps/work/src/renderer/src/runtime/runtime-reducer.test.ts` | `apps/work/src/main/runtime/hermes-runtime-config.ts` | - | no |
| T4 | C07 | `apps/work/src/main/model-discovery.ts#runProviderModelIdsPython`, `apps/work/tests/model-discovery.test.ts`, `apps/work/tests/oauth-model-discovery.test.ts` | `apps/work/src/main/runtime/hermes-runtime-paths.ts#HERMES_PYTHON` | - | no |
| T5 | C09 | `apps/work/src/renderer/src/components/settings/RuntimePane.tsx#RuntimePane`, `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.tsx#ConnectionErrorScreen`, `apps/work/src/renderer/src/constants.ts#INSTALL_CMD`, `apps/work/src/renderer/src/components/settings/RuntimePane.test.tsx`, `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeState` | T3 | no |
| T6 | C10 | `apps/work/scripts/check-no-work-gateway-spawn.mjs`, `apps/work/scripts/check-no-legacy-hermes-runtime.mjs`, `apps/work/package.json`, `apps/work/scripts/hermes-sandbox.ps1`, `apps/work/lat.md/runtime-connection.md`, `apps/work/README.md` | - | T1, T5 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/hermes.ts` | T2 | TUI, Gateway lifecycle, and STT share one Main module; single writer avoids C03/C04/C06 collisions |
| `apps/work/src/main/skills.ts` | T1 | CLI migration and bundled-skill removal share one module |
| `apps/work/src/main/installer.ts` | T1 | path re-export removal and Python CLI migration share one module |
| `apps/work/src/main/profiles.ts` | T1 | snapshot removal and CLI migration share one module |

## Generated Outputs Ledger

| Output | Producer Todo | Kind | Consumers |
|---|---|---|---|
| `apps/work/scripts/check-no-legacy-hermes-runtime.mjs` | T6 | GENERATED_ENTRYPOINT | `apps/work/package.json` guard |

## Todo T1 — Path API and CLI convergence

**Owns Changes**
- C01
- C02
- C08

**Goal**
Keep live `HERMES_HOME`; delete Self-Install path exports; convert named module snapshots; domain CLI uses `runHermesCli*`; bundled skills source is gone.

**Immediate anchors**
- `apps/work/src/main/runtime/hermes-runtime-paths.ts#HERMES_PYTHON`
- `apps/work/src/main/runtime/hermes-cli-runner.ts#runHermesCliAsync`
- `apps/work/src/main/skills.ts#listBundledSkills`

**Changes**
- Replace `export const HERMES_HOME = getHermesHome()` with a live `export let HERMES_HOME` synced from `getHermesHome()` on this module's `getHermesHome` / `setHermesHomeOverride` / `invalidateHermesRuntimeConfigCache`. `path.join` requires `typeof === "string"`; do not export a non-string getter object.
- Delete Self-Install exports (`HERMES_PYTHON`/`HERMES_REPO`/`hermesCliArgs`/…). Do **not** delete the `HERMES_HOME` export. Do **not** rewrite function-body `join(HERMES_HOME, …)` in `config.ts` / `config-health.ts` / `account-store.ts` / `utils.ts` / `gateway-ports.ts`.
- Convert module snapshots: `STAGING_ROOT`, `PROFILES_DIR`, `MODELS_FILE`/`MODEL_DEFS_FILE`, `HERMES_OFFICE_DIR` and sibling claw3d pid/port consts.
- Replace `HERMES_PYTHON`/`hermesCliArgs`/`cwd=hermes-agent` with runner.
- Remove bundled skill listing from production.

**Stop conditions**
- [ ] V01 V02 V05 production grep and CLI unit/live oracles

**Triggered reads**
- If a CLI parser test fails: that domain's existing test file only

## Todo T2 — Remove local TUI, dashboard dist, and Gateway supervisor

**Owns Changes**
- C03
- C04
- C06

**Goal**
Local chat uses Gateway only; Work never starts/stops Gateway; STT fails closed without Python.

**Immediate anchors**
- `apps/work/src/main/hermes.ts#warmTuiGatewayClient`
- `apps/work/src/main/hermes.ts#startGatewayWithRecovery`
- `apps/work/src/main/hermes.ts#transcribeAudio`

**Changes**
- Delete TUI client/warmup/send and `dashboard-web-dist.ts` production use.
- Delete `startGatewayDetailed`/`stopGateway`/`startGatewayWithRecovery` production paths and Python image liveness.
- `transcribeAudio` does not call recovery or Python; returns explicit unavailable.
- Do not change remote `getRemoteDashboardStatusForConfig`.
- Close `apps/work/lat.md/model-selection.md` CLI fallback body; keep heading `Text-only legacy fallback routes via CLI` for existing `@lat` mentions.

**Stop conditions**
- [ ] V03 V04 V07 V11

**Triggered reads**
- If remote dashboard tests fail: `apps/work/src/main/dashboard.ts#getRemoteDashboardStatusForConfig` only

## Todo T3 — Probe contract, listen inspect, and connecting state

**Owns Changes**
- C05

**Goal**
Windows READY requires successful listen inspect matching expected CLI; inspect failure is not READY; UI connecting is not gateway_starting.

**Immediate anchors**
- `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal`
- `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeState`
- `apps/work/src/renderer/src/runtime/runtime-reducer.ts#runtimeReducer`

**Changes**
- Extend `probeLocal` with read-only listen inspect via existing probe owner (`gateway-probe.ts` helpers if needed).
- Remove `gateway_starting`/`gateway_stopped` from `HermesRuntimeState`; CONNECT_START only sets connecting.
- Do not parse Chat into probe. Do not kill PIDs. Do not change messaging-platform `gateway_stopped`.

**Stop conditions**
- [ ] V10 V13

**Triggered reads**
- If Node cannot read OwningProcess: stay inside `gateway-probe.ts` / adapter; fail-closed

## Todo T4 — Remove provider Python model discovery

**Owns Changes**
- C07

**Goal**
Delete `runProviderModelIdsPython`; curated/user models remain.

**Immediate anchors**
- `apps/work/src/main/model-discovery.ts#runProviderModelIdsPython`

**Changes**
- Remove Python helper and callers; keep curated catalogs.

**Stop conditions**
- [ ] V06

**Triggered reads**
- None unless curated test fails in the same file

## Todo T5 — Managed Self-Install UI unreachable

**Owns Changes**
- C09

**Goal**
`managed-local-v1` (including `direct`) cannot open Install/Choose folder/Create venv; `INSTALL_CMD*` removed.

**Immediate anchors**
- `apps/work/src/renderer/src/components/settings/RuntimePane.tsx#RuntimePane`

**Changes**
- Gate on runtime contract, not only opsi/salt.
- Remove zero-consumer INSTALL_CMD constants.

**Stop conditions**
- [ ] V09

**Triggered reads**
- If App.tsx wizard still reachable: `apps/work/src/renderer/src/App.tsx` install branch only

## Todo T6 — Guards, sandbox, and contract docs

**Owns Changes**
- C10

**Goal**
Guard fails on Python/source runtime and Gateway spawn in `src/main`; sandbox is data-home; lat/README match contract.

**Immediate anchors**
- `apps/work/scripts/check-no-work-gateway-spawn.mjs`

**Changes**
- Widen spawn guard; add `check-no-legacy-hermes-runtime.mjs` to `guard`.
- Clean `hermes-sandbox.ps1` venv special case.
- Update lat.md/README.

**Stop conditions**
- [ ] V03 V12

**Triggered reads**
- None unless guard false-positive on tests/fixtures

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; all blocking claims PASS | V01, V02, V03, V04, V05, V06, V07, V08, V09, V10, V11, V12, V13 via SMC evidence ledger |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof pending/stale | pending/stale gate IDs |
| BLOCKED | ENV-02 unavailable or installer cwd defect | blocker record |
| RETURN_PRD | listen inspect requires a new Adapter or installer change inside this Plan | PRD revision request |
