---
work_item_id: RM-03
version: v1.0.1
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-10T18:21:00+08:00
source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.2.2/RM-03 + user-input:2026-09-10-v4.1.2-programroot-ownership
grounded_commit: a404d7346ce1fb777515bcd67b7bd0a49fc39030
grounding_mode: revision
proposal_source: reports/WORK PRD v4.1.2.md
parent_prd: docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md
prior_stage_prd: docs/work/PRD-WORK-v4.1.0-managed-hermes-verification-closure.md
roadmap: docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md
product_version: v4.1.2
runtime_contract: managed-local-v1
---

# WORK PRD v4.1.2 — Managed Hermes Verification Boundary Closure

本 Stage PRD 关闭 Roadmap `RM-03`：在 **不** 重开 RM-01 Data Plane Client / Gateway lifecycle 的前提下，把 Windows 托管听口所有权从「监听映像必须是 `hermes.exe`，或同 root `python.exe` 且 CommandLine 含 `hermes.exe` + `gateway` + `run`」收口为「监听映像属于 Locator 已解析的 managed ProgramRoot」。`runtimeContract` 保持 `managed-local-v1`。不新增 Runtime Adapter，不修改 Hermes 打包，不虚构 Gateway `/api/*`。

本 Item 合入后，**本文件是 Windows 听口身份的唯一生产验收 oracle**。它替代 parent v1.1.3 C05「合法 managed Gateway 进程」定义、parent AC-21 的听口身份条款、以及 RM-02 AC-05 / C03 听口 oracle。其余 parent AC（无 Python Runtime、无 Work spawn/kill、CLI 经 `hermes.exe`、AppData home 拒绝、health/auth 门、非 Windows 听口非必测面等）KEEP。禁止把新旧听口规则 AND 后同时执行。

叙述稿 `reports/WORK PRD v4.1.2.md` 不是合同；本文件才是 Stage PRD。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Proposal | `reports/WORK PRD v4.1.2.md`（现场 CONFLICT：health/auth 已成功，监听为 ProgramRoot 内 `python.exe -m hermes_cli.main gateway run`） |
| Architecture | `docs/work/PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md` ADR-01/02/05/07；Work 不是 Gateway Process Owner |
| Parent Stage | `docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md` v1.1.3；听口身份条款由本 PRD 替代，全文不重写 |
| Prior Stage | `docs/work/PRD-WORK-v4.1.0-managed-hermes-verification-closure.md` RM-02 AC-05/C03 听口 oracle 由本 PRD 替代 |
| Roadmap | `docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md` **RM-03 IN_PRD**；依赖 RM-02 DONE |
| Repository baseline | `a404d7346ce1fb777515bcd67b7bd0a49fc39030`（HEAD） |
| Freshness | `evidence_freshness.py` → **REUSE**（source_revision 与 HEAD 未变）。本轮 `revision` 只关 initial review M1/M2/N1–N3；Inventory / Source Anchors 复用 |
| Initial review | `docs/work/reviews/prd-work-v4.1.2-managed-hermes-verification-boundary-closure-initial-review.md` → REVISE |
| Source Anchors | `apps/work/src/main/runtime/gateway-probe.ts`；`apps/work/src/main/runtime/legacy-local-runtime-adapter.ts`；`apps/work/src/shared/runtime/runtime-contract.ts`；`apps/work/src/main/runtime/hermes-runtime-config.ts`；`apps/work/src/main/runtime/hermes-runtime-locator.ts`；`apps/work/lat.md/runtime-connection.md` |
| Listen-match (HEAD) | `isManagedHermesGatewayProcess`：映像==CLI → match；否则仅当映像==`{installRoot}/python/python.exe` **且** CommandLine 含期望 CLI 绝对路径 **且** token `gateway`/`run`。`python -m hermes_cli.main gateway run` → mismatch → CONFLICT |
| Probe wiring (HEAD) | Adapter 把 Locator CLI 路径传入听口检查；`runtimeContextVerified` 仅在 `status=match` 为真；无 `listenerOwnership` / `listenerExecutable` |
| Locator (HEAD) | `getHermesProgramRoot()` / `HermesRuntimeLocation.programRoot` 已存在；默认 Windows `D:\Programs\SMC\Hermes` |
| LAT (HEAD) | `runtime-connection.md` Gateway probe 仍写「managed `hermes.exe`」 |
| Unit (HEAD) | `gateway-probe.test.ts` **拒绝** managed python 且 CommandLine 不含 CLI 绝对路径（与现网失败同构） |
| Lifecycle (HEAD) | Adapter `restart()` 仍拒绝；spawn/kill 不在本 Item 重开 |

