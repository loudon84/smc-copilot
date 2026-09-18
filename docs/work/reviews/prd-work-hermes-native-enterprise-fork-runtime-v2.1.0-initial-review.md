# PRD-WORK-HERMES-NATIVE-ENTERPRISE-RUNTIME-V2 v2.1.0 — Independent Initial Review

**Mode:** initial  
**Verdict:** REVISE  
**Plan gate:** BLOCKED  
**Reviewed artifact:** `docs/architecture/PRD-WORK-Hermes-Native-Enterprise-Fork-Runtime-v2.0.0.md` (body `version: 2.1.0`, `status: DRAFT`)  
**prd_id:** `PRD-WORK-HERMES-NATIVE-ENTERPRISE-RUNTIME-V2`  
**Independent reviewer:** code-review subagent (no author session history)  
**Adjudication:** parent agent verified BLOCKERs against source; one severity adjustment (F-06)  
**Grounded commit (workspace):** `1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31`  
**Actual branch:** `work/prd-v6.0`  
**PRD frontmatter claim:** `work/prd-v5.2` / `090299c1c3bfa39dab5ec1bd5df67be7ac78032c` — **mismatch**  
**Hermes fork working copy:** `e:\git\hermes-agent` origin `http://git.superic.com/aiplatform/hermes-agent.git`  
**Clarification provider:** grilling freeze 2026-09-18 (§0.1 F-001–F-017)

本 review **只读**。不修改 PRD、源码或 Plan。不把 status 改为 `APPROVED_FOR_PLAN`。不授权实现。

不采信作者叙述。产品方向（Work 不拥有 Runtime、企业 Git 唯一 Hermes 源、Native Home、无存量迁移）在 grill 中已冻结；本 verdict 针对 **合同是否可唯一编译为 Plan**。

---

## Verdict

**REVISE。禁止 PLAN。保持 DRAFT。**

方向成立，grilling freeze 也把 v2.0.0 的假 `APPROVED_FOR_PLAN` 纠正了。但 v2.1.0 仍有多处 Plan Agent 无法唯一实现的语义缺口：HTTP-only 源 schema 不闭合、干净机 Git 前置循环、`official-source.json` 无 schema、named profile Gateway 生命周期未写、Policy 字段映射靠猜、ADR-031 仍为 Accepted、Electron Bootstrap 执行合同缺失。

独立审查员原文 Verdict 为 `FAIL`（Plan-blocked）。按本仓库 Stage PRD 习惯，目标可修订闭合，故闸门记 **REVISE**，不是「推倒目标」。在 BLOCKER 关闭并 re-review 之前，效果等同 FAIL：不得 converge、不得出 Plan。

---

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | REVISE | 主目标与 NON-GOAL-009（无存量迁移）清楚。remote/ssh 是否跑本地 Bootstrap 未关闭。§6 仍把 Legacy migration 写进 Inside boundary，与 F-015 冲突。 |
| G2 Duplicate owner | REVISE | Replacement Matrix 有。Phase 5 已 remove installer/OPSI，Phase 8 再删同一批，又说 Pilot 后才能删回滚脚本。KEEP/disable/DELETE 时点不唯一。 |
| G3 Production ownership | REVISE | PRD 本地永远 native/direct。ADR-031 仍 **Accepted**，`control-owner.json` 仍是 mutex，`hermes=opsi` 时 OPSI 为 owner。PRD frontmatter 自称 supersedes，仓库没有新 ADR / 状态变更交付物。 |
| G4 Classification | REVISE | `apps/work/src/main/control-owner.ts` 路径错误（实为 `hermes/control-owner.ts`）。遗漏 `shared/runtime/control-owner.ts`、`ipc/register.ts`、`app/start.ts`、RuntimePane / ConnectionErrorScreen。 |
| G5 Contract / Security | REVISE | `repositoryHttps`+`repositorySsh` 均为 YES，golden origin 却是 HTTP。`official-source.json` 无 schema。HTTP 跟随 branch 无 TLS/签名（freeze 已接受 HTTP，但残留风险未记批准主体）。 |
| G6 Behaviour → AC | REVISE | Gateway stop/restart/install、named profile 任务、remote Bootstrap、Bootstrap 互斥/取消、control-owner UI 无 AC。若干 Requirement 小节漏列已存在的 A-FORK-003 / A-INSTALL-003 / A-RUNTIME-003 / A-POLICY-003。 |
| G7 Evidence integrity | REVISE | DRAFT / `SKIPPED != PASS` / 取消 migration 是诚实的。基线 commit/branch 与工作区不符；文件名 v2.0.0 vs 正文 v2.1.0。 |

