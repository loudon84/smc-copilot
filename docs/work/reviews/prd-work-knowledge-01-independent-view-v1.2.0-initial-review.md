# WORK-KNOWLEDGE-01 独立 View 集成 — PRD Initial Review

**Mode:** initial  
**Verdict:** REVISE  
**Reviewed artifact:** `reports/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration-DRAFT.md` v1.2.0  
**Work item:** `WORK-KNOWLEDGE-01`  
**Source revision:** `WORK-KNOWLEDGE-01@v1.2.0/independent-view-verify`  
**Grounded commit:** `fa02f4c00d8f425a2b24787cca592ac7ecb5875d`  
**Evidence freshness:** REUSE（HEAD 与 `grounded_commit` 一致，未重做 full grounding）  
**Governance profile:** FULL（`prd_profile.py` valid；Q01–Q05 CLOSED）  
**Clarification provider:** UNAVAILABLE / NATIVE_ONLY  

本 review 复用 PRD 的 Source Anchors、Evidence Baseline 与 Routing Facts，按 G1–G7 独立判断 Scope / Owner / Classification / Boundary / Behaviour / Acceptance。不修改 PRD，不授权实现，不进入 Plan。

说明：同一工作区此前执行过 grounding。本文件是闸门审查，不是对 grounding 结论的复述；发现项按严重级独立给出。

## G1 Scope

PASS。Stage 边界清楚：Work 内独立 Knowledge View、模块状态路由、Main-owned Upload Job、File association 扩展、身份分区与 fail-closed provider gate。Out of Scope 明确排除全局 URL Router、多页签、真实 RAG/存储、跨根 import、通用 Module Registry，以及把测试 adapter 当成生产 provider。真实上传成功被正确推迟为后续 Roadmap 的 blocking 验收，而不是本 Stage 的非阻塞逃逸。

Objective 8 要求不以 mock repository / `MockUploadFile` / 模拟进度宣称真实成功，与后续 AC-11 方向一致；但该意图没有在 Change Classification 中完整落到数据读取面，见 F1。

## G2 Existing Capability / Duplicate Owner

PASS。Inventory 正确区分：

- Work Layout `visitedViews` / `paneStyle` 已是顶层 View 保活 Owner，不应再造一套导航。
- `FileJobQueue` / `file-job:*` 只是本地 parse，不能冒充 Knowledge ingestion。
- `FileImportContext.sessionId` 仍是 Chat 导入语义；不能伪造 Session。
- `apps/work/references/chatbox` 知识库不是生产 Owner。
- `apps/knowledge` 仅是迁移源，GES `forbidden_roots` 禁止运行时跨根。

没有把 Chatbox KB、FileJobQueue 或 Knowledge 独立 Auth 提升为第二套生产 Owner。

## G3 Production Ownership

REVISE。顶层 View、Work Auth / `desktopAuth`、File Platform 字节与预览、Chat/Skill Run 的 KEEP 关系正确。Proposed Main Knowledge Upload Job Coordinator 作为 **新的唯一 Job Owner** 写得很清楚，并且显式要求 Architecture 先批准。

缺口在 **知识实体读取面**：首页 / 知识库 / 知识集 / 文档 / 知识问答在无真实 provider 时，没有唯一生产 Owner。

- `RemoteKnowledgeRepository` 被标为 MISSING / DEFERRED。
- `MockKnowledgeRepository` 按 AC-11 不能作为生产数据。
- Production Owner 表只覆盖 Job / IPC / 页面 UI，没有覆盖 dashboard/list/detail/chat 的权威数据访问。

C06 要求迁移业务页面，AC-09 要求这些页面可达，AC-11 又禁止生产 UI 出现 mock 数据。三者同时成立时，页面没有合法数据源。这不是 Plan 细节，而是本 Stage 的生产 Owner 缺失。

## G4 Change Classification

REVISE。C01–C12 的 KEEP/MODIFY/ADD/REPLACE/REMOVE 对导航、路由替换、Auth 移除、Job、IPC、File association、Chat 保活是闭合的；REPLACE/REMOVE 也有 Replacement Matrix。

与 G3 同一缺口：C10 只 REMOVE mock **upload** / `MockUploadFile` / fake completion；C11 只 ADD upload 路径上的 provider gate。没有对应的 ADD/REPLACE/REMOVE 来处理 mock **repository** 作为 list/detail/chat 生产接口。AC-11 的 “不出现 mock 数据” 宽于 C10/C11 的变更范围。

C05 把 Production Owner 写成 Work Auth，实际动作是从迁移模块 REMOVE 独立登录；Replacement Matrix 已解释，不单独升级为 MAJOR。

## G5 API / IPC / Auth / Contract / Security Boundary

PASS（附 NOTE）。行为边界足够作为 Stage 需求：

- 先由 Main 创建 draft Job，再 association；禁止伪造 Chat `sessionId`。
- Renderer 不见 token / 绝对路径 / provider 原始错误。
- 分区键 `{workProfileId, authSubject, tenantScope}` 由 Main 派生，禁止自报覆盖。
- Job 终态不可回退；无 provider 时不得进入 fake `uploading`/`completed`。
- Chat `FileImportContext.sessionId` 语义 KEEP。

