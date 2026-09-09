---
work_item_id: RM-02
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-10T07:20:00+08:00
source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.2.0/RM-02/verification-closure-2026-09-10
grounded_commit: 983d2b484cafbfeb019af76957ff17c982b0908d
grounding_mode: revision
parent_prd: docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md
roadmap: docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md
product_version: v4.1.0
runtime_contract: managed-local-v1
---

# WORK PRD v4.1.0 — Managed Hermes Verification Closure

本 Stage PRD 只关闭 Roadmap `RM-02`：为已经提交的 Managed Hermes Runtime Ownership Closure（`cb562e91`）补齐 governed delivery 证据链，并把 Roadmap `RM-01` 从 `IN_PRD` 收口为 `DONE`。本 Item **不**重做 Self-Install / Gateway supervisor 删除。

前置合同修订：parent PRD **v1.1.3** 已把 AC-20 收窄为 focused unit + `lat check`（package-wide typecheck → baseline restoration），并把 AC-21/C05 听口匹配扩展为「期望 `hermes.exe` **或** 同 managed install-root 的 `python.exe` + 可解析 CommandLine 含期望 CLI 绝对路径 token 与 `gateway`/`run`」。本 Item 实现该听口 oracle，并跑完整 LOCAL/LIVE 证明。

