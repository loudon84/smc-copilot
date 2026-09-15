# WORK-KNOWLEDGE-01 独立 View 集成 — PRD Closure Review

**Mode:** closure  
**Verdict:** PASS  
**Reviewed artifact:** `reports/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration-DRAFT.md` v1.3.0  
**Work item:** `WORK-KNOWLEDGE-01`  
**Source revision:** `WORK-KNOWLEDGE-01@v1.3.0/f1-read-gate-revision`  
**Grounded commit:** `fa02f4c00d8f425a2b24787cca592ac7ecb5875d`  
**Closes:** `docs/work/reviews/prd-work-knowledge-01-independent-view-v1.2.0-initial-review.md` F1（F2 一并核对）  
**Evidence freshness:** REUSE（HEAD 与 `grounded_commit` 一致；本轮只修订 PRD 文本，未重做 full grounding）  
**Governance profile:** FULL（`prd_profile.py` valid；Q01–Q06 CLOSED）  
**Clarification provider:** UNAVAILABLE / NATIVE_ONLY  
**Work-facts:** `.smc/runs/WORK-KNOWLEDGE-01/routing/work-facts.json` VERIFIED；FULL / ARCHITECTURAL  

本 review 只关闭上一轮 OPEN MAJOR/MINOR，并回归 G3 / G4 / G6。不修改 PRD，不重做 discovery，不授权实现，不进入 Plan。

说明：同一工作区刚完成 `grounding_mode: revision`。本文件是闸门审查，不是对 revision 结论的复述。

## 上一轮 Finding 关闭判定

### F1 — MAJOR — 知识实体读取面没有生产 Owner，且与 AC-11 不对齐

**CLOSED。**

v1.2.0 的缺口是：AC-11 禁止 mock 数据，C10/C11 只约束上传 fake progress/completed，C06/AC-09 又要求六页面可达。无真实 provider 时，dashboard/list/detail/chat 既不能走 `MockKnowledgeRepository`，也没有 fail-closed 读取 Owner。

v1.3.0 已对齐：

- Production Owner 表新增「Knowledge dashboard/list/detail/chat 权威数据访问」：Owner 是 **与 C11 同一 Main capability probe** + Knowledge Renderer 的 unavailable/empty UI；明确不是 `MockKnowledgeRepository`，也不新增本 Stage 远端 Knowledge API Owner。
- C13 **ADD** 覆盖 dashboard/list/detail/chat 的 fail-closed 读取；C10 仍只 REMOVE mock upload / `MockUploadFile`。
- Replacement Matrix 把 `MockKnowledgeRepository` / fixture 列表 / 可发送 mock 问答从 Work 生产路径 REMOVE。
- Boundary「Knowledge entity reads」、Observable Behaviour「Entity reads without provider」把行为写死为：页面可达且 unavailable/empty。
- **AC-09** 现为「可达 **且** 无 fixture/mock 问答」；点名 Knowledge 问答不接入 Work Chat Run / Skill Run，也不把会话 ID 写入 Chat `FileImportContext.sessionId`。
- **AC-11** 绑定 C10/C11/C13，并禁止 `MockKnowledgeRepository` 作为 production contract。
- CL06 / CL08 的可观察证据覆盖 fail-closed 读取；CL08 仍为 `FAILED_RESIDUAL_GAP`，mock 默认没有被降级成 observation。

无真实 provider 时，六页面现在有唯一合法实现：可达 + unavailable/empty。F1 建议修订已落地。

### F2 — MINOR — 库存重复与权限状态过宽

**CLOSED。**

Current Capability Inventory 只保留一行 Work 统一身份（`window.desktopAuth` / `DesktopAuthUser.id` / 可选 `tenantId` / Layout `activeProfile`）。Frontend C05/C06 去掉 `permission-denied`，改为 `unavailable` / `empty`；C13 不引入服务端权限 Owner。本 Stage 不交付服务端授权。

### F3 — NOTE — Architecture Decision 仍是 Plan 前置

**仍 OPEN（NOTE，不阻塞本 Review PASS）。** 新 Job Owner、association、IPC、恢复生命周期仍需 APPROVED Architecture Decision 与 READY Roadmap Item。PRD Review PASS 之后仍不能直接出 Plan。

### F4 — NOTE — Knowledge Chat 与 Work Chat 只是同名

**CLOSED。** AC-09、C12 与 entity-reads 边界已点名：Knowledge 问答不加入 Work Chat Run / Skill Run，不占用 Chat `sessionId`。

## Closure 回归：G3 / G4 / G6

### G3 Production Ownership

PASS。读取面不再悬空：Main capability probe（与 C11 同一探测）拥有 fail-closed 判定；Renderer 只拥有 unavailable/empty 展示。真实远端读取仍 DEFERRED。没有把 mock repository 或 Chatbox KB 提升为第二 Owner。

### G4 Change Classification

PASS。C13 ADD 补上读取门控；C10 REMOVE 仍限于 upload mock；Replacement Matrix 对 `MockKnowledgeRepository` 有对应 REMOVE。C12 KEEP 继续保护 Work Chat / Skill Run。没有把 DEFERRED 远端 API 写成本 Stage ADD。

### G6 Behaviour → Acceptance Criteria

PASS。AC-09 与 AC-11 不再可被相反实现：无 provider 时不能靠迁入 fixture 列表来满足「页面可达」，也不能只把整页藏起来而让 Chat 问答走 mock。Knowledge Chat 与 Work Chat Run 的隔离可观察。

## 本轮未新开 Finding

无 OPEN BLOCKER。无新 MAJOR。已知扫描误报 `RISK_FACT_CONTRADICTION:live_acceptance` 仍在：Ops 列名 `Live Verification` vs 产品事实 `live_acceptance=false` / `local_ui_acceptance=true`，不改产品事实。

校验：`validate_prd.py --require-evidence` PASS；frontend / backend / ops preplan valid。

## Conclusion

**PASS。** F1 已关闭；F2 / F4 一并关闭。Stage 现在对无真实 provider 的 **读取面** 有唯一 Owner 和可观察 AC。本文档审查的是 `REVIEW_REQUIRED` PRD，审查本身不把 PRD 置为 APPROVED。

下一步：`/smc-prd-converge`。Converge 之后仍须 APPROVED Architecture Decision 与 READY Roadmap Item，才能生成或执行实施 Plan。

在 converge 之前：

- 不得生成或执行实施 Plan
- 本 PRD 保持 `REVIEW_REQUIRED`
- **禁止 git commit**
