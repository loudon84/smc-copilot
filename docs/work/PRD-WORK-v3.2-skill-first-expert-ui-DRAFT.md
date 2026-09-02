---
work_item_id: WORK-EXPERT-UI-V3.2
version: v3.2.0-draft
status: REVIEW_REQUIRED
target_branch: work/prd-3.0
review_verdict:
approved_at:
grounding_mode: discover
source_commit: c10ae2fdc9bd7d286d828836c80fcbc2debb6257
---

# WORK PRD v3.2 — Skill-First Expert Context UI

本文校准附件《apps/work Skill-First Expert UI Optimization v3.2》。产品目标保留为：用户一次选中可调用能力，Toolbar 以 Skill `displayName` 为主，不再要求先理解 Expert slug。架构目标是 **MODIFY 现有 Expert Context owner**，不是再建一套 Skill 执行栈。

`REVIEW_REQUIRED` 表示 Grounding 已完成、可进入独立 PRD Review；本文不是 `APPROVED`，不能进入 `.plan.md` 或实现。

> 版本号 v3.2 只标识本 UI 能力。已批准 WORK PRD v3.0 将 status-poll fallback 的最早删除版本也标为 v3.2；**本文不删除该 fallback**。

## 1. Grounding 结论

附件的产品意图成立：当前 Chip / Popover 仍是 Expert → Skill 两级选择，用户必须先选 Expert 再选 Skill，且 Chip 文案是 `Expert · Skill`。真正需要修正的是附件把这次改动写成了新的 Skill 平台。

目标边界冻结为：

```text
用户可见
  Category rail（UI 分组） → Skill 行（一次选中）
        │
        ▼ 完整 pair 才写入 Chat truth
ExpertSelection { expertSlug, skillName }
        │
        ▼ 现有提交链（Slash 优先）
ExpertRequest { kind: "expert", expertSlug, skillName, ... }
        │
        ▼ Main
ExpertGatewayClient.callSkill() → HermesTask
ExpertRunService / File Platform / MessageList
```

核心决定：

1. 调用身份仍是 `(expertSlug, skillName)`。Catalog 路由身份是 `annotations.slug`；Skill 调用身份是 `tool.name`。Renderer 可以不展示 slug，但 **必须发送 slug**。
2. 用户可见的 Category **不是**新的服务端字段。当前 WORK-EXPERT-CONTRACT v1.0.2 Catalog/Skill annotations 没有 `category` / `tags` / `capabilities`。Category rail 投影自 **Catalog Expert**（`displayName`，否则 `name`，再否则不把 slug 当作营销文案暴露）。
3. `Chat.tsx` 仍是唯一 selection truth；`ExpertContextControl` 仍是唯一 health/catalog/skill/refresh/callability UI owner。禁止新增 `modules/skills/`、`window.hermesAPI.skills` 或 `SkillRunRequest`。
4. 不得把 Expert SSE 伪造成 Reasoning/Tool timeline。合同仍是 `runtimeProgress=false`；真实过程事件属于尚未批准的 Chat 合同 PRD，以及未来 `runtimeProgress=true` 的 Provider 合同。
5. `WorkChatEventV1` / 唯一 Chat reducer **不是本 PRD Scope**。`apps/work/docs/chat-contracts.md` 仍为 `DRAFT`，不能当 Frozen v1.0 依赖。
6. `ExpertRunCard`、`ExpertArtifactCards`、File Platform、Expert Run Service 的 owner KEEP。RunCard 在现网已是 `taskId == null` 时的 compact transport 行，不是大型进度卡。

## 2. 权威基线与指令优先级

附件是待校准的外部方案，不是仓库指令或已批准合同。冲突时按以下顺序处理：

1. 根 `AGENTS.md`、`apps/work/AGENTS.md` 与 API/Event 路由规则；
2. 已批准 PRD、钉定 Provider 合同、ADR；
3. 当前生产源码与 `lat.md`；
4. `apps/work/docs/chat-contracts.md`（`DRAFT`，只作边界参考，不能当 Frozen 依赖）；
5. 附件中的建议类型、目录、IPC 名和实施清单。