## Problem and Outcome

RM-02 已按 parent v1.1.3 实现 fail-closed 听口：接受「同 install-root python **启动** `hermes.exe gateway run`」。现网 OPSI managed Gateway 的 **TCP 监听进程** 却是 ProgramRoot 内 `python.exe`，CommandLine 为 `-m hermes_cli.main gateway run`，**不含** `hermes.exe` 绝对路径。于是 `/health=200` 且 `authenticated=true` 仍报 `conflict`：「not the managed Hermes CLI」。这是听口身份合同与真实 managed process tree 不一致，不是 health/auth 失败，也不是 Work 又开始 start/kill Gateway。

完成后：Windows 托管下，配置端口上**全部**已解析监听映像落在 Locator ProgramRoot 目录边界内即视为 managed（PID 个数不否决）；恰好一个且越界为 CONFLICT；多个且并非全部在边界内为 `configuration_error`；听口检查失败仍非 READY；永不对 PID 发信号；管理 CLI 仍只经绝对路径 `hermes.exe`；Probe 可观察所有权分类。Work 不依赖 Hermes 内部是 hermes.exe 直听、python 包装还是 node 运行时。Plan/Audit **不得**再要求 CommandLine 含 `hermes.exe`。

## Scope

- **In：** Windows 听口所有权判定改为 managed ProgramRoot 边界（替代既有听口身份 oracle）；`runtimeContextVerified` 语义对齐该边界；Probe 增加可观察所有权字段；LAT Gateway probe 文本与合同对齐；针对 ProgramRoot 内/外监听与多监听状态机的阻断证明。
- **Out：** Hermes Installer / OPSI 包 / Gateway 生命周期；Hermes CLI 实现；Profile / Skill Registry / Endpoint Configuration；新增 Adapter 或 `managed-local-v2`；重做 RM-01 删除面；package-wide typecheck；`apps/desktop`；Renderer 必须展示新字段（Payload 有即可）；重写已 DONE parent/RM-02 全文。
- **Production Owner：** 仍为现有 Gateway 听口检查 + `LegacyLocalRuntimeAdapter` Probe。ProgramRoot 的 SOT 仍是现有 Runtime config / Locator。OPSI / Managed Installer 仍拥有 Gateway 进程。
- **Oracle supersede（M2）：** 合入后唯一有效的 Windows 听口身份合同是本 PRD C01。被替代条款：parent C05「合法 managed Gateway 进程」两条（CLI 相等 / 同 root python + CommandLine tokens）、parent AC-21 听口身份、RM-02 AC-05 与 RM-02 C03。CommandLine 不再作为所有权输入。parent 其余 AC KEEP。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Data Plane Client / no Gateway spawn-kill | Work Main runtime + IPC refuse | RM-01/RM-02 已收口 | KEEP |
| Runtime contract name / Adapter identity | `managed-local-v1` + LegacyLocal adapter | 生产冻结 | KEEP |
| Locator ProgramRoot | Runtime config + Locator | EXISTS（`programRoot` 可解析） | KEEP |
| Management CLI | `hermes-cli-runner` | 绝对路径 `hermes.exe` | KEEP |
| Gateway health + auth probe | 现有 Gateway probe | EXISTS；现网 PASS | KEEP |
| AppData hermes home 拒绝 | Adapter probeLocal | EXISTS；`configuration_error` | KEEP |
| Windows listen inspect（只读 OS 诊断能力） | 现有 Gateway probe + Adapter | EXISTS；不杀 PID | KEEP |
| Listen-match identity | 现有听口判定 | PARTIAL：CLI 直听或 python+`hermes.exe` tokens；现网 `-m hermes_cli.main` → FAILED CONFLICT | REPLACE |
| CommandLine 作为所有权输入 | 同上 | EXISTS；导致现网误 CONFLICT | REMOVE |
| `runtimeContextVerified` | `HermesRuntimeProbe` | EXISTS；注释/语义=matched managed CLI | MODIFY |
| Probe 所有权分类 / 实际监听路径 | `HermesRuntimeProbe` | MISSING | ADD |
| LAT Gateway probe 文本 | `lat.md/runtime-connection.md` | 仍要求 managed `hermes.exe` 听口 | MODIFY |
| Renderer Connection Ready | Runtime reducer / splash | 以 `state` 为准 | KEEP |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Listen-match identity | 现有 Gateway 听口检查 | 见 C01 状态表：全部在 ProgramRoot 边界内 → managed；恰好一个越界 → CONFLICT；多个且并非全部在边界内 → `configuration_error`。不读 CommandLine。 | REPLACE |
| CommandLine 所有权输入 | — | 生产听口所有权不再使用 CommandLine tokens | REMOVE |
| 检查失败 / 无监听 | 同一 Probe Owner | 非 READY（`configuration_error` 或等价）；禁止 kill；禁止 fail-open READY | KEEP |
| `runtimeContextVerified` | 现有 Probe 合同 | Windows 仅当听口检查成功完成且**全部**监听属于 ProgramRoot 时为真 | MODIFY |
| Probe 所有权观察 | 现有 `HermesRuntimeProbe` | 见 C01：`managed` / `foreign` / `unknown` 与 `listenerExecutable` | ADD |
| LAT | 现有 runtime-connection | 所有权边界=managed ProgramRoot；Work 不依赖 Hermes 内部 runtime 实现细节 | MODIFY |
| CLI / lifecycle / Adapter / health+auth / AppData home | 既有 owner | 不变 | KEEP |