---

## Findings

### BLOCKER

#### F-01 — 源 schema 无法表达 HTTP-only 生产配置

Release v2 同时 **required** `hermes.source.repositoryHttps` 与 `repositorySsh`；HTTP golden `http://git.superic.com/aiplatform/hermes-agent.git` 只在 MAY 字段。合法生产 YAML 要么编造 HTTPS/SSH URL，要么 `RELEASE_CONFIG_INVALID`。

**PRD 应改：** 至少一个 URL 即可；增加唯一 `installTransport` / 选用规则；`schemeAliases` 只声明真实可用协议。

#### F-02 — 干净机 Git 前置循环

Bootstrap 顺序是 `ENTERPRISE_REPO_AUTH_CHECK`（`git ls-remote`）→ 才跑 `install.ps1`。`install.ps1` 才在无 PATH git 时下载 PortableGit 到 `%LOCALAPPDATA%\hermes\git`（约 L1400–1432）。无系统 Git 的绿场会在 installer 有机会装 Git 之前失败。

**PRD 应改：** `ls-remote` 之前 Ensure Git，或让 installer 暴露独立 prereq stage；补无 Git 干净机 AC。

#### F-03 — `official-source.json` 无文件契约

指定了 Hermes Root 路径和「update/banner 必须读它」，没有 schema、字段（defaultBranch / aliases / version）、原子写、缺失/损坏语义。现网 `hermes update` 在 checkout `PROJECT_ROOT` 上跑 Git，未定义如何发现 Root 上的 identity 文件。

**PRD 应改：** 完整 JSON schema + 解析 API + 失败码 + 测试。

#### F-04 — Named profile Gateway 生命周期未定义

端口分配（Work 写 `platforms.api_server.extra.port`）已冻。Native `hermes gateway install` 默认用户 ONLOGON 任务绑定**当前** profile（`gateway_windows.py`）。未规定何时 `hermes -p <name> gateway install/start`、任务卸载、以及多 Gateway readiness。

**PRD 应改：** 逐 profile 生命周期 + AC。default-only 也须写死。

#### F-05 — ADR-031 未被正式 supersede

ADR-031 Status = **Accepted**。Decision 2：`control-owner.json` 是唯一生命周期 mutex；`hermes=opsi` 时 OPSI 为 owner。PRD 只在 frontmatter `supersedes` 列表里点名，没有要求修改 ADR 或新增 ADR。Plan 面对两个互斥 SOT。

**PRD 应改：** 把「新 ADR 或修订 ADR-031 为 Superseded（Hermes 生命周期条款）」列入 inventory 与 Required Gate。Salt 默认 SOT 的 ADR 原文与当前 salt-disabled 规则一并交代范围（本 PRD 只废 Hermes=opsi，不重写整个 Endpoint Control Plane）。

#### F-07 — Policy 字段映射靠猜测

v1 policy SOT 指向 `release/hermes-runtime-profiles.yaml#smc-managed` 的 `gateway` / `managedConfig.defaults` / `enforced`。这些键（`gateway.port`、`mcp_servers.workspace.command: managed-node`、`terminal.cwd`）与 Hermes `config.yaml` 的 `platforms.api_server.extra.*` 不是同构。Work 现已有部分 api_server 写入逻辑，但 MCP/`managed-node`/路径展开无映射表。

**PRD 应改：** 逐字段映射表（源路径 → Hermes 路径 → 类型 → 展开规则）。禁止 Plan 猜测。

#### F-08 — Electron Bootstrap 执行合同缺失

「Work 首次启动跑捆绑 `install.ps1`」没有：PowerShell 可执行文件、`-ExecutionPolicy`、参数列表、超时、取消、日志路径、第二窗口 mutex、失败后重入。`app/start.ts` 现无此流程。

**PRD 应改：** 执行契约 + 并发/超时 AC。

### MAJOR

#### F-06 — HTTP 更新完整性（severity 已下调）

独立审查员列为 BLOCKER：跟随可变分支的 HTTP git 无 TLS/签名。grilling **Q15=1 已接受** `http://git.superic.com`。不得在 review 中推翻 freeze。