本次基线：分支 `work/prd-3.0`，commit `c10ae2fdc9bd7d286d828836c80fcbc2debb6257`。未扫描归档 PRD、构建产物或 Runtime 数据。

## 3. 附件与仓库规则冲突

| # | 附件主张 | 仓库事实 / 冲突 | 结论 | 规划来源 |
|---|---|---|---|---|
| C1 | 依赖 Frozen Work Chat Rendering/Event Contract v1.0 | `apps/work/docs/chat-contracts.md` 为 `DRAFT`；WorkChatEvent reducer 尚未批准 | 本 PRD 不冻结、不实施该合同 | chat-contracts.md Open Gates |
| C2 | 新增 `SkillRunRequest` / `WorkSkillItem` / `window.hermesAPI.skills` | 跨进程 DTO 与 IPC 已由 `shared/expert.ts` + `hermesAPI.expert` 拥有；`callSkill` 走 `POST /api/v1/expert/mcp/{slug}` | 禁止第二套 Skill 网络/IPC owner；UI 可组合现有 Catalog+Skill DTO | WORK PRD v3.0 / v3.0.1 |
| C3 | 请求禁止携带 `expertSlug` | Catalog 路由身份是 slug；`ExpertRequest.expertSlug` 与 `listSkills(slug)` 是现网强制字段 | UI 隐藏 slug；wire 继续发送 | v3.0.1 Behaviour Contract |
| C4 | Category 由服务端标准字符串返回，前端只做 label 映射 | v1.0.2 Catalog annotations 无 `category`；parser 只读 kind/slug/displayName/status/counts | Category = Catalog Expert 展示名投影；不得前端按 Skill 名称推断，也不得发明 Provider 字段 | gateway `parseCatalogTools` |
| C5 | Expert SSE 映射为 Thought / Tool / MessageList 过程行 | v3.0 锁定 `runtimeProgress=false`；现网只把 `progressMessage`/`resultContent` 镜像为 assistant bubble | KEEP 现有文本 bubble；禁止伪造 tool/reasoning | WORK PRD v3.0；chat-contracts.md C12 |
| C6 | 用 `SkillContextControl` 等替换整个 `modules/expert` | v3.0.1 已将 Control/Chip/Popover 定为唯一 Context UI owner | MODIFY 现有组件；禁止 rename-as-new-owner | WORK PRD v3.0.1 |
| C7 | 删除 `ExpertRunCard`，过程全部进 MessageList | 现网 RunCard 仅 `taskId == null` 的 transport/retry/cancel；accepted 后已走 bubble + Artifact cards | KEEP compact RunCard；不把它塞进 `ChatMessage` union | Chat.tsx；chat-contracts.md C8 |
| C8 | 新建 Skill MCP Gateway / Agent Runtime Route | NoDeskClaw Expert Gateway 已是唯一网络 owner；Local Hermes `screens/Skills` 是另一套 bundled skill 管理页 | KEEP Expert Gateway；禁止与本地 Skills 页混名 | v3.0；`Skills.tsx` |
| C9 | `SkillCallability` 只看 Skill 级 status | `canSilentCallExpertSkill` 要求 Catalog `ready` **且** Skill allowlist | KEEP 现有谓词；Control 与 `callSkill` 共用 | `shared/expert.ts` |
| C10 | `approvalMode=confirm` 弹出确认框 | v3.0.1 P0 无 Permission 选择器；非 silent-call 以 toast 拒绝 | KEEP fail-closed；本 PRD 不新增确认 UI | v3.0.1 |
| C11 | Phase B 允许 Skill Run + Background Quick Ask | v3.0.1：`expertSlug != null` 时 `/btw` 与 `onQuickAsk` 停止 | KEEP 该门禁；不在本 PRD 放开并发 | v3.0.1 |
| C12 | Phase 0 先实现 WorkChatEvent reducer | 那是独立 Chat 合同能力，且仍为 DRAFT | 从本 PRD 删除 Phase 0 | chat-contracts.md |
| C13 | Local preference 只存 `toolName` | Skill `tool.name` 在 Expert 之间不保证全局唯一 | 若未来做最近使用，键必须是 `(expertSlug, skillName)`；本 PRD 不做收藏/最近使用 | v3.0.1 身份规则 |
| C14 | 本 v3.2 删除 SSE status-poll fallback | v3.0 Compatibility 的删除条件是 30 天生产指标 + 新 PRD，且“最早 v3.2” | 本文不触发该 REMOVE | WORK PRD v3.0 |

