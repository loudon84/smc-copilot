# PRD-WORK-HERMES-NATIVE-ENTERPRISE-RUNTIME-V2 v2.1.1 — Independent Re-Review

**Mode:** re-review（v2.1.0 BLOCKER 关闭后）  
**Verdict:** REVISE  
**Plan gate:** BLOCKED  
**Reviewed artifact:** `docs/architecture/PRD-WORK-Hermes-Native-Enterprise-Fork-Runtime-v2.0.0.md` (body `version: 2.1.1`, `status: DRAFT`)  
**prd_id:** `PRD-WORK-HERMES-NATIVE-ENTERPRISE-RUNTIME-V2`  
**Independent reviewer:** code-review subagent (no author session history)  
**Adjudication:** parent agent verified M-01 against `apps/work/src/main/run-stream.ts` and patched A-COMPAT-001 Oracle after this review (SOT pointer only; no copied feature names). Status remains DRAFT until light closure review PASS.  
**Grounded commit (workspace):** `1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31`  
**Actual branch:** `work/prd-v6.0`  
**PRD frontmatter claim:** `work/prd-v6.0` / `1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31` — **match**  
**Hermes fork working copy:** `e:\git\hermes-agent` origin `http://git.superic.com/aiplatform/hermes-agent.git` HEAD `29112bef0`  
**Clarification provider:** grilling freeze 2026-09-18 (§0.1 F-001–F-017) + §0.2 C-001–C-008

本 review **只读**（审查员未改文件）。不生成 Plan。不把 status 改为 `APPROVED_FOR_PLAN`。不授权实现。

不采信作者叙述。产品方向已冻；本 verdict 针对 **合同是否可唯一编译为 Plan**。

---

## Verdict

**REVISE。禁止 PLAN。保持 DRAFT。**

v2.1.0 的 7 个 BLOCKER 全部关闭。G1–G5、G7 PASS。G6 因 A-COMPAT-001 Oracle 枚举与 Work-code SOT 矛盾（M-01）REVISE。

独立审查员未修改任何文件。父代理在本文件落盘后按审查员建议修正 A-COMPAT-001，另开轻量 closure review。

---

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | NON-GOAL-009/010/011 明确；remote/ssh 由 §0.2 C-007 + A-INSTALL-006 + N-A-013 关闭；§6.2 Inside boundary 已改为 "wrong-origin Repair" |
| G2 Duplicate owner | PASS | §30「Phase 5 ≠ 物理删除。Phase 8 才删除文件」；§16.3 + §29 Replacement Matrix 闭合 |
| G3 Production ownership | PASS | ADR-038 已交付；ADR-031 Decision 2/4 就地标注 superseded；C-005 修正 control-owner 路径 |
| G4 Classification | PASS | §28.1/28.2/28.3 Work/Release 路径经 `Test-Path` 存在；含 `hermes/control-owner.ts`、`shared/runtime/control-owner.ts`、`ipc/register.ts`、`app/start.ts`、RuntimePane/ConnectionErrorScreen |
| G5 Contract / Security | PASS | §9.1 ONE-OF + HTTP-only 合法；§9.3 official-source.json schema；C-008 HTTP 残留风险；§9.4 映射表；C-007 执行合同 |
| G6 Behaviour → AC | REVISE | A-COMPAT-001 Oracle 枚举与 `run-stream.ts` / REQ-COMPAT-001 矛盾（M-01） |
| G7 Evidence integrity | PASS | status DRAFT 诚实；baseline SHA/branch 与实测一致；`SKIPPED != PASS`；文件名 v2.0.0 vs 正文 2.1.1 已声明有意保留 |

---

## Findings

### BLOCKER

无。v2.1.0 的 7 个 BLOCKER 全部关闭。

### MAJOR

#### M-01（F-12 残留）— A-COMPAT-001 Oracle 与 capability SOT 代码矛盾

审查当时 §20 A-COMPAT-001 Oracle 枚举 `openai_compatible_base`、`session_continuity`、`run_cancel` 与路径 `/v1/runs/{id}/cancel`、`/approve`。

实测 `apps/work/src/main/run-stream.ts:25-40` required set 为：

- features: `run_submission`、`run_events_sse`、`run_stop`、`run_approval_response`、`tool_progress_events`
- paths: `/v1/runs`、`/v1/runs/{run_id}/events`、`/v1/runs/{run_id}/approval`、`/v1/runs/{run_id}/stop`

REQ-COMPAT-001 枚举正确。AC Oracle 复制了错误名字 → `SPEC_SEMANTIC_GAP`。

**PRD 应改：** Oracle 只引用 SOT 指针、不再枚举；或把枚举修正为与 `supportsHermesRunsTransport` 一致。

**Parent adjudication（审查后）：** 采用 SOT 指针，不再在 AC 复制 feature/path 名。

### MINOR

无新增。F-17/F-18 已关闭。

### NOTE（不阻塞）

| ID | Note |
|---|---|
| N1 | `install.ps1` `-Stage git` / PortableGit 可落地；`-RepoUrl` 需 fork 新增 |
| N2 | `gateway_windows.py` `get_task_name()` 按 profile 派生任务名 |
| N3 | `pyproject.toml` extras 与 `uv sync --extra …` 闭合 |
| N4 | `update_cmd.py` 公开 upstream / ZIP fallback 问题描述准确 |
| N5 | 现网 `get-control-owner` 仍返回单 owner；改造点定位准确 |
| N6 | JSON `originUrls` null vs YAML 省略字段是两套文件规则，各自自洽 |

---

## Closed / not reopened

| ID | 状态 | 关闭条款 |
|---|---|---|
| F-01 | CLOSED | C-001 + §9.1 + §12.2 |
| F-02 | CLOSED | C-002 + A-INSTALL-004 |
| F-03 | CLOSED | C-003 + §9.3 + A-OFFICIAL-001 |
| F-04 | CLOSED | C-004 + A-GW-003/004 |
| F-05 | CLOSED | C-005 + ADR-038 + ADR-031 Decision 2/4 标注 |
| F-06 | CLOSED | C-008；未重开 Q15 |
| F-07 | CLOSED | §9.4 |
| F-08 | CLOSED | C-007 + A-INSTALL-005/006 |
| F-09 | CLOSED | C-007 + A-INSTALL-006 + N-A-013 |
| F-10 | CLOSED | REQ-FORK-001 uv extras + A-FORK-003 |
| F-11 | CLOSED | `{observed, effective}` + A-OWNER-001 |
| F-12 | STILL OPEN（部分） | 矩阵已补齐；A-COMPAT-001 Oracle 错误见 M-01 |
| F-13 | CLOSED | §28 路径实测 |
| F-14 | CLOSED | Phase 5 disconnect vs Phase 8 delete |
| F-15 | CLOSED | A-SOURCE-004 fixture-scoped |
| F-16 | CLOSED | `work/prd-v6.0 @ 1ad1af60` |
| F-17 | CLOSED | 文件名有意保留 |
| F-18 | CLOSED | §6.2 Repair |

grilling freeze F-001–F-017 不重开。F-06 不得解释为必须改 HTTPS。

---

## Recommended next step

修正 A-COMPAT-001 Oracle 后做轻量 closure review。BLOCKER=0 且 G6 PASS 后，才可将 status 改为 `APPROVED_FOR_PLAN`。现在不得生成实施 Plan。
