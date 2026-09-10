---
work_item_id: RM-18
review_type: prd-initial
prd: docs/work/PRD-WORK-v4.0.1-typecheck-baseline-restoration.md
prd_version: v0.1.0 (DRAFT)
grounded_commit: a620288c505e8e571a7160b03770ae0a534117fd
review_head: 1069f005
reviewer: independent-stage-reviewer
date: 2026-09-10
---

# PRD Initial Review — RM-18 Typecheck Baseline Restoration

## Verdict: RETURN_PRD

无 BLOCKER/HIGH。3 个 MEDIUM 可测试性/防弱化缺口需修订。

## Findings

| ID | Severity | Note |
|---|---|---|
| F1 | MEDIUM | AC-06 允许移出 web project 时，`src/renderer/**` 不被 node 工程覆盖 → SkillRunStatusBar.test 不得仅靠 exclude |
| F2 | MEDIUM | 缺少 touched-test focused vitest PASS AC |
| F3 | MEDIUM | capture 文件需耐久化入库或内嵌清单 |
| F4 | LOW | capture 时点 ≥ grounded_commit；Plan 阶段 FRESH 重验 |
| F5 | LOW | C01 仅 unused-symbol 删除，不重开 Managed Hermes 删除面 |
| F6 | LOW | AC-06 补 tsconfig 机械判据 |
| F7 | LOW | Plan 须枚举 19 文件修复方式 |

## Required PRD edits

1. AC-06 覆盖保持 + renderer 原地修复
2. 新增 focused vitest AC
3. Evidence Baseline 耐久化
4. AC-06 tsconfig 机械判据
5. F4/F5 一句话声明

## Review Closure

修订落盘 v0.1.1+ 后转 APPROVED；仅核对 5 处编辑，无需全量复审。