## 4. PRD 与规划来源追溯

| 当前能力 / 决定 | 来源 | 追溯结论 |
|---|---|---|
| Explicit Expert 调用、HermesTask、SSE、`runtimeProgress=false` | `docs/work/PRD-WORK-v3.0-expert-execution.md` | APPROVED；本 PRD 不得迁走 Run Service / Gateway / 调用身份 |
| Context 选择、Chip/Popover、health、silent-call、Quick Ask 门禁 | `docs/work/PRD-WORK-v3.0.1-expert-context-selector.md` | APPROVED；本 PRD 只 MODIFY 选择 UX 与 Chip 文案，KEEP owner |
| Expert Artifact → File Platform → Chat card / Session Files | `docs/work/PRD-WORK-v3.1-expert-remote-artifact-chat-file-resource.md` | APPROVED；本 PRD 不改 resource owner |
| Chat 五类 `ChatMessage`、Artifact 不进 union、Expert 不得伪造 tool timeline | `apps/work/docs/chat-contracts.md` | DRAFT；本 PRD 遵守其边界，但不实施 reducer |
| Provider 合同身份 | `contracts/work-expert/v1.0.2/consumer-lock.json` | KEEP v1.0.2；本 PRD 不升级 Provider 合同 |
| 本地 Hermes bundled Skills 管理页 | `apps/work/src/renderer/src/screens/Skills/Skills.tsx` | 不同 Capability；名称碰撞时 Expert Context 仍叫 Expert 模块，用户文案可用「技能」 |

## Current Capability Inventory

| Capability | Existing Owner | Current Behaviour | Evidence | Result |
|---|---|---|---|---|
| Context selection truth | `Chat.tsx` | `expertSelection: { expertSlug, skillName }`；二者皆有才 `expertModeActive` | `Chat.tsx#expertSelection` | EXISTS |
| 提交路由 / Slash / 队列 | `Chat.tsx` | Slash 优先；只选 Expert 未选 Skill 时 toast 并阻止；完整 Context 走 `submitExpert` | `Chat.tsx#handleSubmitOrQueue` | EXISTS |
| Background / Quick Ask 门禁 | `Chat.tsx` / `ChatInput` | `expertSlug != null` 时停止，不走本地后台、不 `start` | `Chat.tsx#handleSubmitOrQueue`；`onQuickAsk` | EXISTS |
| 本地 toolbar 控件 | `Chat.tsx` | `expertSlug != null` 时禁用 Model/Reasoning/fast-mode/ContextFolder | `chat-toolbar-local-controls` | EXISTS |
| Context UI lifecycle | `ExpertContextControl` | health/catalog/skill/refresh/revision/callability；受控 `value/onChange` | `ExpertContextControl.tsx` | EXISTS |
| 选择 UI | `ExpertSelector` | 两个原生 `<select>`：先 Expert 后 Skill；选 Expert 清空 Skill | `ExpertSelector.tsx` | PARTIAL |
| Chip 展示 | `WorkContextChip` | full=`Expert · Skill`；expert=Expert；icon=Expert 首字母；空=Local Chat | `WorkContextChip.tsx` | PARTIAL |
| Popover 壳 | `WorkContextPopover` | 标题 Work Context；Clear/Refresh/Esc；键盘仅 Esc | `WorkContextPopover.tsx` | PARTIAL |
| Catalog/Skill HTTP | `expert-gateway-client.ts` | `listCatalog` / `listSkills(slug)`；无 category；缺 slug 丢弃 | `parseCatalogTools` / `parseSkillTools` | EXISTS |
| 调用身份与 silent-call | `shared/expert.ts` + `callSkill` | `canSilentCallExpertSkill(catalog, skill)`；Main 强制执行 | `canSilentCallExpertSkill` | EXISTS |
| ExpertRequest / IPC | `shared/expert.ts` / `expert-ipc.ts` / `expert-api.ts` | `window.hermesAPI.expert.*`；无 `skills.*` | `EXPERT_IPC_CHANNELS` | EXISTS |
| Task lifecycle | `expert-run-service.ts` | queued→starting→running→terminal；SSE + 受限 poll | `expert-run-service.ts` | EXISTS |
| UI projection | `modules/expert/store.ts` | `ExpertRunProjection` 含 progress/result/artifactFileIds，不是 task truth | `ExpertRunProjection` | EXISTS |
| Pre-accept transport UI | `ExpertRunCard` | 仅 `taskId == null` 渲染 compact 行；retry/cancel | `Chat.tsx` expert-runs-panel | EXISTS |
| Transcript 镜像 | `Chat.tsx` | taskId 后 upsert user/assistant bubble；正文来自 `buildExpertTranscriptAssistantContent` | `Chat.tsx` live transcript effect | EXISTS |
| Artifact 卡 / Session Files | `ExpertArtifactCards` + File Platform | 成功后按 `artifactFileIds` 展示；不进 `ChatMessage` union | `Chat.tsx`；v3.1 | EXISTS |
| `ExpertTimeline` | 源文件存在 | Chat 生产路径与 feature public entry 均未挂载 | `ExpertTimeline.tsx`；`modules/expert/index.ts` | EXISTS（未接入 Chat） |
| 本地 bundled Skills 页 | `screens/Skills` + `main/skills.ts` | Hermes 本地 skill 安装/浏览，与 Expert MCP 无关 | `Skills.tsx` | EXISTS（不同 Capability） |
| Provider category / flat skill catalog | 无 | v1.0.2 无该字段与 API | consumer-lock v1.0.2 | MISSING |
| Skill-first picker | 无 | 必须先选 Expert | `ExpertSelector.tsx` | MISSING |
| Canonical Chat reducer / WorkChatEvent | 无（DRAFT PRD） | Dashboard/IPC/Expert 仍直接改 Chat 状态 | chat-contracts.md | MISSING（本 PRD 不 ADD） |
| 真实 Expert tool/reasoning 事件 | Provider `runtimeProgress=false` | 只有最低 stage + 文本 progress | v3.0；run-service 注释 | MISSING（本 PRD 不 ADD） |

