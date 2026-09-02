# PRD Review

**Artifact:** `docs/nodeskclaw/PRD-NODESKCLAW-v1.0-skill-run-contract-bundle-DRAFT.md`  
**Mode:** initial  
**Verdict:** BLOCKED

## Evidence Reuse

- `status`: `DRAFT`（未进入 `REVIEW_REQUIRED`；本文按用户显式 `/smc-prd-review` 做独立 Gate 判断，不把 DRAFT 当成已完成 Grounding）
- `source_revision`: `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/M0 + user-input:2026-09-01-provider-bundle-prd`（Work 消费端来源，不是 NoDeskClaw `AD-SKILL-AGENT-V16` / Roadmap Item）
- `grounded_commit`: `c8af60fca608bdf0811d896290cf57b03597188e`（`smc-copilot` HEAD；`fix(work): require complete Skill Run Bundle before lock opens`）
- 该 SHA 在 NoDeskClaw 仓库不存在（`git cat-file` 失败）
- `python tools/agent-skills/validate_prd.py ... --require-evidence`：结构校验通过。通过原因是校验器以 PRD 所在 `smc-copilot` 为 git root，**不能**当作 NoDeskClaw 源码 Grounding 已完成
- `python tools/agent-skills/evidence_freshness.py ...`：对 `smc-copilot` 返回 `REUSE`（消费端 HEAD 等于 `grounded_commit`）。本轮不对 Work 源码做 full Grounding；对 NoDeskClaw 既有合同/Owner 只做独立抽查
- 本审查不修改 PRD，不 git commit

## Blocking Findings

1. **G1 / 治理入口缺失。** `work_item_id` 为 `NODESKCLAW-SKILL-RUN-CONTRACT-BUNDLE-M0`，不是 NoDeskClaw 现行 Roadmap `ROADMAP-SKILL-AGENT-V16` 的 READY Item。Architecture `AD-SKILL-AGENT-V16@1.1.0` 已把「外部 Work Skill-first Consumer Contract」冻结为 **RM-09**，状态 `BACKLOG`，依赖 RM-08（再依赖 RM-06/RM-07）。现行 READY/IN_PRD 项是 RM-04、RM-05。一份平行 M0 Stage PRD 违反「One Roadmap Item -> one Stage PRD」和 DAG。PRD 自身 Transfer rule 也要求先复制到目标仓、用 NoDeskClaw commit 重写 `grounded_commit` 并完成 Inventory；当前状态仍是 `DRAFT` + `VERIFY` 行，不能批准。

2. **G2 / 把已发布合同包写成 ADD。** Current Inventory 把「Contract release export」写成「No complete consumer Bundle is available to Work / ADD」。独立抽查 NoDeskClaw：
   - 轻量标签 `skill-run-contract-v1.0.0` 存在；peeled commit 为 `3e345519bcfa606553893234b59fb607ee57ac8a`（`chore(skill-run): 冻结 v1.0.0 合同发布物`），与 Work `consumer-lock.json` 的 `tagTargetCommit` 一致
   - 该 tag 下 `nodeskclaw-backend/contracts/skill-run/v1.0.0/` 已包含本 PRD C02 清单中除 `consumer-lock.json` 以外的全部机器可验证产物（`manifest.json`、`SHA256SUMS`、schemas、endpoint-matrix、所列 fixtures）
   - Work 侧 `contracts/skill-run/v1.0.0/` 目前只有 `consumer-lock.json` + `SHA256SUMS`，且 `SHA256SUMS` 摘要与 Provider 发布物相同
   - 因此消费端 Gate BLOCKED 是 **Work 未导入已发布文件**，不是 Provider 缺少合同 Owner 或需要新建 Bundle 能力
   - 后续 v1.1.0 / v1.2.0 合同包也已存在，Owner 仍是 Backend Contract Package。C01–C08 全部 `ADD` 会制造第二套合同发布 Owner。

3. **G3 / 把仓外 Work 验收写进本仓完成条件。** Architecture 明确：本仓库只交付版本化合同、Backend 公共行为与 conformance 证据；外部 Work 源码、构建、发布和适配 **不是** 本仓 DONE 证据。Kill criterion：Roadmap/PRD/Plan 出现外部前端文件、构建或发布 Todo 时退回。本 PRD 的 AC-1/11 与 DoD-3 要求 Work 导入、consumer-lock、gateway/IPC/fixture 端到端通过后本 PRD 才完成。这把 Work Consumer 变成隐式联合 Owner，且与 RM-09 边界冲突。`consumer-lock.json` 已由 Work 生成并 lock 到现有 tag；它是消费端 pin，不应作为 Provider Bundle 的必选发布产物，否则会与 Work lock Owner 重叠。

