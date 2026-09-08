**结论先说：** Work 这份 PRD 要的是 Provider 发布不可变 **SKILL-RUN-CONTRACT v1.3 Bundle**，不是让我们做 `apps/work` 的 RM-09/RM-11 UI。按现有 AD，这正好落在「v1.2.1 之后的 Public 合同增量」——名义上是我们的 **RM-09**，但当前被 **RM-08** 挡住；要交付 v1.3，必须先做 Architecture 修订，不能直接开 Stage PRD / 写 Bundle。

---

## 1. 两边在说什么（命名不要混）

| 名称 | Work（smc-copilot） | 我们（nodeskclaw） |
|---|---|---|
| 当前锁定合同 | `v1.2.1` | 同，RM-11 `DONE`，tag `skill-run-contract-v1.2.1` |
| RM-09 | Approval **决策卡片/IPC**（合同 Gate 关掉后才能做） | **v1.2.1 之后 Public 增量** + Shared 剩余符合性；`BACKLOG`，Depends On **RM-08** |
| RM-11 | Attachment **上传 UX** | 已 `DONE`：发布累积 Public v1.2.1 |
| 本次 PRD | Provider 发 v1.3 Bundle，解锁 Work 的 RM-09/RM-11 | 我们是 Provider Owner |

Work PRD 明确：`does_not_activate: RM-09, RM-11`（指 **Work** 侧），我们这边也不能把仓外 UI 写进 DONE 证据。

---

## 2. 现有能力 vs v1.3 缺口（有代码证据）

### Slice A — Approval decision（解锁 Work RM-09）

| 项 | 现状 | 依据 |
|---|---|---|
| 能力声明 | `approval` / `approvalDecision` = `"unsupported"` | `v1.2.1/manifest.json` |
| SSE descriptor | 只有 `approval_id` + `summary` | `fixtures/run-event-approval-requested.json`；`runs.py` 投影同样只放这两字段 |
| 写路径 HTTP | **已有** `POST /api/v1/runs/{run_id}/approvals/{approval_id}`，且只接受 approve/deny | `runs.py` `approve_run`；**未进** `endpoint-matrix.json` |
| 与推荐路径差异 | Work 推荐 `.../approvals/{id}/decision` | 可保留现路径，但必须写进 matrix，并冻结 request/response |
| 南向闭环 | RM-15 已 `DONE`（Hermes Native approval） | Roadmap RM-15 |
| 仍缺 | options/expires_at、幂等 scope、`approval.resolved` 或 GET 可观测离开 `WAITING_APPROVAL`、合同 fixtures、能力从 unsupported 提升、Public DTO 不含内部字段 | Work PRD A2–A6 |

**成熟度判断：Slice A 最接近可关。** 南向与 Public 代理雏形已在；缺口主要是 **合同冻结 + Public 语义补齐 + 生成/发布**，不是从零造审批。

### Slice B — Attachment refs/upload（解锁 Work RM-11）

| 项 | 现状 | 依据 |
|---|---|---|
| 能力声明 | `attachments: unsupported` | manifest / unsupported.schema |
| Catalog | `supportsAttachments` 默认 `false` | `mcp_tool_mapper` / schema |
| 内部已有 | Runtime 可带 `attachment_refs`；RM-06 做过授权引用 | `runtime_skill_run.py`、`mcp_tool_mapper` |
| Public upload | **没有** `POST /api/v1/attachments` 进合同矩阵 | v1.2.1 matrix 无此行 |
| 与 Artifact | Artifact download 已有（产出），不能当 upload | Work PRD B2 |

**成熟度判断：Slice B 明显更薄。** 有内部 ref 消费雏形，缺独立签发 `attachment_ref`、TTL、绑定 `tools/call` 的关闭字段、大小/类型错误码与整套 fixtures。

---

## 3. 「如何生成合同」——正确顺序（不是先写 JSON）

按 AD 的 Contract-first 与治理链：

```text
Work Provider PRD（已有，DRAFT）
  → 我们侧 Architecture Revision（必做：解开 RM-08 阻塞 / 新 Item）
  → Roadmap 新出口 Item（或修订 RM-09）
  → Stage PRD（合同语义 + Backend 可观察符合性）
  → Plan
  → 实现 Backend 公共面（使 live 能兑现合同）
  → scripts/contracts.py 生成 v1.3.x Bundle
  → annotated tag + SHA256SUMS + RELEASE.md
  → 回传 Work（tag / tree / matrix 新增行 / fixtures 清单）
```

**禁止的路径：**
- 改写 `contracts/skill-run/v1.2.1/`（AD Kill Criterion）
- 口头/CI 绿代替 Bundle（Work PRD 写死）
- 把 Hermes `/approval`、HermesTask、内部 URL 写进 Public Bundle
- 未改 AD 就 READY 现有 RM-09（Depends On RM-08 仍是硬闸）

### 生成链（复用 RM-11，不新造 Owner）

与 `prd-v1.6.6` / `scripts/contracts.py` 同族：

1. 扩展 `generate --family skill-run --version 1.3.0`（版本号最终由 tag 冻结）
2. 新目录 `contracts/skill-run/v1.3.0/`（或你们选定的 `v1.3.x`）
3. 必含：`manifest.json`、LF `SHA256SUMS`、`RELEASE.md`、`http/endpoint-matrix.json`、schemas、fixtures、`capabilities/unsupported.schema.json`（未关的 Slice 继续 `unsupported`）
4. `check --release` + annotated tag `skill-run-contract-v1.3.0`
5. **不改** `contracts/work-expert/*`；Public 不含 Internal Southbound

