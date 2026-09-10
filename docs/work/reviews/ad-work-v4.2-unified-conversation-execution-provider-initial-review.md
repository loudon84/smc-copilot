# Work v4.2 Unified Conversation / Execution Provider — Architecture Review

**Mode:** initial
**Verdict:** REVISE

本审查复用 Architecture Decision 的 `source_revision=PRD-WORK-v4.2@v4.2+user-constraint-2026-09-10-v2` 与 `grounded_commit=2d215626030a366dad26bdddcb12f1a57a09a051`。源码与 source revision 未变化，Evidence Freshness 为 `REUSE`；不重新 full Grounding，不修改 Architecture Decision。

## Blocking Findings

No OPEN BLOCKER.

## Major Findings

### A4-M1 — Session classification durable identity scope 未冻结

Decision 正确指定 Work Main 为唯一 classification/index writer，也正确把 Direct/Remote Dashboard/SSH 视为 Chat transport 而非新 Provider；但尚未冻结 metadata 的稳定 identity scope。`session_id` 只在某个 profile/connection domain 内可靠，若本地 Desktop overlay 或 cache 跨连接复用，仅以 `session_id` 作为全局 key 会发生碰撞或读取错误分类。

**Required closure：**在 Architecture 层冻结逻辑 identity 至少为 `session_scope + profile_id + session_id`，其中 `session_scope` 由 Main 的受信连接配置生成，Renderer 不可提供。说明同一逻辑 Session transport reconnect 后如何保持 scope，切换到不同 endpoint/tenant 时如何隔离；具体表名与 migration SQL 留给 Stage PRD/Plan。

### A6-M2 — metadata/cache/event 的修复与 rollback operability 未冻结

Decision 给出了写入顺序与 partial-write 风险，但没有规定任一步失败后的可观测行为和自愈 owner。Feature flag rollback 也只作为风险出现；若旧 presentation 与新 metadata 混用，可能产生 ghost row、未分类 row 或重复发布。

**Required closure：**冻结 Main-only fail-closed read、startup/sync targeted repair、delete cleanup、sanitized diagnostic、idempotent republish，以及 rollback 只切 presentation/Sidebar consumer、不得删除或降级 durable metadata/audit 的语义。Pre-accept Skill Run 仍不得被 repair 成正式 Work history。

## Minor Findings

### A3-m1 — Rejected alternative 的 revisit 条件可以更集中

Decision 已用 kill criterion 约束第三 Provider 需要新 APPROVED Architecture。建议在 Rejected Alternatives 中明确：只有新的已批准产品路径、Provider contract 或事实源边界发生变化时，才重新评估 generic registry / third provider；不是在 RM 实施时顺手扩展。

## Roadmap Notes

- RM-01 必须同时冻结 classification identity、repair state machine 与 rollback compatibility，不能只创建字段。
- RM-02 只能消费已分类 DTO；missing/corrupt metadata 不得由 Renderer fallback 到 `source`/ID 推断。
- RM-03 的 turn identity 与 RM-01 的 session identity 是不同层级，Stage PRD 不应合并为一个 key。

## Closure Table

| Finding | Status | Closure evidence |
|---|---|---|
| A4-M1 | OPEN | Architecture revision required |
| A6-M2 | OPEN | Architecture revision required |
| A3-m1 | OPEN | Architecture revision recommended |

## Conclusion

REVISE。两项 MAJOR 都可在不改变已选 Option A、两类产品边界或 Roadmap 四阶段结构的情况下由 Architecture Decision 修正。修订后仅需 closure review，不得重新 full Grounding。
