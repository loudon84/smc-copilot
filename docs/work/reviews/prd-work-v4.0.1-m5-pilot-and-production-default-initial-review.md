# M5 Pilot and Production Default — Initial PRD Review

Review scope is RM-06 Stage PRD v1.0.0 (`REVIEW_REQUIRED`). Evidence freshness is `REUSE` against `grounded_commit` `ec41e20dcde37c8cee3c5824b1eff2bf32355d01` and `source_revision` `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-06`; this review does not re-ground the repository. It does not approve a Plan, mark RM-06 DONE, or authorize Expert entry removal.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In is Skill Run telemetry, rollback handbook, internal pilot/promotion packaging, default `skill-first` proof, and no silent fallback. Out keeps Expert removal, P1 cards/forms/attachments, hosted metrics UI, updater-log reuse as a bus, and Expert resubmit. Production default is KEEP of HEAD `8314e5c7`, not a second flip. |
| G2 Existing capability | PASS | Reuses feature-mode store, SkillRunService, Expert reader, Local Chat, File Platform, and existing E2E. ADD is a Skill-Run-owned JSONL sink plus release docs. updater-log is correctly rejected as a foreign owner. |
| G3 Production ownership | PASS | Work release owner owns handbook/pilot/release notes. SkillRunService owns event emission. feature-mode store owns new-submit routing. Renderer is forbidden from telemetry files and a new IPC channel. |
| G4 Classification | PASS | C01/C02 ADD have no existing Skill Run telemetry or handbook owner. C03/C05 KEEP already-shipped default and dual readers. C04 MODIFY removes secret debug dumps. C06 MODIFY packages existing suites rather than adding a second E2E owner. The debug argument dump CONFLICT is closed by C04 REMOVE of that path, with a Replacement Matrix row. |
| G5 Contract and security | PASS | Telemetry is Main-local JSONL with an allow-list of non-secret fields. HTTP remains v1.2.1 Bundle. Telemetry failure cannot change lifecycle. Rollback cannot delete continuation/ManagedFile/transcript or start ExpertTask. Renderer gets no telemetry IPC. |
| G6 Behaviour to AC | PASS | AC-01 default and rollback gate; AC-02/AC-03 event set and secret ban; AC-04 handbook behaviour; AC-05 pilot checklist plus fixture negatives; AC-06 Expert/Local promotion; AC-07 release notes without claiming dashboard or Expert removal. |
| G7 External contract maturity | PASS | v1.2.1 and RM-01/RM-05 live already close the Provider gate. M5 does not edit Bundles. |
| G8 Cross-repo ownership | PASS | Work-only. Forbids Provider-source inspection and Expert contract edits. |
| G9 Change traceability | PASS | C01/C04 implement architecture “指标可观测” and “日志不记录 prompt”. C02/C06 implement Roadmap M5 handbook, pilot, promotion, release notes. C03/C05 preserve compatibility mode and dual readers. Hosted dashboard is explicitly KEEP absent, matching “dashboard 可与 runbook 并行” rather than a second product owner. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | 内部 pilot 被收成 Work release owner 在受控 backend 上的清单，而不是多客户灰度队列。这与用户已把默认切到 `skill-first` 的产品决定一致。Plan 不得编造未发生的外部 pilot 用户。 |
| N2 | NOTE | Roadmap 把 telemetry dashboard 写成可并行交付。本 PRD 用 Main JSONL 满足“可观测”，Hosted UI 保持 absent。Plan 不得借 M5 新增 Renderer metrics View。 |
| N3 | NOTE | C02 与 C06 都写文档/证据包装。Plan 应让 release docs 一个 Todo、promotion 命令一个 Todo，避免两个 writer 改同一手册。 |
| N4 | NOTE | AC-02 点名 `userData/logs`。对 PRD 足够的是 Main 本地 JSONL 且 Renderer 不可见；确切文件名属 Plan。 |
| N5 | NOTE | C04 是 REMOVE 调试 arguments 路径，挂在 SkillRunService MODIFY 下。Plan 只需关掉秘密字段，不必删除整个 debug 开关。 |

PASS -> `smc-prd-converge`. This review does not modify the PRD and does not create a git commit.