## 5. Target Behaviour

### 5.1 用户模型

用户操作从「先选 Expert，再选 Skill」改为「按分组浏览，一次点选 Skill」。

- **Category**：只用于 Picker 分组与过滤。生产投影来源是 Catalog Expert 的展示名。它不是 `ExpertRequest` 字段，不是 `callSkill` 路由条件。
- **Skill**：用户选中的可调用能力。展示优先 `displayName`，否则 `tool.name`。
- **调用 pair**：点选 Skill 时一次写入 `{ expertSlug, skillName }`。Clear 写入 `{ null, null }`。
- **Expert / Runtime / Docker / profile path / Gateway URL**：不出现在 Chip、Picker 行、toast 的用户文案中。slug 仍存在于内部 DTO。

未选 Skill 时行为保持 Local Chat（含现有 Dashboard/Hermes transport）。

### 5.2 Selection 不变量

`Chat.tsx` 仍是唯一 truth，类型 KEEP：

```ts
interface ExpertSelection {
  expertSlug: string | null;
  skillName: string | null;
}
```

新增不变量：

- Chat truth 只允许 **二者皆 null** 或 **二者皆非空**。禁止把「只选了 Category / 只选了 Expert」写成 Chat selection。
- Picker 的 Category 高亮、搜索关键字、列表滚动是 Control 内部 UI 状态，不得 `onChange` 进 Chat。
- 用户点选 Skill：`onChange({ expertSlug, skillName })` 一次提交完整 pair。
- Clear：`onChange({ expertSlug: null, skillName: null })`。
- Reconciliation（修正 v3.0.1 规则 2）：
  1. 最新合法 Catalog 不含当前 `expertSlug` → `{ null, null }`；
  2. Expert 仍在，但最新合法 Skills 不含当前 `skillName` → `{ null, null }`（不再留下残缺 Expert）；
  3. pair 仍合法 → 不回调；
  4. 过期 revision / unmounted → 不回调。