## Change Classification

| Change ID | Capability | Action | Reason |
|---|---|---|---|
| C01 | Windows listen-match identity | REPLACE | 现网 managed listener 是 ProgramRoot 内 python `-m hermes_cli.main`，旧 CLI/CommandLine oracle 误 CONFLICT |
| C02 | CommandLine-as-ownership | REMOVE | Work 不得把 Hermes 内部 argv 当作产品合同 |
| C03 | `runtimeContextVerified` 语义 | MODIFY | 从「matched hermes.exe / CLI」改为「全部监听属于 ProgramRoot」 |
| C04 | LAT Gateway probe 文本 | MODIFY | 删除 managed hermes.exe listener 表述 |
| C05 | Data Plane Client、Adapter、CLI、health/auth、AppData home、无 spawn/kill | KEEP | 非本能力 |
| C06 | Probe `listenerOwnership` / `listenerExecutable` | ADD | 冲突诊断需要所有权分类与实际映像；不新增协议 |

## Replacement / Removal Matrix

| Replaced Production Path | Existing Owner | Target Path | Removal Condition |
|---|---|---|---|
| 听口身份 = CLI 路径相等，或同 root `python.exe` + CommandLine 含 CLI 绝对路径 + `gateway` + `run`（parent C05 / AC-21；RM-02 AC-05 / C03） | Gateway listen-match | 听口身份 = C01 状态表（ProgramRoot 目录边界） | 本 PRD 实现合入后，上述条款不再是生产验收 oracle；所有权判定不再读取 CommandLine；旧单测夹具不得继续把「无 hermes.exe token」定义为非 READY |
| Probe 文案/语义「not the managed Hermes CLI」作为唯一冲突解释 | Adapter fail path | 冲突表示恰好一个监听不属于 managed ProgramRoot；禁止暗示 Work 应 stop 该进程 | 同 commit；修复仍属 endpoint management / OPSI |

无第二套 Adapter、无第二套 Locator、无新 HTTP 合同。

## Contract and Security Boundary

- Work 仍不安装、不升级、不修复 Hermes，不注册计划任务，不对非自身 spawn 的 PID 发信号。
- 听口检查仍是只读 OS 诊断；Windows 托管下仍是 READY 硬门：失败不得 fail-open。
- ProgramRoot 来自现有 Locator/config，不是用户 PATH，不是 `%LOCALAPPDATA%\hermes`。
- 目录边界必须 fail-closed：`D:\Programs\SMC\Hermes` 不得把 `D:\Programs\SMC\HermesExtra\...` 或 `...\Hermes-evil\...` 判为 managed。
- ProgramRoot 为空、相对路径或无法规范化 → 听口检查失败 → 非 READY，不是 CONFLICT。
- `/health=200` 单独仍不得等于 READY。
- 不得新增 Runtime Adapter 或改名 `managed-local-v1`。
- 管理 CLI 仍经绝对路径 `hermes.exe`。Work 生产代码仍不得 `python -m hermes_cli.*`；监听进程内部如何启动是 Hermes Runtime 细节，不是 Work 调用面。

## C01 Listen-match Behaviour Freeze

不新增 Adapter。Owner 仍是现有 Probe / 听口检查。输入改为 Locator ProgramRoot（已有），不再把 CLI 路径当作所有权期望映像。

**本冻结替代** parent C05「合法 managed Gateway 进程」、parent AC-21 听口身份、RM-02 AC-05/C03。CommandLine **不是** 所有权输入，也不得作为额外否决条件。