**PRD 应改：** 记录残留风险、批准主体、补偿控制（`allowedHosts`、identity alias、禁止公开 fallback）。不强制改 HTTPS，除非产品重新打开 Q15。

#### F-09 — remote/ssh 模式未定

本地 chat 才 `ensureReady`（`ipc/register.ts` ~1469）。PRD 写 Work 首次启动 Bootstrap，未说 `connectionMode=remote|ssh` 时是否仍 clone 本地 Hermes。

**PRD 应改：** local 才 Bootstrap；remote/ssh 零本地 Runtime mutation；切回 local 再触发。补负例 AC。

#### F-10 — smc-managed extras 安装命令未闭合

YAML 列 python extras / node packages / `lazyInstall: false`。未写 fork 里确切 `uv`/`npm` 命令，也未禁止 installer 现有 `[all] → core` 降级仍报成功。

#### F-11 — control-owner UI/IPC 行为未定义

忽略 `opsi|salt` 之后，`ipc/register.ts` 仍会挡住 update/doctor；RuntimePane / ConnectionErrorScreen 仍有 externally-managed 文案。未定义 getter 返回 observed 还是 effective owner。

#### F-12 — MUST → AC 追踪不完整

REQ-FORK/INSTALL/RUNTIME/POLICY 的 Acceptance 小节漏列 A-FORK-003、A-INSTALL-003、A-RUNTIME-003、A-POLICY-003。Gateway 全命令、Bootstrap 并发、remote、control-owner 无 AC。

#### F-13 — 文件分类未闭合且路径错误

`control-owner.ts` 路径错误；缺 shared/IPC/renderer/start。

#### F-14 — Phase 5/8 删除时序冲突

须写清：Phase 5 断开生产调用 vs 物理删除；Pilot 前保留清单；Phase 8 删除条件。

#### F-15 — authMode 与 A-SOURCE-004

生产默认 `anonymous-internal`。A-SOURCE-004 仍是「私有仓无凭据」。须列出 enum、区分 unreachable vs auth failed，并给 A-SOURCE-004 标明非生产 fixture `authMode`。

#### F-16 — 基线不匹配

工作区 `work/prd-v6.0 @ 1ad1af60`；PRD 写 `work/prd-v5.2 @ 090299c1`。Evidence 不可复现。

### MINOR

| ID | Note |
|---|---|
| F-17 | 文件名仍 `v2.0.0.md`，正文 `2.1.0`。应重命名或对齐版本。 |
| F-18 | §6 Inside boundary 仍有 Legacy migration。改为 Repair。 |

### NOTE（不阻塞，已核对）

| ID | Note |
|---|---|
| N1 | `install.ps1 -Commit` 在新 clone 上可以 pin HEAD；「Commit 参数无效」不是缺口。保留 fresh-install HEAD==approvedCommit AC。 |
| N2 | LOCALAPPDATA 禁令删除要求与 A-RUNTIME-003 一致；当前代码仍 forbid（`legacy-local-runtime-adapter.ts` 71–75）。实现项，不是新的 PRD 矛盾。 |
| N3 | `supportsHermesRunsTransport` 五个 feature + 四条 `/v1/runs*` 路径与 PRD 列表匹配。AC Oracle 宜逐项列出。 |
| N4 | `hermes update` 不会自行改 origin；企业 origin 仍可能走 fork→NousResearch upstream。F-003/fork patch 覆盖后补 post-update remote+trace Oracle。 |

---

## Closed / not reopened

grilling freeze F-001–F-017 作为**产品决策**仍然有效。本 review 不重开：OPSI 退出 Hermes、Native Home、无存量迁移、anonymous-internal、follow-defaultBranch、Work 代码为 capability SOT、单交互用户、policy 跟 Work 包走。

F-06 不得解释为「必须改 HTTPS」。

---

## Recommended next step

1. 按 BLOCKER F-01…F-05、F-07、F-08 修订 PRD → v2.1.1 DRAFT。  
2. 同步修 MAJOR F-09…F-16 与 MINOR F-17/F-18。  
3. 再跑一次 independent review。  
4. 仅当 BLOCKER=0 且 G1–G7 无 REVISE 时，才把 status 改为 `APPROVED_FOR_PLAN`。

**现在不得生成实施 Plan。**