因此生产路径删除 toast：`Select an expert skill before sending.` 该中间态不再由 Chat 持有。若 `handleSubmitOrQueue` 仍看到残缺 pair（防御），视为非法并阻止，不得 Local Chat、不得 `start`。

`expertModeActive` 继续定义为二者皆有。本地 toolbar 禁用、Quick Ask / `/btw` 停止条件与 `expertModeActive` 对齐（完整 pair）。因残缺 pair 不再写入，这与旧的 `expertSlug != null` 在目标态等价。

### 5.3 Chip / Picker 可观察行为

Toolbar Chip：

| 状态 | 文案 |
|---|---|
| 未选择 | `Skills`（或现有 Local Chat 语义的等价「未选技能」文案，Plan 定 i18n key） |
| 已选择完整 pair | Skill `displayName`（否则 `skillName`）；不展示 Expert slug |
| Gateway checking/unknown | 现有黄点 |
| Gateway error/unavailable | 现有红点；Picker 内 Skill 行按 status 灰化 |
| 执行中 | Chip 保持已选 Skill 名；不改成 Runtime 地址 |

密度规则 KEEP 按 Composer toolbar 行宽度，但文案改为 Skill-first：

- full：已选则 Skill 名；未选则未选文案；
- expert：同上缩短，仍优先 Skill 名；
- icon：已选 Skill 展示名首字符，未选为中性字符，不暴露 Expert slug。

Picker：

- 宽屏：左侧 Category rail（含「全部」）+ 右侧 Skill 列表；不是全屏管理页。
- 窄屏：Category 变为 section header，单列列表。
- 搜索字段：Skill `displayName` / `name` / `description`；Category 展示名可命中以过滤分组。不得用 Skill 名称反推 Category。
- 每行：展示名、简短 description、status（ready / 暂不可用 / 已停用）。status 不能只靠颜色。
- 不可调用（Catalog 或 Skill 非 ready、`callEnabled !== true`）的行可展示但不可提交为 selection，或选中后仍被 silent-call 拒绝；权威拦截仍是 `callSkill`。
- 键盘：Arrow 移动、Enter 选中、Esc 关闭（现有 Esc KEEP，补列表导航）。
- 刷新：继续走现有 `refreshCatalog` + revision，不新增 IPC namespace。

为支撑 Skill-first 列表，Control 可以按现有 `listSkills(slug)` 为 ready Catalog 批量拉 Skill。这是同一 Control + 同一 Gateway owner 内的读取策略，不是新 API。禁止为了扁平列表新增 `skills.list` Production Owner。

### 5.4 执行、Transcript、Artifact

KEEP 现有链：

```text
Slash → 优先
完整 ExpertSelection + silent-call + gateway ready
  → ExpertRequest
  → hermesAPI.expert.start
  → ExpertRunService / callSkill
```

- `ExpertRequest.kind` 保持 `"expert"`，继续带 `expertSlug` + `skillName`。
- `canSilentCallExpertSkill` KEEP；非 silent-call 仍 toast 拒绝，不新增 confirm modal。
- `ExpertRunCard` KEEP：只处理尚未 `taskId` 的 connecting/retry/cancel/unauthorized。文案可改为用户向的「正在连接技能服务…」/「技能服务暂不可用」，但不迁 owner、不进入 `ChatMessage`。
- Transcript KEEP：accepted 后镜像 user/assistant bubble；`progressMessage` 只作为 assistant 文本，不创建 Reasoning/Tool 行。
- `ExpertArtifactCards` + Session Files / File Preview KEEP；本 PRD 不改名为新 Resource 模块 owner。
- `ExpertTimeline` 继续不得接入 Chat。本 PRD 不把它恢复为过程 UI。

### 5.5 明确不在 Scope

- 实施或冻结 `WorkChatEventV1` / 唯一 Chat reducer；
- 把 Expert SSE 投影为 Thought/Tool；
- 升级 WORK-EXPERT-CONTRACT（category、flat catalog、`runtimeProgress=true`）；
- 新增 Skill MCP Gateway、`SkillRunRequest`、`SkillRunProjection`、`modules/skills/`；
- 删除 `expertSlug` 或 `window.hermesAPI.expert`；
- 删除 status-poll fallback；
- 本地 Hermes Skills 管理页；
- 最近使用 / 收藏；
- Permission / confirm 选择器；
- Skill 运行中与 Background Quick Ask 并发。