### 路径边界

听口检查成功解析到的每个 OwningProcess 可执行路径（规范化：分隔符、去尾部分隔符、Windows 大小写不敏感）为 **in-boundary** 当且仅当：

1. 等于 ProgramRoot；或
2. 以 `ProgramRoot + 路径分隔符` 为前缀。

映像基名是 `hermes.exe` / `python.exe` / `node.exe` 或其它 ProgramRoot 内二进制 **不** 作为额外否决条件。

### 状态表（互斥，按行唯一适用）

在 health 成功且 auth 成功之后，Windows 托管听口结论：

| # | 观察 | Probe `state` | `listenerOwnership` | `runtimeContextVerified` | Work 行为 |
|---|---|---|---|---|---|
| 1 | 检查成功，存在 ≥1 个监听，**全部** in-boundary（PID 个数不否决） | `ready` | `managed` | true | 允许 Chat/CLI；不 start/stop/kill |
| 2 | 检查成功，**恰好一个**监听，且该映像 not in-boundary | `conflict` | `foreign` | false | 不得 READY；不得 kill；修复属 OPSI/Installer |
| 3 | 检查成功，**多个**监听，且并非全部 in-boundary | `configuration_error`（或等价非 READY） | `unknown` | false | 不得 READY；不得 kill；不得标 `managed` 或 `foreign` 作为单一结论 |
| 4 | 检查失败（权限/API/无法解析映像、ProgramRoot 无效） | `configuration_error` | `unknown` | false | 不得 READY；不得把失败解释为跳过听口 |
| 5 | health 成功但无本地监听 | `configuration_error` | `unknown` | false | 不得 READY |
| 6 | health 或 auth 失败 | UNAVAILABLE（既有 `gateway_unreachable` / `gateway_auth_failed`） | `unknown` | false | 不 start Gateway |
| 7 | 非 Windows | 听口 `not_required`；READY 规则保持 RM-01 非 Windows 条款 | `unknown` | 不因听口为真 | 听口不是本 PRD 必测面 |

禁止用未定义的「混合监听」一词。行 1 与行 3 以「是否全部 in-boundary」区分，不以 PID 个数把行 1 打成非 READY。

`listenerExecutable`：行 1/2 在已解析到映像时给出该路径（多个 in-boundary 时给出已解析路径集合中的可观察值即可）；行 3–7 可省略或给出已解析路径但不把 ownership 标为 `managed`。

## Acceptance Criteria

- **AC-01**: Windows 托管、health 成功、auth 成功、存在 ≥1 个监听且全部 in-boundary（含 ProgramRoot 内 `python.exe`，即使 CommandLine 为 `-m hermes_cli.main gateway run` 且不含 `hermes.exe`；PID 个数不否决）→ Probe `state=ready` 且 `runtimeContextVerified=true` 且 `listenerOwnership=managed`。Work 不 start/stop/kill Gateway。
- **AC-02**: 同上前置，监听映像为 ProgramRoot 内 `hermes.exe` → READY（`listenerOwnership=managed`）。
- **AC-03**: 检查成功且**恰好一个**监听、映像 not in-boundary（含用户 AppData hermes、系统 Python、其它 Program Files 应用）→ `state=conflict`，`runtimeContextVerified=false`，`listenerOwnership=foreign`，Probe 带上实际 `listenerExecutable`；进程 PID 不变。
- **AC-04**: 行 3–5：多个监听且并非全部 in-boundary、听口检查失败、或无本地监听 → `configuration_error`（或等价非 READY），不是 `ready`，也不是行 2 的 `conflict`；`runtimeContextVerified` 不为真；`listenerOwnership` 不得为 `managed`。
- **AC-05**: ProgramRoot 前缀不得把兄弟目录判为 managed（Hermes vs HermesExtra / Hermes-evil）。
- **AC-06**: 管理 CLI 路径合同不变：profile/skill/mcp/doctor 等仍经绝对路径 `hermes.exe`，不改为 python module。
- **AC-07**: Work 生产路径仍不 spawn/kill Gateway；conflict 文案不得指示用户或 Work 去 stop 该监听进程。
- **AC-08**: LAT Gateway probe 描述所有权边界为 managed ProgramRoot，不再要求「managed hermes.exe listener」。
- **AC-09**: `runtimeContract` 仍为 `managed-local-v1`；不新增 Adapter。
- **AC-10**: Windows 托管真机：在 Gateway 已由 OPSI/Installer 拉起、health+auth 已成功的现网形态下，Runtime Probe 达到 READY（阻断 LIVE）。Foreign 占用配置端口（恰好一个越界监听）仍 CONFLICT。
- **AC-11**: 同上前置（health+auth 成功），监听映像为 ProgramRoot 内 `node.exe` → READY（`listenerOwnership=managed`）。