v1.2.1 生成函数已在 `_generate_skill_run_v121_public_contract`；v1.3 应是 **新函数 / 新版本分支**，禁止覆盖旧目录。

---

## 4. 治理缺口：为什么不能「直接当 RM-09 开干」

AD v1.5.0 冻结：

- Work canonical 曾是 v1.2.1（RM-11）；**之后增量**归 RM-09  
- RM-09 **Depends On RM-08**；RM-08 仍 `BACKLOG`（还卡 RM-07 `IN_PRD`）  
- 明确拒绝过：提前 READY RM-09、把 Public Hotfix 塞进 RM-09  

但 Work 的 v1.3 **不依赖** Internal Shared Agent Contract（Delegation Topology 等），与当年 RM-12「不改合同、只修符合性」类似——是 **纯 Public 出口**，被 RM-08 绑死不合理。

因此生成路径的第一步必须是 **Architecture Addendum / Revision**，二选一（我推荐 A）：

| 方案 | 做法 | 优点 | 风险 |
|---|---|---|---|
| **A. 新增 RM-17（推荐）** | 类似 RM-12：独立 Item「发布 SKILL-RUN-CONTRACT v1.3」；Depends On RM-11（+ 建议 RM-15 作为 Approval 南向前提）；**不依赖 RM-08**；RM-09 仍留给 Shared 后的剩余符合性 | 一项一门禁；不提前打开旧 RM-09；命名与 Work 的 RM-09/11 也不撞 | 要改 AD + Roadmap |
| B. 修订 RM-09 | 拆「纯 Public 增量」与「Shared 剩余符合性」；Public 子范围改 Depends On | 少一个 Item 号 | 改已冻结 RM-09 语义，历史 Kill 条款多，易审不过 |
| C. 等 RM-08 | 严格按现 AD | 零 AD 变更 | Work Gate 长期关着；与「Public 不依赖 Internal」事实冲突 |

---

## 5. 建议的生成路径（待你拍板后进入治理）

### Phase 0 — 范围决策（现在就要定）

1. **发布策略**（Work 允许一次或两次 tag）  
   - **推荐：两次 tag，先 Slice A（Approval）** → `v1.3.0` 关 A，B 仍 `unsupported`  
   - Slice B 成熟后再 `v1.3.1` 或 `v1.4.0`  
   - 理由：RM-15 已闭环审批；Attachment 缺 Public upload 合同与实现，绑在一起会拖死 Work RM-09  
2. **Architecture**：采用方案 A（新 RM-17）还是 B  

### Phase 1 — Architecture + Roadmap

- Addendum：冻结「v1.3 Public Bundle Owner = Contract Package；不改 v1.2.1；不依赖 RM-08」  
- Roadmap 新 Item（或修订）：Outcome = 发布可被 Work pin 的 v1.3 Bundle + Backend 对矩阵可观察符合  
- Exit：tag、checksum、matrix 含 decision（及可选 upload）、fixtures 齐全、未关 Slice 显式 unsupported  

### Phase 2 — Stage PRD（合同语义先于 UI）

至少冻结：

- **A**：descriptor 字段、`allow|deny`、decision endpoint（建议对齐现有 `.../approvals/{id}` 或显式迁到 `.../decision`）、幂等 scope=`org+user+run+approval`、deny/超时终态、是否加 `approval.resolved`  
- **B**（若同 Bundle）：`POST /api/v1/attachments`、ref 不绑 run_id、`tools/call` 绑定字段名、preview=`unsupported`（若暂不做）  
- wire-breaking 声明（additive 优先）  

### Phase 3 — Backend 符合性（合同能被 live 兑现）

- 补齐 Public 投影（options / expires_at 等）  
- decision 幂等与错误码与 fixtures 对齐  
- 去掉/禁止合同外信封泄漏（现 `approve_run` 仍见 `{"code":0,"data":...}`，与 v1.2.1 线级信封要求冲突，v1.3 PRD 必须写死）  
- Slice B 另开实现面  

### Phase 4 — Bundle 生成与回传

```text
uv run python scripts/contracts.py generate --family skill-run --version 1.3.0
uv run python scripts/contracts.py check --family skill-run --version 1.3.0 --release
# annotated tag skill-run-contract-v1.3.0
```

回传清单严格按 Work PRD「建议回传」：tag、commit、目录树、SHA256SUMS、RELEASE 中 A/B 关闭状态、matrix 新增行、fixtures 文件名。

---

## 6. 和当前 Roadmap 并行关系

- **不阻塞**：RM-04 / RM-07 / RM-10 / RM-16（各自门禁）  
- **不应并入**：RM-12（已关、且禁止发新合同版本）、RM-15（南向已关，不是 Public Bundle 出口）、RM-09（未改 AD 前不得 READY）  
- Work 在收到 Bundle 前：其 RM-09/RM-11 继续 `BACKLOG`（其 PRD 已写死）

---

## 需要你确认的两点（确认后我再进入正式生成路径 / AD 修订稿）

1. **发布切片**：先只关 Approval（推荐） / 一次关 A+B / 先只关 Attachment？  
2. **治理落点**：新 RM-17（推荐） / 修订 RM-09 依赖 / 仍等 RM-08？

你选定后，下一步应是：读 `using-superpowers` → `brainstorming:architecture` / `smc-architecture-decision`，起草 AD Addendum，而不是直接改 `contracts/`。