原 `WORK-V4.1.0-RUNTIME-RM-01` delivery run 停在 `IMPLEMENTATION_COMPLETE` 且 ambient 已污染；不删除、不重写该 run。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-02` READY（commit `983d2b48`）。 |
| Parent PRD | v1.1.3（本轮 revision；关闭 initial review F1）。 |
| Parent Plan | `.cursor/plans/work-v4.1.0-managed-hermes-runtime-ownership-closure.plan.md`（`WORK-V4.1.0-RUNTIME-RM-01`）。 |
| Implementation commit | `cb562e91`。 |
| Old run | `.smc/runs/WORK-V4.1.0-RUNTIME-RM-01.json` = `IMPLEMENTATION_COMPLETE`；audit/review/V*/manifest MISSING。 |
| Listen packaging | `:8642` OwningProcess=`...\Hermes\python\python.exe`；CommandLine 含 `...\bin\hermes.exe gateway run --replace`；health 200。 |
| Typecheck | package-wide FAIL（Skill-First/Expert/File + hermes unused）；按 parent v1.1.3 排除。 |
| Initial review | `docs/work/reviews/prd-work-v4.1.0-managed-hermes-verification-closure-initial-review.md` → RETURN_PRD（F1/F2/F3）。 |

## Problem and Outcome

见 v0.1.0；另关闭审查 F1–F3：typecheck 排除改由 parent 批准；听口匹配改为 fail-closed managed-root 规则；parent V12 拆分为 focused unit/lat/docs/status（阻断）与 package-wide typecheck（排除）。

## Scope

- **In：** completion audit；implementation review；parent LOCAL V01–V03/V06/V07/V09/V11；拆分后的 V12 非 typecheck 部分（package tests 若过重则用 parent focused unit 集 + `lat check` + docs/status oracles）；LIVE V04/V05/V08/V10/V13；`gateway-probe.ts`（+单测）实现 parent v1.1.3 合法 managed Gateway 判定；closure record；durable manifest（owned_control）；RM-01/RM-02 DONE status。
- **Out：** 重做 RM-01 删除面；Installer 打包；Credential；Skill Run；package-wide typecheck 修复；改写旧 run；foreign fail-open。
- **Production Owner：** 仍为 `gateway-probe.ts` + `LegacyLocalRuntimeAdapter`。

## Change Classification

| Change ID | Capability | Action | Reason |
|---|---|---|---|
| C01 | Closure record | ADD | baseline/old-run/V-mapping/typecheck exclusion attestations |
| C02 | Durable Evidence Manifest | ADD | owned_control only；不进 planned_files |
| C03 | Listen-match oracle | MODIFY | 实现 parent v1.1.3 合法 managed Gateway 规则（同 root python + argv tokens）；foreign 仍 CONFLICT |
| C04 | Roadmap RM-01/RM-02 status | MODIFY | DONE refs |

## Acceptance Criteria

- **AC-01**: workspace 冻结；旧 parent run 字节保留。
- **AC-02**: Completion Audit FRESH PASS。
- **AC-03**: Implementation Review FRESH PASS；除 C03 外无额外 production 扩张。
- **AC-04**: LOCAL V01–V03/V06/V07/V09/V11 FRESH PASS。
- **AC-05**: Listen-match 单测 + 行为：
  - expected `hermes.exe` 直接监听 → match；
  - same-install-root `python.exe` + CommandLine 含期望 CLI 绝对路径 + `gateway` + `run` → match；
  - other-root / bare python / missing CommandLine / unparseable / foreign exe / mixed listeners → 非 READY（CONFLICT 或 configuration_error）；永不 kill。
- **AC-06**: LIVE V04/V05/V08/V10/V13 FRESH PASS（ENV-02 + 合法 managed listener）。Foreign listener → BLOCK + defect，不 fail-open。
- **AC-07**: package-wide typecheck 排除并写入 closure（parent AC-20 v1.1.3）；V12 的 focused unit/`lat`/docs/status 部分仍阻断。
- **AC-08**: Durable manifest owned_control；不 stale fingerprint。
- **AC-09**: Impl commit 仅 Plan 允许文件；无 Roadmap DONE。
- **AC-10**: Status commit：RM-01 DONE（parent Plan + `cb562e91` + `external-artifact:docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json`）然后 RM-02 DONE（`smc-evidence:WORK-V4.1.0-RUNTIME-RM-02@sha256:<fp>`）。

## Definition of Done

- **DOD-01**: AC-01–AC-10 FRESH PASS under RM-02 scope。
- **DOD-02**: 独立 Plan；不与 parent Plan 合并。
- **DOD-03**: 除 C03 外无无关 production。
- **DOD-04**: Impl/status commit 分离；证据引用过 `validate_roadmap_v11.py --no-architecture-check`。
- **DOD-05**: 旧 parent run 保留。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Result | Evidence Action |
|---|---|---|---|---|---|
| CLM-01 | AC-01 | frozen + old run preserved | yes | FAILED ambient | NEW_EVIDENCE |
| CLM-02 | AC-02 | audit FRESH PASS | yes | MISSING | NEW_EVIDENCE |
| CLM-03 | AC-03 | review FRESH PASS | yes | MISSING | NEW_EVIDENCE |
| CLM-04 | AC-04 | LOCAL V set PASS | yes | MISSING | NEW_EVIDENCE |
| CLM-05 | AC-05 | fail-closed listen-match | yes | false CONFLICT | NEW_EVIDENCE |
| CLM-06 | AC-06 | LIVE PASS | yes | blocked | NEW_EVIDENCE |
| CLM-07 | AC-07 | typecheck excluded; V12 remainder PASS | yes | package-wide FAIL | NEW_EVIDENCE |
| CLM-08 | AC-08 | manifest binds | yes | MISSING | NEW_EVIDENCE |
| CLM-09 | AC-09 | commit scope | yes | ungated | NEW_EVIDENCE |
| CLM-10 | AC-10 | roadmap refs | yes | IN_PRD | NEW_EVIDENCE |

## Review Closure of F1–F3

| Finding | Resolution |
|---|---|
| F1 | parent v1.1.3 AC-20 + RM-01 Exit Criteria 同步批准后，RM-02 才可排除 package-wide typecheck |
| F2 | AC-05/C03 采用同 install-root python + 精确 CLI path token + `gateway`/`run`；否则非 READY |
| F3 | AC-07 明确保留 V12 非 typecheck 阻断部分 |