## Major Findings

1. **G4 / Change ID 不稳定，且分类与源码事实相反。** Change Classification 表：C07=Unsupported P0、C08=release verification。正文：C07=Artifact contract、C08=unsupported、C09=fixtures/verification。Plan 继承 C ID，这组编号不能冻结。同时既有能力至少是 EXISTS/PARTIAL（合同包、Catalog/MCP、Run Proxy、Agent Run SoT），目标应是 KEEP 已发布 v1.0.0 内容、对矩阵语义缺口 MODIFY（新合同版本，禁止原地改写 v1.0.0），而不是 ADD 平行包。Inventory 的 `VERIFY / ADD or MODIFY` 不是合法 Grounding 结果（必须是 EXISTS / PARTIAL / MISSING / CONFLICT）。

2. **G5 / 若确有合同缺口，也属于现有包的 PARTIAL，不是新边界。** 抽查现有 `http/endpoint-matrix.json`：已有全局 Bearer、`X-Idempotency-Key` scope/TTL/409/replay、`Last-Event-ID`、Catalog/call/run/result/cancel/artifact/SSE 路径。未声明 per-endpoint error mapping、request/response schema 引用、same-origin、reconnect limit、polling fallback。这些若被 Work v4.0.1 视为硬要求，应在 **现有 Backend Skill Run Contract Package** 上以新版本表达，并保持员工只走 `/api/v1/mcp` 与 `/api/v1/runs/*`、禁止路由字段进入 `tools/call`。不得另起第二生成链或让 Work 直连 Agent。v1.0.0 `tools-list.response.schema.json` 已要求 `capabilityKind` 常量为 `"skill"`；`capabilities/unsupported.schema.json` 已把 approval/attachments 标为 unsupported。C03/C04/C07 正文把这些写成从零 ADD，会覆盖已冻结发布物。

3. **G6 / AC 无法从错误分类的 Change 收敛。** AC-1/2/12 描述的 tag + checksum 行为，现有 `skill-run-contract-v1.0.0` 与 LF `SHA256SUMS` 已覆盖；缺口是 Work 导入。AC-5 的「跨端只创建一个 Run」需要受控 live 验证，PRD 已禁止把 live 当 schema discovery，但未把 Provider conformance 与 Work 仓外验收拆开。AC-3/4/7/8/10 对应的可观察行为大部分已在 v1.0.0 schema/fixture 中；在 Inventory 仍为 VERIFY、Change 全是 ADD 的情况下，AC 不能作为唯一 Owner 的验收冻结。

## Minor Findings

1. Source Anchors 全部指向 `smc-copilot` 的 Work 文件与 stub lock，没有 NoDeskClaw `contracts/skill-run/v1.0.0`、`scripts/contracts.py`、Run/MCP API 或 `AD-SKILL-AGENT-V16` / RM-09 锚点。
2. `manifest.json` 的 `backendCommit` 是 `6afab6fb`（实现提交），tag peel 是后续冻结提交 `3e345519`。这符合既有 I/R 两提交协议，但 Transfer PRD 未区分，容易在 revision 时把 lock 的 peeled SHA 和 manifest `backendCommit` 当成冲突。
3. P1「rich activity」在 RM-02 / v1.2.0 已有语义事件合同。本 PRD 把 P0 写成「必须保持 unsupported」合理，但不得要求回写或删除已发布的 v1.2.0。
4. 文件名带 `-DRAFT.md` 且 `status: DRAFT`，与「独立 Review 后才能 APPROVED」的自述一致；converge 闸门在本轮不适用。

## Plan Notes

本轮 **禁止** `smc-prd-converge`。下一步也 **不是** 把这份消费端草稿当作 RM-09 或新 M0 Item 直接 `smc-prd-grounding revision`。

建议分流：