Q05 把精确公共 DTO 留给 Architecture，符合 “PRD 不绑 private symbol” 的分层。Open Governance Finding 已声明：无 APPROVED Architecture Decision 则不能进 Plan。这是实现闸门，不是把 blocking FAIL 推迟到下一 RM。

N1：Ops 表头 `Live Verification` 触发 `RISK_FACT_CONTRADICTION:live_acceptance`。结构化事实是 `live_acceptance=false` 且 `local_ui_acceptance=true`，与 “无外部 LIVE / 无真实 provider 端到端” 一致，视为扫描误报，不改产品事实。

## G6 Behaviour → Acceptance Criteria

REVISE。可观察行为到 AC 的主路径是齐的：

| 行为 | AC |
|---|---|
| View 保活、Chat 不丢 | AC-01 |
| 无窗口 URL / 无新顶层 Router | AC-02 |
| typed route + 可独立实例化 scope | AC-03 |
| draft Job → association，禁止假 sessionId | AC-04 |
| 隐藏 30s 停止 UI-only effect | AC-05 |
| 重启恢复或 interrupted/unavailable | AC-06 |
| cancel/retry 幂等、终态不回退 | AC-07 |
| 身份分区与命令拒绝 | AC-08 |
| 六页面可达、禁止独立 Shell/Auth/Router | AC-09 |
| 引用感知清理 + Chat 回归 | AC-10 |
| 无 fake success | AC-11 |
| 禁止跨根 import，不扰动 Chat/Skill Run/连接 | AC-12 |

F1 使 AC-09 与 AC-11 在数据内容上可被相反实现：既可以迁入 mock 列表以满足 “页面可达”，也可以整页 unavailable 以满足 “无 mock 数据”。Stage 需求必须写死：无真实 provider 时，这些页面可达且为明确 unavailable/empty，而不是 fixture 内容或可发送的 mock 问答。

## G7 Acceptance / Blocking / Evidence Integrity

PASS。CL01–CL08 覆盖 AC-01–AC-12，全部 Blocking。mock 默认被保留为 `FAILED_RESIDUAL_GAP`，没有降级成 observation。真实 provider 端到端成功被明确排除出本 Stage Claim，并要求后续 Roadmap 单独 blocking 关闭，没有 “本 RM 带 FAIL 先 DONE”。Evidence Baseline 冻结的是可观察 scenario，没有绑定测试文件名、private symbol 或 Todo。

Claim Ledger 中的 “View interaction test” 只是证据类型提示；Baseline 正文已声明不绑定测试实现。不升 MAJOR。

## Findings

### F1 — MAJOR — 知识实体读取面没有生产 Owner，且与 AC-11 不对齐

AC-11 禁止生产 UI 出现 mock 数据；C10/C11 只约束上传 Job 的 fake progress/completed；C06/AC-09 又要求迁移并到达首页/库/集/文档/问答。无真实 provider 时，dashboard/list/detail/chat 既不能走 `MockKnowledgeRepository`，也没有被指定的 fail-closed 读取 Owner。

**建议修订：** 增加 Change（ADD 或 REPLACE）明确无 provider 时全部知识读取 fail-closed 到 unavailable/empty；Production Owner 写清谁拥有该 gate（可与 C11 同一 Main capability 探测，或独立只读 adapter）；把 AC-09 写成 “页面可达 **且** 无 fixture/mock 问答内容”。在此之前不要 APPROVE。

### F2 — MINOR — 库存重复与权限状态过宽

Current Capability Inventory 将 Work 身份写了两行。Frontend Design Intent 出现 `permission-denied`，而源应用权限记录是展示用、不执行授权。建议收敛文案，避免被理解为本 Stage 交付服务端权限。

### F3 — NOTE — Architecture Decision 仍是 Plan 前置，不是本 Review 的放行条件

Open Governance Finding 正确：新 Job Owner、association、IPC、恢复生命周期需要 APPROVED Architecture 与 READY Roadmap 后才能实施。PRD Review PASS 之后仍不能直接出 Plan。本轮因 F1 为 REVISE，该前置继续有效。

### F4 — NOTE — Knowledge Chat 与 Work Chat 只是同名

Knowledge 问答页不得接入 Hermes Chat Run / Skill Run。C12 已 KEEP；修订 AC-09 时建议点名二者生命周期隔离，避免实现时把会话 ID 写进 `FileImportContext.sessionId`。

No OPEN BLOCKER.

## Conclusion

**REVISE。** 导航保活、Job 与 Chat 文件语义隔离、禁止假 sessionId、禁止 fake upload success、禁止跨根 import，这些主边界成立，且 blocking claim 没有被降级。不能 PASS 的原因是知识 **读取面** 的生产 Owner 与 AC-11 “无 mock 数据” 没有和 C10/C11/AC-09 对齐。

下一步：`smc-prd-grounding` **revision** 关闭 F1（建议顺手收敛 F2）。关闭后重新跑本闸门的 closure/initial review。在此之前：

- 不得 `smc-prd-converge`
- 不得生成或执行实施 Plan
- 本 PRD 保持 `REVIEW_REQUIRED`，**禁止 git commit**