## Target End-State Inventory

| Capability | Target Production Owner | Target Behaviour | Classification |
|---|---|---|---|
| Context selection truth | `Chat.tsx` | 仍持有 `ExpertSelection`；只接受完整 pair 或全空 | MODIFY |
| 提交路由、Slash、队列、UI 门禁 | `Chat.tsx` | Slash 优先；完整 pair 走 Expert；删除残缺-Skill 中间态 toast 的生产意义 | MODIFY |
| Background / Quick Ask | `Chat.tsx` | 完整 pair 时停止；未选则现有本地后台 | KEEP |
| 本地 toolbar 禁用 | `Chat.tsx` | 完整 pair 时禁用四个本地控件 | KEEP（条件与完整 pair 对齐） |
| Context UI lifecycle | `ExpertContextControl` | KEEP health/catalog/refresh/revision/callability；新增 Category 过滤与跨 Expert Skill 列表读取 | MODIFY |
| Picker 展示 | Control 内 Picker 视图 | Skill-first 列表；Category=Catalog Expert 投影 | REPLACE（替换双 `<select>` 生产 UI） |
| Chip | `WorkContextChip` | Skill-first 文案；不展示 slug | MODIFY |
| Popover 壳 | `WorkContextPopover` | 仍为 Control 的 dialog 壳；标题/空状态改为技能语义 | MODIFY |
| `ExpertSelection` 类型 | `ExpertSelector.tsx` 或现有 shared 导出 | KEEP 两字段；不改为 `skillId`/`toolName` 无 slug | KEEP |
| Catalog/Skill HTTP、cache、`callSkill` | `expert-gateway-client.ts` | KEEP v1.0.2 parser 与门禁；不为 category 发明字段 | KEEP |
| IPC / Preload | `expert-ipc.ts` / `expert-api.ts` | KEEP `hermesAPI.expert`；不新增 `skills` namespace | KEEP |
| Silent-call 谓词 | `shared/expert.ts` | KEEP `canSilentCallExpertSkill` | KEEP |
| ExpertRequest / Projection / Run Service | 现有 v3.0 Owner | KEEP 协议与生命周期 | KEEP |
| Compact RunCard | `ExpertRunCard` | KEEP pre-accept transport；可改用户文案 | MODIFY（文案） |
| Transcript bubble mirror | `Chat.tsx` | KEEP 文本镜像；不新增 ChatMessage kind | KEEP |
| Artifact / File Platform | v3.1 Owner | KEEP | KEEP |
| 本地 bundled Skills 页 | `screens/Skills` | KEEP 独立 Capability | KEEP |
| Consumer lock v1.0.2 | `contracts/work-expert/v1.0.2/` | KEEP | KEEP |
| WorkChatEvent reducer | 无（他份 DRAFT PRD） | 本 PRD 不引入 | KEEP 现状 |
| `window.hermesAPI.skills` / `WorkSkillItem` wire DTO | 附件拟新增 | 不进入生产 | REMOVE（方案项，无生产 consumer） |
| Skill-first 扁平调用身份 | 附件拟以 `toolName` 单键调用 | 不进入生产 | REMOVE（方案项） |

## Change Classification