1. **若 Work M0 只需现有 P0 包：** Work 从 `skill-run-contract-v1.0.0`（peeled `3e345519`）导入完整目录，使 `isCompleteSkillRunBundleDir` 通过。这是仓外 Consumer 动作，不构成 NoDeskClaw Stage PRD。
2. **若 Work 需要比 v1.0.0 矩阵更完整的错误映射 / SSE 重连 / polling 语义：** 先走 Architecture/Roadmap：要么等 RM-09 READY，要么批准 Architecture revision 把「导出/补齐消费合同」提前为独立 READY Item。然后对 **NoDeskClaw 真实 commit** 做 `smc-prd-grounding discover`，Inventory 必须落到 EXISTS/PARTIAL/MISSING，Change 以 KEEP v1.0.0 + 新版本 MODIFY/ADD 为准，DoD 不得包含 Work 前端构建或 IPC 测试。
3. 禁止在未 READY 的情况下用本文件授权 NoDeskClaw 新增平行合同目录、平行生成链或改写已 tag 的 v1.0.0 字节。

## Closure Table

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope（范围） | BLOCKER | 无 READY Roadmap Item；`source_revision` 是 Work M0 而非 `AD-SKILL-AGENT-V16`；能力已由 RM-09 占用且仍 BACKLOG；status 仍为 DRAFT/VERIFY |
| G2 Existing Capability / duplicate owner（现有能力/重复归属） | BLOCKER | `skill-run-contract-v1.0.0` 已 tag；v1.0.0 目录含本 PRD 所需 schemas/matrix/fixtures；Work 仅缺文件导入。全表 ADD 会重复 Contract Package Owner |
| G3 Production Ownership（生产归属） | BLOCKER | Backend/Agent Owner 陈述正确，但 AC/DoD 把 Work import/tests 和 `consumer-lock.json` 变成联合完成条件，违反 RM-09 仓外 Consumer 边界 |
| G4 KEEP/MODIFY/ADD/REPLACE/REMOVE（变更分类） | MAJOR | C07/C08/C09 表体不一致；EXISTS/PARTIAL 被写成 ADD；`VERIFY` 不是合法 Grounding 结果 |
| G5 API/IPC/Auth/Contract/Security Boundary（接口/鉴权/合同/安全边界） | MAJOR | 员工公共面与禁路由字段方向正确；矩阵语义缺口若存在也属现有包 PARTIAL，不能作为新 Bundle/新 Owner 的理由 |
| G6 Behaviour -> Acceptance Criteria（行为到验收） | MAJOR | AC 混入仓外 Work 验收；与错误 ADD 分类绑定后无法作为本仓可冻结验收 |

## Independent Spot Checks

本轮不对消费端做 discovery。下列抽查用于独立判断 NoDeskClaw 既有合同事实。

| Claim | Result |
|---|---|
| Provider 尚未发布完整 Bundle | 不成立。tag `skill-run-contract-v1.0.0` peel 到 `3e345519`；该 commit 含 C02 所列 schemas、matrix、fixtures、`manifest.json`、LF `SHA256SUMS` |
| Work 当前 Gate BLOCKED | 成立，但是导入缺口：Work 目录只有 lock + `SHA256SUMS`，摘要与 Provider 发布物一致 |
| `grounded_commit` 可作为 NoDeskClaw 基线 | 不成立。`c8af60fc` 只在 `smc-copilot`；NoDeskClaw HEAD 为 `21bdc38afc44a780659f3d589daf37bdf6c47328` |
| Catalog 需要从零定义 `capabilityKind: skill` | 不成立。v1.0.0 `tools-list.response.schema.json` 已 `const: "skill"` 且为 required |
| P0 缺少 unsupported 声明 | 不成立。`capabilities/unsupported.schema.json` 与 fixture `unsupported-capabilities.json` 已存在 |
| 幂等与 SSE replay 完全未发布 | 不成立。endpoint-matrix 已有 idempotency 与 `Last-Event-ID`；fixture `idempotency-replay.json` / `sse-resume-duplicate.json` 已在 tag 内。矩阵未写 polling/reconnect/per-endpoint error mapping，属 PARTIAL |
| RM-09 已 READY，可挂本 PRD | 不成立。Roadmap RM-09 = BACKLOG，depends on RM-08 |
| `consumer-lock.json` 已在 Provider Bundle 内 | 不成立。Provider v1.0.0 无该文件；Work 已自行持有 lock 并指向现有 tag |

## Conclusion

Verdict **BLOCKED**。下一技能不是 `smc-prd-converge`。先由产品/治理决定：Work 只导入现有 `skill-run-contract-v1.0.0`，或修订 Architecture/Roadmap 后再对 NoDeskClaw 源码做 `smc-prd-grounding discover`。在 READY Item、NoDeskClaw `grounded_commit` 和 KEEP/MODIFY 分类出现之前，禁止把本 DRAFT 当作可实施 Stage PRD。
