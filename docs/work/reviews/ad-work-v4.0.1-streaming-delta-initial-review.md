# Architecture Review — AD-WORK-v4.0.1 Streaming token delta

**Mode:** initial  
**Verdict:** REVISE  
**Artifact:** `docs/work/AD-WORK-v4.0.1-streaming-delta-BACKLOG-DRAFT.md`  
**decision_id:** `AD-WORK-v4.0.1-STREAMING-DELTA`  
**grounded_commit:** `6a462238bee58f547855b68c57417f2f0442745c`（与当前 HEAD 一致）  
**source_revision:** `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1 + user-input:2026-09-08-streaming-delta-provider-first`

本审查不修改 Architecture Decision，不写 Roadmap，不批准 Stage PRD / Plan，不授权 parser 或 Bundle 草稿。

抽查（非 rediscovery）：Roadmap 表 RM-01–RM-12 均为 `DONE`，`architecture_decision` 仍指向父 PRD；v1.4.0 `run-event.schema.json` 的 `const` 仅为 `assistant.message` / `reasoning.summary` / `tool.call` / `clarify.requested` / `approval.requested` / `artifact.persisted`；父 PRD Agent output adaptation 段要求事件枚举后才映射 streaming delta；RM-08 Stage PRD Out 含 streaming token delta。与 Evidence Baseline 一致。

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| A1 Problem Necessity | PASS | 问题不是空想：父架构 P1 已点名 streaming delta；RM-08 因无独立事件正确排除；现行 v1.4.0 仍无 delta 类型；Roadmap 已无 READY Item。Decision 解决的是「如何推进」而不是「现在实现打字机」。 |
| A2 Existing Capability / Reuse | PASS | 进口复用 consumer-lock；映射复用 parser / SkillRunService / `modules/skill-run`。明确不新增 Owner。`assistant.message` 正确标为完整 snapshot，不可当 delta 合同。 |
| A3 Alternatives | PASS | 记录了伪装 `assistant.message`、本仓自拟 schema、无合同写 PRD、重开 RM-08、无 READY 直接实施。拒绝理由与父架构 fail-closed / external-immutable-bundle-only 一致。 |
| A4 Ownership / Boundary | PASS | Provider 写事件合同；Work 只 lock 完整 Bundle；parser 只映射已枚举类型；Renderer 不收 raw event。控制面（合同/lock）与执行面（projection）可分开强制。 |
| A5 Dependencies / Cascading Effects | PASS | DAG 为外部发布 → Import BACKLOG/READY/DONE → Mapping。READY 门禁写了 tag/checksum/schema/fixture。未预判 Bundle 版本号；`wireBreaking` 留给进口 Item。 |
| A6 Security / Operability | PASS | 禁止 raw event 进 Renderer、禁止新 IPC。本 Decision 不设计 delta 合并算法，符合「无合同不猜」。未知事件继续 `rawUnknown`。 |
| A7 Pre-mortem / Kill Criteria | PASS | 无合同强行流式 → 停并重开架构；identity-only lock 不得 READY；Grounding 发现无独立 event type → 退回 BACKLOG；新 Owner / 混入 expiry/upload → 审查 FAIL。 |
| A8 Roadmap Decomposability | PASS（阶段拆分） / 见 M1（出处） | 进口与映射两阶段、无 exact file/Todo。建议 RM-13/RM-14 仅为建议编号。 |

## Blocking Findings

无。

## Major Findings

### M1 — 父架构仍是 Roadmap SOT，本增量未规定 APPROVED 后的引用关系

Roadmap `architecture_decision` 仍是 `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`。本文件自称增量、不取代父 PRD，但未冻结 APPROVED 之后：

1. Roadmap 新 Item 的 `source_revision` / 架构出处必须引用本 `decision_id`；
2. 父 PRD 是否保持唯一 `architecture_decision` 指针，本 AD 只作为 named increment；
3. 父 PRD P1「streaming delta」一句如何被本 Decision 解释，而不是被读成「可以立刻开单一映射 PRD」。

若不写死，RM-13/RM-14 写入后会出现双 SOT：Roadmap 指向父 PRD，父 PRD 仍把 streaming delta 混在一条 P1 里。这是 Decision 自身可修正的架构出处错误，不是外部缺失。

**Required fix:** 在 Decision 或 Roadmap Boundaries 增加强制性 provenance：本 AD APPROVED 后，Roadmap 继续以父 PRD 为 `architecture_decision`；新增 Import/Mapping Item 的 source 必须引用 `AD-WORK-v4.0.1-STREAMING-DELTA`；父 P1 streaming delta 的实施顺序以本 AD 为准（先进口 BACKLOG，后映射；无 Bundle 不得 READY）。禁止把本 AD 解读为替换整份 v4.0.1 架构。

## Minor Findings

### m1 — Import `Depends On: RM-11` 是基线冻结，不是功能依赖

RM-11 是附件上传。streaming delta 功能上不依赖附件。用 RM-11 表示「现行消费合同停在 v1.4.0」可以，但应在 Roadmap Boundaries 标明这是合同基线，避免后续把附件回归塞进 Import Item。

### m2 — Target Architecture 过早写死「增量文本」

Mapping 出口写成 sanitized 增量文本。Provider 尚未枚举 payload。Decision 已说不预判版本号；映射阶段应写成「只投影已枚举、已清洗的 payload 字段」，文本 token 只是当前假设，不是合同事实。

## Roadmap Notes

- 两项初始 BACKLOG、Import 在 Provider tag 前不得 READY、Mapping 依赖 Import DONE：正确，且禁止与 `approvalExpiry` / download-by-ref / clarify respond 合并。
- Import READY 依赖仓外 Provider 发布，不是本仓另一个 Item。Roadmap 更新时应把该外部门禁写进 Item 备注或 Exit Criteria（Decision 已有，写入表即可）。
- 本审查不授权现在改 Roadmap 文件。

## Closure Table

| ID | Severity | Status | Resolution |
|---|---|---|---|
| M1 | MAJOR | OPEN | Decision 必须冻结与父 PRD / Roadmap `architecture_decision` 的引用关系 |
| m1 | MINOR | OPEN | Import Depends On RM-11 标为合同基线 |
| m2 | MINOR | OPEN | 映射出口不要把「增量文本」写成已发布合同 |

## Conclusion

A1–A8 的方向正确：不发明 delta 事件、不写现阶段 PRD、拆进口与映射、复用现有 Owner。因 M1（架构出处 / 双 SOT）为 MAJOR，Verdict 为 **REVISE**。

下一 Owner：`smc-architecture-decision` mode=`revision`，只关闭 M1（及顺手 m1/m2）。不得在本轮写入 Roadmap 或 Stage PRD。
