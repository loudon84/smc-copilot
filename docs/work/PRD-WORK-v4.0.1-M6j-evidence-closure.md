---
work_item_id: RM-17
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-09T22:50:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-17/evidence-closure-2026-09-09
grounded_commit: 21c645ce91f97272f5631866479ed49ec2ac497b
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.5.0
parent_prd: docs/work/PRD-WORK-v4.0.1-M6j-skill-session-ux-terminal-result-closure.md
roadmap: docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md
---

# WORK PRD v4.0.1 M6j Evidence Closure

本 Stage PRD 只关闭 Roadmap `RM-17`：为已经提交的 RM-16 / M6j 实现补齐 governed delivery 证据链，并把 RM-16 从 `IN_PRD` 收口为 `DONE`。本 Item 不重写 Session Files、Skill lock、Gateway result adapter、terminal resolver、transcript 或 File Platform 实现；不修改 Provider Bundle/schema；不修复 package-wide TypeScript baseline。

RM-16 的实现已经存在于 commit `09efa7ac`，M6j governance baseline 已经存在于 commit `91b8560b`，RM-17 Roadmap baseline 已经存在于 commit `21c645ce`。原 RM-16 delivery run 因实现先于 completion gates 提交、随后 HEAD/ambient 漂移，不能在不重置治理历史的前提下恢复。本 Item 创建一条新的、从当前 committed baseline 冻结的 evidence closure 交付，而不是改写旧 run。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-17` / M6j Evidence Closure；建项时为 `READY`，用于收口 RM-16。 |
| Parent PRD | `docs/work/PRD-WORK-v4.0.1-M6j-skill-session-ux-terminal-result-closure.md`，v1.0.0 `APPROVED / PASS`。 |
| Parent Plan | `.cursor/plans/work-v4.0.1-m6j-skill-session-ux-terminal-result-closure.plan.md`，semantic hash `sha256:74cd273d8d21e9071b4751a74a0ae8f0eeba5254dc73aa5e8e6ec658e653891c`，semantic review PASS。 |
| Implementation commit | `09efa7ac5a539975896b7e9c41cc7397101f36f5`（`feat(work): close skill session result UX`）。 |
| Governance baseline | `91b8560b` 提交 M6j PRD/reviews/Roadmap IN_PRD；`21c645ce` 提交 RM-17 READY 并通过 Roadmap validator。 |
| Repository baseline | `21c645ce91f97272f5631866479ed49ec2ac497b`（HEAD）。 |
| Old delivery state | `.smc/runs/RM-16.json` 为 `IMPLEMENTATION_BLOCKED`；T1–T3 completed，T4 blocked；completion audit / implementation review / V01–V09 / manifest 均 MISSING。 |
| Workspace recovery | 未提交的新旧混合回退已恢复到 `09efa7ac`；M6j workspace `scope_clean=true`、`unexpected_dirty=[]`。 |
| Diagnostic evidence | 恢复后本地诊断：Session/Selection/Gateway/Service/Recovery focused suites 107 tests PASS；Expert/File/Session Files regression 26 tests PASS；guard PASS；lat check PASS。这些是诊断，不是 governed evidence。 |
| Typecheck baseline | `npm --prefix apps/work run typecheck` 仍被 RM-01 残留和更早 Expert/File/Skill baseline 错误阻断；M6j PRD 未把 package-wide typecheck 作为 AC，本 Item 明确把它排除并交给独立 baseline restoration。 |

## Problem and Outcome

RM-16 的产品行为已经提交，但原 delivery run 无法证明完成：实现 commit 发生在 completion audit、implementation review、verification 和 evidence manifest 之前；后续提交与 ambient 变化使旧 workspace baseline 不可恢复。若直接把 RM-16 标为 DONE，会违反 “DONE 需要 implementation commit + verification evidence” 的 Roadmap invariant。

完成后，RM-17 从当前 committed baseline 建立新的 Plan-scoped workspace，证明 RM-16 的 approved behavior 仍然成立，生成 durable Evidence Manifest，并在独立 Roadmap status commit 中把 RM-16 更新为 DONE。旧 RM-16 run 保留为历史记录，不删除、不改写、不重冻结。

## Scope

- In: RM-16 implementation commit 的 completion audit；独立 implementation review；Session Files explicit-open、accepted skill lock、v1.5 result endpoint、terminal ordering、result recovery、sanitized boundary、Expert/File/Session Files regression、guard 和 LAT 的 fresh Plan-bound evidence；durable Evidence Manifest；RM-16 Roadmap DONE status。
- Out: 任何 production code 行为变更；Provider Bundle/schema/checksum 修改；新的 Chat/Session/File/Gateway/transcript owner；raw Provider IPC；package-wide `npm run typecheck` baseline 修复；Managed Hermes Runtime Ownership Closure；删除或重写旧 `.smc/runs/RM-16*`。
- Production Owner: 无新增 production owner。SMC Delivery/Roadmap 只拥有 governance evidence 和 status closure；既有 Chat、Main Skill Run、Gateway、Service、Session/File owners 保持不变。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| RM-16 implementation | Chat / Main Skill Run / Gateway / Service / Transcript owners | 已在 `09efa7ac` 提交；恢复后 focused diagnostic PASS | KEEP |
| RM-16 approved requirements | `PRD-WORK-v4.0.1-M6j...` | APPROVED / PASS；语义未变 | KEEP |
| RM-16 delivery proof | SMC Delivery | 旧 run blocked；无 fresh completion audit/review/evidence/manifest | MODIFY |
| RM-16 Roadmap status | Skill-First Roadmap | `IN_PRD`，无 implementation commit/evidence reference | MODIFY |
| Package-wide typecheck | Work baseline | 当前被 unrelated baseline 错误阻断；不属于 M6j AC | KEEP / OUT |

## Target End-State Inventory

| Capability | Owner | Target State | Classification |
|---|---|---|---|
| RM-16 completion proof | SMC Delivery | Completion Audit FRESH PASS；Implementation Review FRESH PASS；blocking Verification FRESH PASS；Acceptance Claims PASS | MODIFY |
| Durable evidence | SMC Evidence Manifest | `docs_agent/evidence/RM-17-evidence.json` 存在于 implementation commit，并绑定 RM-17 scope fingerprint | ADD |
| RM-16 Roadmap status | Skill-First Roadmap | RM-16 DONE，引用 `09efa7ac` 与 RM-17 evidence reference；RM-17 随后 DONE | MODIFY |
| Old RM-16 run | SMC Delivery | 保留为 blocked historical record；不作为当前 proof | KEEP |

## Change Classification

| Change ID | Capability | Current Owner | Action | Target Owner | Reason |
|---|---|---|---|---|---|
| C01 | RM-16 governed completion proof | SMC Delivery | MODIFY | SMC Delivery | 旧 run 不可恢复；从当前 committed baseline 生成 fresh audit/review/evidence。 |
| C02 | Durable evidence manifest | SMC Evidence | ADD | SMC Evidence | 当前没有可被 Roadmap validator 解析的 RM-16 evidence manifest。 |
| C03 | RM-16 Roadmap status | Skill-First Roadmap | MODIFY | Skill-First Roadmap | DONE 必须引用真实 implementation commit 与 verification evidence。 |

## Boundary / Non-Goals

- 不把旧 RM-16 run 的 blocked 状态改写成 PASS；只新增 RM-17 proof。
- 不把 diagnostic test output 当作 governed evidence；所有 blocking evidence 必须在 RM-17 workspace 冻结后重新产生。
- 不把 package-wide typecheck 失败降级为 M6j 产品缺陷；它是独立 Work baseline restoration 输入。
- 若 fresh evidence 发现 RM-16 实现行为不符合 parent PRD，本 Item 立即返回对应 PRD/Plan，不在 evidence closure 中顺手改代码。

## Acceptance Criteria

1. RM-17 workspace 从 `21c645ce91f97272f5631866479ed49ec2ac497b` 或后续不含 RM-17 scope/ambient 漂移的 HEAD 冻结；旧 RM-16 run 不被删除或重写。
2. Completion Audit 确认 RM-17 todos 全部完成、scope drift 为 0、ambient stable、implementation delta 非空。
3. 独立 Implementation Review 确认 RM-17 没有引入 production 行为变更，且 RM-16 implementation commit 与 parent PRD scope 一致。
4. Session Files explicit-open、accepted-aware selection lock、Main write-once conflict、v1.5 result endpoint、terminal order matrix、result retry/no-second-run、sanitized boundary、Expert/File/Session Files regression、guard 与 LAT 均获得 RM-17 Plan-bound fresh PASS。
5. Package-wide typecheck 不作为 RM-17 blocking evidence；其当前失败被记录为独立 baseline restoration 输入，不影响 RM-16 product behavior closure。
6. Durable Evidence Manifest 绑定 RM-17 Plan ID、scope fingerprint、Completion Audit、Implementation Review 和所有 blocking Verification PASS。
7. Implementation commit 只包含 RM-17 Plan 允许的 governance/evidence artifacts；不包含 Roadmap DONE 更新。
8. Roadmap status commit 先将 RM-16 更新为 DONE，引用 implementation commit `09efa7ac` 与 RM-17 evidence；RM-17 自身随后按同一规则 DONE。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | AC-01 | RM-17 workspace/baseline stable | Yes | 当前 HEAD 已含 RM-17 READY | NOT_TESTED | NEW_EVIDENCE | 新 closure baseline |
| CL-02 | AC-02 | Completion Audit FRESH PASS | Yes | 旧 RM-16 audit MISSING | NOT_TESTED | NEW_EVIDENCE | 旧 run 不可恢复 |
| CL-03 | AC-03 | Implementation Review FRESH PASS | Yes | 旧 RM-16 review MISSING | NOT_TESTED | NEW_EVIDENCE | 旧 run 不可恢复 |
| CL-04 | AC-04 | RM-16 product behavior proof | Yes | diagnostic focused PASS 非 governed | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | evidence must be RM-17 Plan-bound |
| CL-05 | AC-05 | typecheck baseline excluded | Yes | M6j PRD AC-01–AC-10 未要求 package-wide typecheck；当前 baseline FAIL | NOT_TESTED | NEW_EVIDENCE | explicit scope boundary |
| CL-06 | AC-06 | durable manifest | Yes | 旧 RM-16 manifest MISSING | NOT_TESTED | NEW_EVIDENCE | new closure artifact |
| CL-07 | AC-07 | implementation commit scope | Yes | `09efa7ac` exists but was not commit-guard verified | NOT_TESTED | NEW_EVIDENCE | post-hoc commit requires fresh review |
| CL-08 | AC-08 | Roadmap DONE closure | Yes | RM-16 currently IN_PRD | NOT_TESTED | NEW_EVIDENCE | status update requires proof |

## Definition of Done

1. RM-17 有一个独立 canonical Plan；不与 RM-16 原 Plan、Managed Hermes Runtime Ownership Closure 或 typecheck baseline restoration 合并。
2. CL-01–CL-08 均有 fresh PASS；Completion Audit、Implementation Review、blocking Verification 和 Evidence Manifest 均为 RM-17 current scope fingerprint 下的 FRESH PASS。
3. 不修改 production code；若 evidence 暴露产品缺陷，返回 parent PRD/Plan 或新开 defect item。
4. Implementation commit 与 Roadmap status commit 分离；RM-16 DONE 必须引用真实 implementation commit `09efa7ac` 和 RM-17 evidence reference。
5. 旧 `.smc/runs/RM-16*` 保留为历史记录；本 Item 不通过删除/重置治理状态取得 PASS。