| Action | Item | Required change |
|---|---|---|
| KEEP | `ExpertRequest` / `expertSlug`+`skillName` 调用身份 | Renderer 隐藏、Main 仍发送 |
| KEEP | `ExpertContextControl` 作为唯一 Context UI owner | 不把 Control 迁到新模块 owner |
| KEEP | Gateway / IPC / Run Service / File Platform / Artifact cards | 不改 Production Owner |
| KEEP | `canSilentCallExpertSkill` 与 `callSkill` 强制门禁 | Catalog+Skill 双重要件 |
| KEEP | Slash 优先、未选 Skill 时 Local Chat | 现有路由 |
| KEEP | Quick Ask / Background 在 Expert Context 激活时停止 | v3.0.1 门禁 |
| KEEP | `runtimeProgress=false` 文本 bubble | 不伪造 Tool/Reasoning |
| KEEP | compact `ExpertRunCard` 的 pre-accept 职责 | 不删除 retry/cancel |
| MODIFY | `Chat.tsx` selection 不变量 | 只写完整 pair 或全空；防御残缺 pair |
| MODIFY | Control 读取策略 | 为 Picker 批量 `listSkills`；Category 为内部过滤态 |
| MODIFY | Chip / Popover 文案与密度展示 | Skill-first；不暴露 slug |
| MODIFY | RunCard 用户文案 | 连接中/不可用，不暴露内部路由 |
| MODIFY | Reconciliation 规则 2 | 非法 Skill 清成全空，不留残缺 Expert |
| REPLACE | 生产路径双原生 `<select>` Picker | Skill-first 列表 + Category rail/section |
| REMOVE | 生产路径「只选 Expert 未选 Skill」作为合法 Chat 态 | 改由 Picker 内部过滤承担 |
| REMOVE | 附件中的 `skills` IPC、`SkillRunRequest`、`modules/skills` 新 owner、WorkChatEvent Phase 0 | 不实施 |

## Replacement / Removal Matrix

| Replaced production path | Replacement owner | Removal condition |
|---|---|---|
| `ExpertSelector` 双原生 `<select>` 作为 Chat toolbar 生产 Picker | 同一 `ExpertContextControl` 内的 Skill-first Picker | Control 不再渲染双 select；键盘/搜索/status/完整 pair 写入的测试通过；现有 health/refresh/revision/callability 回归通过 |
| Chip `Expert · Skill` 作为默认 full 文案 | 同一 `WorkContextChip` 的 Skill-first 文案 | 已选时用户看不到 slug；未选/密度/status 点回归通过 |
| Chat 合法残缺态 `{ expertSlug, skillName: null }` + toast `Select an expert skill before sending.` | 完整 pair 或不选；Picker 内 Category 过滤 | 生产发送路径不再依赖该 toast；残缺 pair 若出现只作防御拒绝 |

无 Compatibility Contract：切换完成前不得并行两套 Picker。不保留双 select 作为 fallback。

## 6. 验收用例

### Case 1：普通 Chat

未选 Skill。本地 Hermes / Dashboard Chat、Slash、Clarify、session history 行为不变。

### Case 2：一次选中能力

Picker：Category（Catalog Expert 展示名）→ 某 Skill。Toolbar 只显示该 Skill `displayName`。内部 `ExpertRequest` 仍含对应 `expertSlug` 与 `skillName`。

### Case 3：不可用

Catalog 或 Skill 非 ready / gateway unavailable：行灰化并有文本「暂不可用」或等价；不能 silent-call；toast/错误不包含 Docker/Agent/URL。

### Case 4：Clear

Clear 后 selection 全空，恢复 Local Chat 与本地 toolbar。

### Case 5：Refresh 失效

当前 Skill 从列表消失 → Chat selection 变为全空，而不是留下无 Skill 的 Expert。

### Case 6：执行与产物

发送后：无 `taskId` 时 compact transport 行可取消/重试；accepted 后 assistant 文本进入 MessageList；产物仍走 Artifact cards 与 Session Files。不出现 ToolActivityGroup，除非未来独立合同提供真实 tool 事件。

### Case 7：回归

Quick Ask 在已选 Skill 时仍被阻止。Slash 仍优先。`callSkill` 仍拒绝非 silent-call。Artifact preview/download 不回归。

## Acceptance Criteria

### 选择 UX

- [ ] 用户一次点选即可形成可发送 Context；不再出现生产路径上的「已选 Expert、未选 Skill」中间态。
- [ ] Category 只用于 Picker 分组/过滤，不进入 `ExpertRequest`，不作为 `callSkill` 路由。
- [ ] Chip 已选时展示 Skill `displayName`（否则 `skillName`），不展示 Expert slug / Runtime 地址。
- [ ] Picker 宽屏为 Category + 列表，窄屏为 section 列表；不是全屏 Expert 管理页。
- [ ] 搜索只过滤展示字段；前端不按 Skill 名称推断 Category。
- [ ] 键盘 Arrow/Enter/Esc 与非颜色 status 文本可用。