## Definition of Done

- **DOD-01**: AC-01 through AC-11 blocking Acceptance Claims PASS；不得把现网 CONFLICT 改写成 observation 后 closure。
- **DOD-02**: 除 C01–C04 与 C06 外无无关生产扩张；不重开 Self-Install / Gateway supervisor。
- **DOD-03**: Implementation commit 不含 Runtime Roadmap DONE；Roadmap 状态在证据之后独立更新。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | ProgramRoot 内 python `-m hermes_cli.main gateway run` → READY（全部 in-boundary） | 是 | RM-02 AC-05 / HEAD 拒绝无 CLI 路径的 CommandLine；现网 CONFLICT | FAILED | NEW_EVIDENCE | 旧 oracle 与真实 process tree 不一致；本 PRD 替代该 oracle |
| CLM-02 | AC-02 | ProgramRoot 内 hermes.exe 直听 → READY | 是 | RM-02 hermes.exe 直听 match | PROVEN_BUT_AFFECTED | TARGETED_RERUN | 身份规则更换为 ProgramRoot 边界 |
| CLM-03 | AC-03 | 恰好一个越界监听 → CONFLICT，不 kill | 是 | RM-02 单 foreign CONFLICT | PROVEN_BUT_AFFECTED | TARGETED_RERUN | 匹配输入从 CLI 改为 ProgramRoot；行 2 与行 3 已拆开 |
| CLM-04 | AC-04 | 行 3–5 非 READY：多监听非全部 in-boundary / 检查失败 / 无监听 → `configuration_error` | 是 | RM-02 inspect_failed / no_listener / mixed_listeners | PROVEN_BUT_AFFECTED | TARGETED_RERUN | 接线与语义字段变化；删除未定义「混合监听」 |
| CLM-05 | AC-05 | 兄弟目录前缀攻击 fail-closed | 是 | 无 | NOT_TESTED | NEW_EVIDENCE | 新边界规则 |
| CLM-06 | AC-06 | CLI 仍为 hermes.exe | 是 | RM-01 CLI runner | PROVEN_FRESH | REUSE_EVIDENCE | 本 Item 不改 CLI owner |
| CLM-07 | AC-07 | 无 spawn/kill | 是 | RM-01/RM-02 guards + IPC refuse | PROVEN_FRESH | REUSE_EVIDENCE | 本 Item 不重开 lifecycle |
| CLM-08 | AC-08 | LAT 文本 | 是 | `runtime-connection.md` 仍写 hermes.exe listener | FAILED（文档过窄） | NEW_EVIDENCE | 合同变更 |
| CLM-09 | AC-09 | 无新 Adapter / 合同名不变 | 是 | Adapter freeze guard | PROVEN_FRESH | REUSE_EVIDENCE | 禁止扩张 |
| CLM-10 | AC-10 | 托管真机 Probe READY | 是 | 本报告现场 health/auth PASS、Probe CONFLICT | FAILED | NEW_EVIDENCE | 正是本 Item 要关闭的缺口 |
| CLM-11 | AC-11 | ProgramRoot 内 node.exe 直听 → READY | 是 | 无 | NOT_TESTED | NEW_EVIDENCE | 产品合同新增合法类，与 hermes.exe 分证 |

禁止把 CLM-01/CLM-10 的现场 FAIL 改写成 observation 后继续 closure。禁止因新 RM 默认全量重跑 RM-01 删除面证明。禁止用 parent AC-21 / RM-02 AC-05 作为本 Item 的听口 PASS 标准。

## Non-Goals / Follow-ups

- 不修改 `infra/windows/hermes-agent` 或 OPSI 包，使监听改回 `hermes.exe` 直听来迁就旧 oracle。
- 不把 `python -m hermes_cli.main` 重新引入 Work 生产调用面。
- Skill Registry / Endpoint Configuration（v4.1.1 Roadmap）不在本 Item。
- Renderer 展示 `listenerOwnership` 可另立 UX Item；本 Item 只冻结 Probe payload。
- 不把已 DONE 的 parent / RM-02 Stage PRD 改写成 SUPERSEDED 全文；听口身份条款的生产效力以本 PRD 为准。
