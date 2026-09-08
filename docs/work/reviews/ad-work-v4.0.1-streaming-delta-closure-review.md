# Architecture Review — AD-WORK-v4.0.1 Streaming token delta

**Mode:** closure  
**Verdict:** PASS  
**Artifact:** `docs/work/AD-WORK-v4.0.1-streaming-delta-BACKLOG-DRAFT.md`  
**decision_id:** `AD-WORK-v4.0.1-STREAMING-DELTA`  
**version:** `1.0.1`  
**grounded_commit:** `6a462238bee58f547855b68c57417f2f0442745c`（与当前 HEAD 一致；`evidence_freshness` → `REUSE`）  
**source_revision:** `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1 + user-input:2026-09-08-streaming-delta-provider-first`  
**Prior review:** `docs/work/reviews/ad-work-v4.0.1-streaming-delta-initial-review.md`（Verdict: REVISE）

本审查只关闭上一轮 OPEN finding，并检查修订回归。不修改 Architecture Decision，不写 Roadmap，不批准 Stage PRD / Plan。

抽查（非 rediscovery）：Roadmap `architecture_decision` 仍为 `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`；v1.4.0 `run-event.schema.json` 的 `const` 仍仅为六类已枚举事件，无独立 delta 类型。与 Evidence Baseline 一致。

## Gate Results

Closure 不重跑 A1–A8 全量。上一轮除 A8 出处（M1）外均为 PASS。本轮确认：Option 仍为 1；Rejected Alternatives 保留；无新 Production Owner；未发明 delta 事件；未写入 Roadmap / Stage PRD。

| Gate | Closure check | Result |
|---|---|---|
| A8 provenance (M1) | Decision + Roadmap Boundaries 已冻结父 PRD 指针、Item/`source_revision` 必须引用本 `decision_id`、父 P1 实施顺序 | PASS |
| Revision regression | Owner / Boundary / Option / 拒绝项未改；映射出口不再把「增量文本」当合同 | PASS |

## Blocking Findings

无。

## Major Findings

无 OPEN。M1 已关闭，见 Closure Table。

## Minor Findings

无 OPEN。m1、m2 已关闭，见 Closure Table。

修订残留（process-only，不挡 PASS）：Decision Provenance 标题含「关闭审查 M1」。`converge` 应删掉该审查用语，保留 provenance 规则本身。

## Roadmap Notes

- 仍不得在本审查写入 Roadmap。`smc-roadmap` 仅在本 AD APPROVED 之后追加 Import / Mapping 两行 BACKLOG。
- 写入时 Roadmap frontmatter `architecture_decision` 保持父 PRD；Item 必须引用 `AD-WORK-v4.0.1-STREAMING-DELTA`；Import READY 的仓外 Provider tag 门禁写入 Exit Criteria。
- Import `Depends On: RM-11` 是 v1.4.0 合同基线，不是附件功能依赖。

## Closure Table

| ID | Severity | Status | Resolution |
|---|---|---|---|
| M1 | MAJOR | CLOSED | Provenance 冻结：Roadmap `architecture_decision` 继续指向父 PRD；本 AD 为 named increment；新 Item 与 Stage PRD `source_revision` 必须引用 `AD-WORK-v4.0.1-STREAMING-DELTA`；父 P1 streaming delta 按进口 BACKLOG → 映射顺序解释。双 SOT 写入 Kill Criteria。 |
| m1 | MINOR | CLOSED | Roadmap Boundaries 标明 RM-11 为合同基线、非附件功能依赖；Import 不得回归附件/`approvalExpiry`。 |
| m2 | MINOR | CLOSED | Target Architecture / Mapping Outcome 改为已枚举、已清洗的 payload 字段；「增量文本 / token」标为产品假设。 |

## Conclusion

上一轮 OPEN 项全部关闭，修订未引入新的 BLOCKER/MAJOR。Verdict 为 **PASS**。

下一 Owner：`smc-architecture-decision` mode=`converge`。不得在 converge 中改 Option、Owner 或 Boundary。