### Owner 与合同

- [ ] `Chat.tsx` 仍是唯一 `ExpertSelection` truth；Control 仍受控，不保存第二份 selection。
- [ ] 跨进程请求仍是 `ExpertRequest`，字段仍含 `expertSlug` 与 `skillName`。
- [ ] 不存在生产 `window.hermesAPI.skills`、`SkillRunRequest`、`WorkSkillItem` wire DTO、`modules/skills` Production Owner。
- [ ] `canSilentCallExpertSkill` 与 `callSkill` 门禁不变。
- [ ] Consumer lock 仍为 WORK-EXPERT-CONTRACT v1.0.2。

### 执行与渲染

- [ ] 未选 Skill 时 Local Chat 不回归。
- [ ] Slash 优先于 Expert 执行。
- [ ] 已选完整 pair 时 Quick Ask / background 仍停止。
- [ ] `ExpertRunCard` 仍只覆盖 pre-accept transport，不成为 Transcript row。
- [ ] MessageList 不增加 Artifact/Expert/Skill 专用 `ChatMessage` kind。
- [ ] 不把 Expert progress 渲染成 Reasoning 或 Tool group。
- [ ] Artifact cards 与 Session Files 仍消费同一 File Platform `fileId`。

### 回归

- [ ] health / refresh / revision / 多 Chat 实例 `active` 门控不回归。
- [ ] retry/cancel、rehydrate、artifact discovery retry 不回归。
- [ ] 本地 Skills 管理页不被本 PRD 改动或占用 IPC 名。
- [ ] `lat check` 在实施阶段通过；本 Grounding 文档不改生产代码。

## 7. Source Anchors

- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#expertSelection`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleSubmitOrQueue`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitExpert`
- `apps/work/src/renderer/src/modules/expert/ExpertContextControl.tsx`
- `apps/work/src/renderer/src/modules/expert/ExpertSelector.tsx#ExpertSelection`
- `apps/work/src/renderer/src/modules/expert/WorkContextChip.tsx`
- `apps/work/src/renderer/src/modules/expert/WorkContextPopover.tsx`
- `apps/work/src/renderer/src/modules/expert/ExpertRunCard.tsx`
- `apps/work/src/renderer/src/modules/expert/ExpertArtifactCards.tsx`
- `apps/work/src/shared/expert.ts#ExpertRequest`
- `apps/work/src/shared/expert.ts#canSilentCallExpertSkill`
- `apps/work/src/shared/expert.ts#EXPERT_IPC_CHANNELS`
- `apps/work/src/main/expert/expert-gateway-client.ts#parseCatalogTools`
- `apps/work/src/main/expert/expert-gateway-client.ts#parseSkillTools`
- `apps/work/src/preload/expert-api.ts`
- `apps/work/src/renderer/src/screens/Skills/Skills.tsx`
- `contracts/work-expert/v1.0.2/consumer-lock.json`
- `docs/work/PRD-WORK-v3.0-expert-execution.md`
- `docs/work/PRD-WORK-v3.0.1-expert-context-selector.md`
- `docs/work/PRD-WORK-v3.1-expert-remote-artifact-chat-file-resource.md`
- `apps/work/docs/chat-contracts.md`

## 8. Open Gates

独立 PRD Review 须确认：

1. 接受「Category = Catalog Expert 展示投影」，而不是等待 Provider 增加 `category` 字段。
2. 接受「UI Skill-first、wire 仍发送 `expertSlug`」，不把隐藏 slug 误当成删除调用身份。
3. 接受 Transcript Thought/Tool 与 WorkChatEvent reducer 不在本 PRD；它们分别依赖 `runtimeProgress=true` 合同与 `chat-contracts.md` APPROVED。

关闭后由 `smc-prd-converge` 才能去掉 `-DRAFT` 并标 `APPROVED`。实施必须由批准稿生成最小 `.plan.md`；本文不冻结 exact 组件文件名、hook、CSS 像素或 i18n key。
