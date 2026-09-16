---
title: "Work Design System 建立与 Knowledge 首消费者接入 PRD"
subtitle: "Work UI Primitive / Common Layer → Knowledge Presentation Consumer"
prd_id: "PRD-WORK-KNOWLEDGE-UI-001"
version: "1.1.1"
status: "APPROVED_FOR_PLAN"
product: "SMC Copilot Desktop / Work Design System"
repository: "https://github.com/loudon84/smc-copilot"
branch: "work/prd-v5.1"
baseline_commit: "d32efcfce049e7f8e92edc3393939baa7cd989cf"
owner: "Work Design System"
first_consumer: "apps/work Knowledge presentation"
reviewers:
  - "Product"
  - "Work Frontend"
  - "Knowledge Integration"
created_at: "2026-09-16"
updated_at: "2026-09-16"
target_release: "Work v5.1 follow-up"
change_type:
  - BROWNFIELD_CHANGE
  - ARCHITECTURE_CHANGE
  - INTEGRATION
  - MIGRATION
  - BUGFIX
golden_consumer: "Knowledge page/component screenshot fixtures (no Desktop shell)"
related_docs:
  - "docs/knowledge/PRD-WORK-KNOWLEDGE-BASE-V1.0.md"
  - "docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md"
source_application: "https://github.com/loudon84/copilot-knowledge"
source_ui_path: "copilot-knowledge/src/components/ui"
supersedes: null
grillme_decisions:
  - "D1 Work Design System is Production Owner"
  - "D2 Legacy feature CSS may coexist; only Knowledge production CSS is zeroed"
  - "D3 All seven Knowledge pages migrate; visual and automated a11y gates are contracted"
  - "D4 P0 catalog is inventory-frozen"
  - "D5 New tokens guarantee light/dark only"
  - "D6 New .ui-* namespace; do not rewrite global .btn"
  - "D7 Visual REQUIRED is shell-less page/component screenshots"
---

# 0. PRD 使用规则

本 PRD 是 **Engineering Contract PRD**，用于产品、架构师、前端工程师以及 Cursor / Codex 等 Coding Agent 将本需求低歧义转换为实施计划。

强制规范关键词：

- `MUST`：必须实现、必须测试、必须有 Evidence。
- `MUST NOT`：违反即 Requirement FAIL。
- `SHOULD`：默认应实现，偏离必须说明原因。
- `SHOULD NOT`：原则禁止，偏离必须说明原因。
- `MAY`：可选能力，不阻断 Release Gate。

No-Inference Rule：

如果 Plan / Coding Agent 无法唯一确定组件 Owner、状态事实源、视觉契约、副作用边界、迁移行为、Failure 行为或 Acceptance Oracle，则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 根据个人偏好补全实现
MUST NOT 在实现期向 Work UI catalog 私自新增 primitive
```

实现期若盘点遗漏某个产品控件：

```text
MUST report SPEC_SEMANTIC_GAP
MUST 先改本 PRD 目录再继续实现
```

---

# 0.1 Grillme 冻结决策

本 v1.1 吸收 Grillme 评审收敛，以下决策是后续条款的上位合同：

```text
D1 Production Owner = Work Design System
   （components/ui + components/common + .ui-* + light/dark token）
D2 Legacy 共存：Discover / Memory / Gateway / Settings 私有 CSS 本 Release 可保留。
   仅 Knowledge 生产代码 forbidden class == 0。
D3 七页全迁到 Work DS；visual / 自动化 a11y 闸门收缩。
D4 P0 按 Knowledge 七页盘点冻结；§9.1 原文超集不得自动升 REQUIRED。
D5 新语义 token 只保证 light / dark；其它 data-theme 为 Non-goal。
D6 新 .ui-* 命名空间；禁止改写全局 .btn 语义。
   Knowledge MUST NOT 重定义 .ui-*。
D7 Visual REQUIRED = 无 Desktop shell 的页面/组件截图；
   真实 Desktop Golden = SHOULD。
```

---

# 1. 一句话目标

在 `apps/work` 建立唯一的 **Work Design System**（UI Primitive + Common Component + `.ui-*`），并以已合并的 **Knowledge 七页**作为第一个消费者完成 presentation 迁移。业务契约（IPC / Facade / FileJob / File Platform / Login JWT）保持不变。Knowledge 不再借用 Discover / Memory / Gateway / Settings 私有 CSS。其它现有模块本 Release 不迁。本 Release Gate 不扫描 Knowledge 以外的新目录；那些目录改用 DS 属于 Roadmap，不是本 Gate。

---

# 2. 背景与问题定义

## 2.1 Current State

当前 `work/prd-v5.1` 已完成 Knowledge 独立入口及部分真实数据链路接入，当前分支基线：

```text
repo:   loudon84/smc-copilot
branch: work/prd-v5.1
HEAD:   d32efcfce049e7f8e92edc3393939baa7cd989cf
```

当前 Knowledge 页面位于：

```text
apps/work/src/renderer/src/screens/Knowledge/
```

当前通用 Work renderer 组件主要位于：

```text
apps/work/src/renderer/src/components/
```

原 `copilot-knowledge` 应用使用一套完整 UI primitive 集合：

```text
alert-dialog
avatar
badge
button
card
checkbox
collapsible
command
dialog
dropdown-menu
input-group
input
label
navigation-menu
progress
scroll-area
select
separator
sheet
sidebar
skeleton
sonner
switch
table
tabs
textarea
toggle-group
toggle
tooltip
```

原应用基于 shadcn / Radix 风格组件语义；迁移到 Work 后，没有形成等价的 Work 通用组件层。

当前 Knowledge presentation layer 存在如下实现：

```text
KnowledgeToolbar      -> discover-toolbar
KnowledgeSearchInput  -> discover-search / discover-search-input
KnowledgeEmptyState   -> gateway-empty-state
KnowledgeSectionTabs  -> memory-tabs / memory-tab
Knowledge entity card -> settings-card
```

Knowledge Bases 当前卡片实现主要为：

```text
settings-card
  ├─ name
  ├─ visibility
  └─ status
```

Bases toolbar 仍直接使用 native：

```text
<label>
<select>
<button>
```

Sets / Documents / Uploads / Chat 也存在相同问题，包括：

```text
raw input
raw select
raw checkbox
raw textarea
raw table
raw button
手工 progress div
settings-section
settings-card
```

Work 当前已有且必须复用的基础能力包括：

```text
AppModal
OrbLoader
File Platform / FilePreviewRouter
Work Theme / CSS variables
Work Desktop Shell / Sidebar（本 PRD MUST NOT 重做）
lucide-react
@radix-ui/react-dialog
react-hot-toast
Vitest
Playwright
existing .btn / feature-private CSS（legacy，本 Release 不收编）
```

`npm run test:live-visual` 覆盖 Chat / Sessions / Models，**不是**本 PRD 的 Knowledge visual 基础设施，MUST NOT 写入本 Release 最低必跑。

## 2.2 Problem

### P-001 — 缺失统一 Work UI Primitive Layer

Knowledge 迁移保留了业务页面，但原应用依赖的 Card、Badge、Select、Table、Tabs、Progress 等视觉 primitive 没有被转换为 Work 组件。

可观察结果：

- Knowledge 页面大量使用 raw HTML controls。
- 同类操作控件尺寸、边框、间距、focus、hover 不统一。
- 页面视觉无法继承 Work 的统一产品语言。

### P-002 — Knowledge 与其他模块 CSS 强耦合

Knowledge 当前借用：

```text
discover-*
memory-*
gateway-*
settings-*
```

这些 class 的 Owner 属于其他页面，不属于 Knowledge 或 Work 通用 Design System。

可观察结果：

- 其他页面改 CSS 时可能非预期改变 Knowledge。
- Knowledge UI 无法独立演进。
- 组件语义与视觉实现不一致。

### P-003 — Bases 页面响应式失真

当前 `.knowledge-card-grid` 使用：

```css
grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
```

在宽屏 Work Desktop 中会同时生成过多列，导致 Card 过窄，标题折行、状态散落、可读性下降。

### P-004 — 原 Knowledge 产品语义丢失

原应用 KnowledgeBaseCard 使用 CardHeader / CardContent / CardFooter、Badge、Button、DropdownMenu 等组件语义；当前迁移版本降级为 Settings Card + 文本。

因此当前迁移属于：

```text
业务能力迁移基本完成
Presentation Contract 未完成
```

而不是完整 UI Integration。

## 2.3 Impact

业务影响：

- Knowledge 页面已能进入，但当前视觉质量和可操作性不足以作为桌面产品正式页面。
- 用户难以识别状态、可见性、操作入口和内容层级。

工程影响：

- Knowledge 与 Discover / Memory / Settings / Gateway 样式互相污染。
- 无 Work Design System Owner 时，后续 Mail / AutoTask 会继续抄 feature 私有 CSS。本 Release 把「新模块必须用 DS」写成 Roadmap 约束，不把那些模块列入本 Gate。
- 无冻结 catalog 时，Coding Agent 会私自补 shadcn 超集。

AI Coding 影响：

- Coding Agent 无法判断应该使用何种通用组件。
- “功能可运行”容易被错误认定为“UI 已完成”。
- 缺少 Visual Acceptance，导致自动实现无法判断页面是否失真。

---

# 3. Scope

## 3.1 In Scope

```text
SCOPE-001 建立 Work UI Primitive Layer（冻结目录，见 §9.1）。
SCOPE-002 建立 Work 页面级 Common Components（冻结目录，见 §9.2）。
SCOPE-003 建立 Knowledge Domain Components。
SCOPE-004 重构 knowledge-page-chrome 与 KnowledgeModuleNav。
SCOPE-005 重构 Knowledge Home。
SCOPE-006 重构 Knowledge Bases list。
SCOPE-007 重构 Knowledge Base Detail。
SCOPE-008 重构 Knowledge Sets list/detail（presentation only）。
SCOPE-009 重构 Knowledge Documents list/detail。
SCOPE-010 重构 Knowledge Uploads。
SCOPE-011 重构 Knowledge Chat presentation（不改变 Chat runtime ownership）。
SCOPE-012 建立收缩后的响应式、light/dark、键盘 a11y 与页面截图 Gate。
SCOPE-013 保持既有 Knowledge API / IPC / Facade / FileJob 行为不变。
SCOPE-014 为 .ui-* 建立与全局 .btn 隔离的 CSS 命名空间。
```

## 3.2 Out of Scope

```text
NON-GOAL-001 本 PRD MUST NOT 修改 nodeskclaw-knowledge 后端 API 语义。
NON-GOAL-002 本 PRD MUST NOT 重构 Knowledge 数据模型。
NON-GOAL-003 本 PRD MUST NOT 新建第二套 Knowledge store。
NON-GOAL-004 本 PRD MUST NOT 修改 Work 登录/JWT 所有权。
NON-GOAL-005 本 PRD MUST NOT 重做 Work Desktop Sidebar。
NON-GOAL-006 本 PRD MUST NOT 原样复制 copilot-knowledge 的 sidebar/navigation-menu。
NON-GOAL-007 本 PRD MUST NOT 引入第二套独立主题系统。
NON-GOAL-008 本 PRD MUST NOT 以 iframe 或独立 Web App 方式恢复 copilot-knowledge。
NON-GOAL-009 本 PRD MUST NOT 为满足视觉展示伪造 KnowledgeBaseSnapshot 中不存在的业务字段。
NON-GOAL-010 本 PRD MUST NOT 把 Sets / Chat / Retrieval 从 mock/capability gate 升级为真实 CRUD。
NON-GOAL-011 本 PRD MUST NOT 迁移 Discover / Memory / Gateway / Settings 到 Work DS。
NON-GOAL-012 本 PRD MUST NOT 改写全局 .btn 语义或收编其它模块的私有 CSS。
NON-GOAL-013 本 PRD MUST NOT 要求 nord / tokyo-night 等非 light/dark 主题视觉等价。
NON-GOAL-014 本 PRD MUST NOT 把 npm run test:live-visual 或完整 Desktop shell 截图列为 REQUIRED。
NON-GOAL-015 本 PRD MUST NOT 把自动化 a11y scan 列为 REQUIRED。
NON-GOAL-016 本 PRD MUST NOT 实现未冻结 catalog 项：
              Tooltip / Skeleton / Separator / IconButton / Pagination /
              DropdownMenu / Switch。
```

## 3.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Work Design System | `components/ui` + `components/common` + `.ui-*` | props + light/dark tokens | 可复用控件 | Knowledge API；其它模块迁移 |
| Work Theme | Work Renderer | theme state | CSS variables | Knowledge 业务语义；非 light/dark 新 token |
| Knowledge Domain UI | `screens/Knowledge/components` | Knowledge snapshots | Knowledge 专用展示 | 重定义 `.ui-*`；backend transport |
| Knowledge Page | `screens/Knowledge/pages` + `KnowledgeModuleNav` | Facade / IPC state | 页面组合 | 重复实现 primitive |
| Knowledge layout CSS | `screens/Knowledge` layout classes | 内容宽度 | 如 `knowledge-card-grid` | 产品级 button/input/select/checkbox/textarea |
| Knowledge Data | existing shared/API layer | IPC / facade | snapshots/jobs | UI style |
| File Platform | existing Work owner | ManagedFile | preview/picker | Knowledge DB |
| Legacy feature CSS | Discover / Memory / Gateway / Settings | 各模块私有 | 各模块现有视觉 | 本 Release 迁移 |

---

# 4. Terminology / Domain Model

### Work UI Primitive

不包含业务语义的最小可复用视觉组件，例如：

```text
Button
Input
Select
Card
Tabs
Table
Progress
Badge
```

### Work Common Component

由多个 UI Primitive 组合形成、仍不绑定 Knowledge 业务的通用页面组件，例如：

```text
PageHeader
PageToolbar
SearchInput
DataTable
EmptyState
StatusBadge
```

### Knowledge Domain Component

了解 Knowledge domain model 的组件，例如：

```text
KnowledgeBaseCard
KnowledgeBaseTable
KnowledgeFileJobCard
KnowledgeVisibilityBadge
```

### Cross-feature CSS Borrowing

Knowledge 直接引用其他 feature 私有 CSS class。本 PRD 将 Knowledge 生产代码中的下列依赖定义为禁止架构：

```text
discover-*
memory-*
gateway-*
settings-card / settings-card-*
settings-section / settings-section-*
settings-field
```

扫描范围仅 `apps/work/src/renderer/src/screens/Knowledge/`，含 chrome、ModuleNav、pages、features、domain components。测试 fixture 字符串除外。

Discover / Memory / Gateway / Settings 自己继续使用这些 class 是 Legacy，不是本 PRD 缺陷。

### `.ui-*` Namespace

Work Design System 产品控件的**唯一** CSS 命名空间。Primitive / Common 对外 class MUST 使用 `.ui-*`。禁止 `components/ui` 另起等价前缀。Knowledge 生产代码 MUST 通过 primitive/common 使用它，MUST NOT 在 `screens/Knowledge` 覆盖或重定义 `.ui-*`。全局 `.btn` 保持 legacy，本 Release MUST NOT 改写其语义。

### Visual Fixture

无 Desktop shell 的页面/组件截图宽度。本 PRD 的 1440 / 2048 指 Knowledge 内容夹具宽度，等于列数契约的内容宽度。

### Visual Baseline

经产品/研发确认的截图基线，作为 Playwright / live visual 回归比较的事实源。

### Presentation State

仅用于页面显示的本地状态，例如：

```text
search
visibility filter
card/table mode
dialog open
active tab
```

Presentation State 不是业务事实源。

---

# 5. System Context

## 5.1 Context Diagram

```text
Work Design System
  ├─ components/ui  (.ui-* primitives)
  ├─ components/common
  └─ light/dark tokens

Knowledge Page (first consumer)
  ↓
Knowledge Domain Components
  ↓
Work Common / Work UI
  ↔ existing useKnowledgeFacade / typed IPC
  ↔ existing File Platform
  ↔ nodeskclaw-knowledge

Legacy features (Discover / Memory / Gateway / Settings / .btn)
  = unchanged this release
```

## 5.2 System Boundary

Inside boundary:

```text
apps/work/src/renderer/src/components/ui/
apps/work/src/renderer/src/components/common/
.ui-* styles (shared stylesheet or colocated ui CSS)
apps/work/src/renderer/src/screens/Knowledge/
Knowledge-related renderer tests
Knowledge page/component screenshot fixtures/baselines
Work renderer shared stylesheet when adding light/dark UI token/style only
```

Outside boundary:

```text
nodeskclaw-knowledge backend behavior
Main IPC business contract unless UI compilation requires type-only adaptation
Login/JWT lifecycle
Work Chat runtime
Skill Run runtime
Desktop global navigation ownership
Discover / Memory / Gateway / Settings production CSS
global .btn semantics
npm run test:live-visual suite
non-light/dark theme visual parity
```

External dependency:

```text
React 19
lucide-react
@radix-ui/react-dialog
motion
react-hot-toast
Playwright
Vitest
existing Work Theme
```

---

# 6. Authoritative State / Source of Truth

| State | Type | Authoritative? | Writer | Reader | 自动覆盖 |
|---|---|---:|---|---|---:|
| Knowledge bases/jobs/entities | RUNTIME_STATE | YES | existing Knowledge API/IPC | Knowledge pages | NO |
| Work Theme existing tokens | DESIRED_STATE | YES | Work UI owner | UI/Common/Knowledge | NO |
| New `.ui-*` / light-dark tokens | DESIRED_STATE | YES for light/dark | Work Design System | UI/Common/Knowledge | NO |
| Frozen UI catalog | DESIRED_STATE | YES | this PRD §9 | implementer | only by PRD revision |
| Search/filter/view mode | RUNTIME_STATE | NO | page component | same page | YES |
| Dialog state | RUNTIME_STATE | NO | page/component | same page | YES |
| Visual baseline | EVIDENCE_STATE | YES for required pages | approved screenshot artifact | reviewer | only explicit baseline update |
| Original `copilot-knowledge` UI | reference | NO | external repo | migration analysis | NO |

强制规则：

```text
Knowledge business state MUST continue to come from existing Facade / IPC.
UI components MUST NOT create a parallel business state source.
Original copilot-knowledge UI MUST be treated only as semantic/reference input,
not as runtime source of truth.
```

---

# 7. Runtime State Machine

## 7.1 Standard list page

```text
LOADING
  ├─ success + items > 0 → CONTENT
  ├─ success + items = 0 → EMPTY
  ├─ capability unavailable → UNAVAILABLE
  └─ error → ERROR
```

## 7.2 Detail page

```text
LOADING
  ├─ entity found → CONTENT
  ├─ entity absent → NOT_FOUND
  ├─ capability unavailable → UNAVAILABLE
  └─ error → ERROR
```

## 7.3 Upload job

现有 Knowledge Job state machine保持不变；本 PRD仅替换 presentation。

## 7.4 Invariants

```text
INV-STATE-001 UI 重构前后同一 backend snapshot MUST 导出相同业务状态。
INV-STATE-002 UI component MUST NOT 将 ERROR 显示为 EMPTY。
INV-STATE-003 UNAVAILABLE MUST NOT 被视觉层自动转成可 mutation 状态。
INV-STATE-004 disabled mutation MUST 保持 disabled，不得因新 Button/Select wrapper 被绕过。
```

---

# 8. Data / Schema Contract

本 PRD默认：

```text
NO backend schema change.
NO Knowledge IPC semantic change.
NO persisted UI schema required.
```

Work UI props 必须：

```text
TypeScript strict typing
no implicit any
controlled/uncontrolled 语义明确
disabled 语义透传
aria-* 可透传
className 可扩展但不能改变组件业务语义
```

Knowledge component：

```text
MUST consume existing snapshot/entity/job types.
MUST NOT fabricate missing backend fields.
MAY derive presentation-only label/color/icon from existing enum/status.
```

---

# 9. Target Component Architecture

目标依赖只能单向：

```text
Knowledge Page
      ↓
Knowledge Domain Component
      ↓
Work Common Component
      ↓
Work UI Primitive
      ↓
Work Theme Tokens
```

禁止：

```text
Knowledge → Discover private CSS
Knowledge → Memory private CSS
Knowledge → Gateway private CSS
Knowledge entity → Settings private card / section
Work UI Primitive → Knowledge Domain
Knowledge → 重定义 .ui-*
Knowledge 产品控件 → 全局 .btn（Button 组件内部实现除外）
实现期未冻结 catalog 项
```

## 9.1 Work UI Primitive P0（冻结）

目标目录：

```text
apps/work/src/renderer/src/components/ui/
```

本 Release MUST（2026-09-16 Knowledge 七页盘点冻结）：

```text
Button.tsx
Input.tsx
Textarea.tsx
Select.tsx
Label.tsx
FormField.tsx
Checkbox.tsx
Badge.tsx
Card.tsx
Table.tsx
Tabs.tsx
SegmentedControl.tsx
Progress.tsx
```

本 Release MUST REUSE，禁止再造：

```text
AppModal（含 Confirm / KnowledgeEntityModal composition）
OrbLoader
FilePreviewRouter
existing Work theme CSS variables
```

本 Release MUST NOT 实现（盘点未出现；原文超集降为 SHOULD / 移出 Gate）：

```text
IconButton
Skeleton
Separator
Tooltip
Pagination
DropdownMenu
Switch
独立 Dialog primitive（用 AppModal）
```

复用原则：

```text
Confirm 行为 MUST compose existing AppModal.
Dialog primitive MUST NOT be duplicated merely to mimic source application.
Primitive CSS MUST 使用 .ui-*。MUST NOT 另起等价前缀。
Primitive MUST NOT 改写全局 .btn 对其它模块的语义。
```

## 9.2 Work Common P0（冻结）

目标目录：

```text
apps/work/src/renderer/src/components/common/
```

本 Release MUST：

```text
PageHeader.tsx
PageToolbar.tsx
SearchInput.tsx
FilterSelect.tsx
DataTable.tsx
EmptyState.tsx
StatusBadge.tsx
```

本 Release MUST NOT 把 Pagination 列为 REQUIRED。现有 BrandLogo / HermesLogo / ProfileAvatar 保持原 Owner，不纳入本冻结目录。

## 9.3 Knowledge Domain Components

目标目录：

```text
apps/work/src/renderer/src/screens/Knowledge/components/
```

至少：

```text
KnowledgePageHeader.tsx
KnowledgeStatusBadge.tsx
KnowledgeVisibilityBadge.tsx
KnowledgeBaseCard.tsx
KnowledgeBaseTable.tsx
KnowledgeSetCard.tsx
KnowledgeDocumentTable.tsx
KnowledgeFileJobCard.tsx
KnowledgeDangerZone.tsx
```

---

# 10. Requirements

## REQ-ARCH-001 — 建立单一 Work UI Component System

### Goal

建立 Work Design System 为全 Work 唯一 primitive Owner；Knowledge 是第一个消费者，不是 catalog Owner。

### Normative Requirement

```text
MUST 建立第 9.1 / 9.2 节冻结的 Work UI Primitive 与 Common。
MUST 使用 .ui-*。MUST NOT 使用其它 DS class 前缀。
MUST 使用 Work 现有 Theme/CSS variables；新 token 只保证 light/dark。
MUST NOT 原样复制 copilot-knowledge 的整套 shadcn UI 目录。
MUST NOT 引入第二套独立 theme provider。
MUST NOT 复制 source application 的 Sidebar/NavigationMenu。
MUST NOT 实现未冻结 catalog 项。
MUST NOT 改写全局 .btn 对其它模块的语义。
本 Release Gate 强制使用 Work DS 的生产代码仅：
  apps/work/src/renderer/src/screens/Knowledge/**
  以及本次新增的 components/ui/** 与冻结 Common 文件。
Discover / Memory / Gateway / Settings / 既有 common（BrandLogo 等）不在本 Gate。
其它 screens/* 新目录改用 DS = Roadmap，SKIPPED 不使本 Gate FAIL。
MAY 使用现有 Radix dependency 实现 accessibility primitive。
```

### Inputs

```text
existing Work theme
existing AppModal
existing CSS variables
original copilot-knowledge component semantics
```

### Preconditions

```text
PRE-ARCH-001 apps/work renderer 可编译。
PRE-ARCH-002 baseline commit 可 checkout。
```

### Ownership Scope

```text
DIRECTORY:
apps/work/src/renderer/src/components/ui/
```

### Allowed Side Effects

```text
ALLOW create/update Work UI primitive / common source files.
ALLOW add .ui-* CSS and light/dark-only tokens.
DENY rewriting global .btn semantics used by other features.
```

### Forbidden Side Effects

```text
DENY backend changes.
DENY Knowledge API changes.
DENY Desktop Sidebar replacement.
DENY source application runtime dependency.
```

### Failure Semantics

```text
F-ARCH-001:
trigger: primitive 引入导致 existing renderer compile/test failure
expected state: implementation MUST remain blocked
error code: WORK_UI_REGRESSION
rollback: revert offending primitive integration
retryable: YES
```

### Acceptance

```text
A-ARCH-001
A-ARCH-002
A-ARCH-003
```

---

## REQ-ARCH-002 — 禁止 Cross-feature CSS Borrowing

### Normative Requirement

Knowledge 生产代码（pages、features、domain components、`knowledge-page-chrome.tsx`、`KnowledgeModuleNav.tsx`、`KnowledgePages.tsx` host chrome）：

```text
MUST NOT 使用 discover-*。
MUST NOT 使用 memory-*。
MUST NOT 使用 gateway-*。
MUST NOT 使用 settings-card / settings-card-*。
MUST NOT 使用 settings-section / settings-section-*。
MUST NOT 使用 settings-field。
MUST NOT 重定义 .ui-*。
```

本要求是 **最终 Release Gate**，不是 chrome-only Phase 的中间 Gate。

允许例外：

```text
测试 fixture / 说明文字中的禁止字符串。
仅当 class 已移动并重定义为 Work common / .ui-*，且旧 feature 不再拥有该语义时允许。
Discover / Memory / Gateway / Settings 自己的生产 CSS 不在本扫描范围。
```

### Ownership Scope

```text
DIRECTORY:
apps/work/src/renderer/src/screens/Knowledge/
```

### Acceptance

```text
A-ARCH-004
```

---

## REQ-UI-001 — 重构 knowledge-page-chrome 为 Work UI Adapter

当前 `knowledge-page-chrome.tsx` MUST 从跨 feature CSS adapter 转换为 Work UI adapter。

映射：

```text
KnowledgeLoading      -> existing OrbLoader（MUST NOT 为 Loading 新增 Skeleton）
KnowledgeEmptyState   -> Work EmptyState
KnowledgeToolbar      -> Work PageToolbar
KnowledgeSearchInput  -> Work SearchInput
KnowledgeSectionTabs  -> Work Tabs
KnowledgeModuleNav    -> Work Tabs
KnowledgeEntityModal  -> existing AppModal composition
```

`knowledge-page-chrome.tsx` 与 `KnowledgeModuleNav.tsx` MAY 保留 Knowledge 语义 wrapper，但 MUST NOT 持有 Discover/Memory/Gateway/Settings 的 class dependency。

Acceptance:

```text
A-UI-001
```

---

## REQ-UI-HOME — Knowledge Home 重构

Home MUST：

```text
使用 Work PageHeader / Card / Badge / Button / EmptyState。
展示现有 facade 提供的指标与最近项；MUST NOT 伪造 snapshot 没有的字段。
MUST NOT 使用 settings-card / settings-section 作为主容器或 metric card。
保留现有 navigation 到 Bases / Documents / Uploads / Chat 的行为。
```

Acceptance:

```text
A-HOME-001
A-HOME-002
```

---

## REQ-UI-002 — Knowledge Bases List 产品化重构

Bases list MUST 包含：

```text
PageHeader
SearchInput
Visibility FilterSelect
Card/Table SegmentedControl
Create Base primary action
content area
Empty/Loading/Error/Unavailable state
```

### Card mode

`KnowledgeBaseCard` MUST：

```text
显示 name
显示 status
显示 visibility
提供明确 open action
使用 Work Card + Badge + Button
保持整卡可理解的视觉层级
仅使用 snapshot 中真实存在字段
```

如果 description/documentCount/chunkCount/owner/tags 不存在于当前 authoritative snapshot：

```text
MUST NOT 为还原 source UI 伪造字段。
MAY 在未来数据契约提供后扩展。
```

### Grid Contract

列数按 **Knowledge 内容夹具宽度** 计算。本 PRD visual 的 1440 / 2048 即该宽度（无 Desktop sidebar）。

```text
content/fixture width >= 1400px : 4 columns
1000px <= width < 1400 : 3 columns
640px <= width < 1000  : 2 columns
width < 640            : 1 column
```

在任意宽度：

```text
MUST NOT 超过 4 columns。
MUST NOT 出现水平滚动条。
Card content MUST NOT overflow card boundary。
```

### Toolbar Contract

```text
Search SHOULD 使用主要剩余空间。
Search min usable width: 280px。
Filter / segmented control / create action MUST NOT 被 Search 挤压到不可操作尺寸。
窄宽度 MUST 允许 toolbar wrap，而不是缩小到不可读。
```

Acceptance:

```text
A-BASE-001
A-BASE-002
A-BASE-003
A-BASE-004
```

---

## REQ-UI-003 — Knowledge Base Detail 重构

Base Detail MUST 使用 Work：

```text
PageHeader / back action
Tabs
FormField
Input
Textarea
Select
Badge
Button
AppModal confirm composition
Empty/Error/Loading
```

删除/危险动作：

```text
MUST 通过 AppModal confirm composition。
MUST 防止 submitting 时二次触发。
MUST NOT 改变现有 mutation API 语义。
```

Acceptance:

```text
A-BASE-DETAIL-001
A-BASE-DETAIL-002
```

---

## REQ-UI-004 — Knowledge Sets 重构

Sets list/detail MUST：

```text
使用 Work Card / Table / Tabs / FormField / Checkbox / Select / Button。
MUST NOT 使用未包装的产品级 checkbox/input/select/textarea/button。
MUST 保留当前 mock/provider capability gate 与 mutationsEnabled 语义。
MUST 保留绑定、weight、retrieval mode 的现有业务行为。
MUST NOT 把 Sets 从 mock/capability gate 升级为真实 CRUD。
```

Acceptance:

```text
A-SETS-001
A-SETS-002
```

---

## REQ-UI-005 — Knowledge Documents 重构

Documents list/detail MUST：

```text
使用 SearchInput / FilterSelect / DataTable / StatusBadge / Tabs。
文件预览 MUST 继续复用 FilePreviewRouter。
MUST NOT 创建 Knowledge 专用文件预览器。
MUST 保留 ManagedFile unavailable/error/ready 状态。
MUST 将 permission 明确呈现为 display-only when current contract is display-only。
```

Acceptance:

```text
A-DOCS-001
A-DOCS-002
```

---

## REQ-UI-006 — Knowledge Uploads 重构

Uploads MUST：

```text
使用 Work Select 选择 target base。
使用 Work Button 触发现有 file picker。
使用 Work Progress 展示 job.progress。
使用 KnowledgeFileJobCard 展示每个 job。
MUST 保留现有 FileJob snapshot / cancel / retry 行为。
MUST NOT 创建第二套 FileJob state。
MUST NOT 创建第二套 file picker。
```

Acceptance:

```text
A-UPLOAD-001
A-UPLOAD-002
```

---

## REQ-UI-007 — Knowledge Chat Presentation 重构

Knowledge Chat MUST 保持其现有 Knowledge session/facade 边界，不得导入 Work Chat / Skill Run runtime。

UI MUST：

```text
session rail 使用 Work list/button patterns。
thread 使用明确 user/assistant message presentation。
composer 使用 Work Textarea + Button。
citation rail 使用 Knowledge citation component。
长内容使用统一 scroll behavior。
new session modal 继续使用 AppModal。
```

MUST NOT：

```text
调用 Work Chat session API。
调用 Skill Run session API。
为了复用 UI 而改变 Knowledge Chat runtime ownership。
```

Acceptance:

```text
A-CHAT-001
A-CHAT-002
```

---

## REQ-UI-008 — Theme 与 Design Token Contract

```text
MUST 支持 Work light theme。
MUST 支持 Work dark theme。
MUST 使用 Work CSS variables。
Knowledge component MUST NOT hard-code 独立品牌色 palette。
如果新增通用 semantic token，MUST 至少定义 light/dark；其它 data-theme 本 Release 不验收。
MUST NOT 新增 Knowledge 专属 ThemeProvider。
MUST NOT 要求非 light/dark 主题视觉等价。
```

Acceptance:

```text
A-THEME-001
A-THEME-002
```

---

## REQ-UI-009 — Accessibility Contract

所有 Work UI P0：

```text
MUST 支持 keyboard focus。
MUST 为 icon-only button 提供 accessible name。
MUST 正确透传 disabled。
Dialog MUST 支持 Escape/focus containment，submitting lock 继续有效。
Tabs MUST 提供 tab semantics。
Form control MUST 可由 label 识别。
```

关键 Knowledge 页面：

```text
MUST 满足键盘可达（A-A11Y-001）。
SHOULD 在 automated accessibility scan 中无 critical / serious violation。
A-A11Y-002 不是 Release Gate。
```

Acceptance:

```text
A-A11Y-001 REQUIRED
A-A11Y-002 SHOULD
```

---

## REQ-UI-010 — Visual Regression Gate

REQUIRED Visual Baseline 仅（**card mode**，不是 table）：

```text
Knowledge Bases list content / card
Knowledge Base Detail content
```

REQUIRED viewport（Knowledge 内容夹具，无 Desktop shell）：

```text
1440
2048
```

REQUIRED theme：

```text
light
dark
```

冻结 runner / 命令 / 路径 / 阈值：

```text
runner: Playwright（apps/work 已有依赖），只渲 Knowledge 页面/组件树
MUST NOT 连接 Electron CDP
MUST NOT 调用 npm run test:live-visual

command (REQUIRED):
  cd apps/work
  npm run test:knowledge-ui-visual

package.json MUST 新增 script:
  "test:knowledge-ui-visual": "node scripts/knowledge-ui-visual.mjs"

baseline dir:
  apps/work/tests/visual/knowledge-ui/baselines/

output / diff dir:
  apps/work/tests/visual/knowledge-ui/output/

required files (exactly 8):
  bases-card-1440-light.png
  bases-card-1440-dark.png
  bases-card-2048-light.png
  bases-card-2048-dark.png
  base-detail-1440-light.png
  base-detail-1440-dark.png
  base-detail-2048-light.png
  base-detail-2048-dark.png

compare: pixelmatch
threshold (maxDiffPixelRatio): 0.01
MUST NOT 按页面放宽该值

update baselines:
  npm run test:knowledge-ui-visual -- --update-baselines
  默认跑测 MUST NOT 写 baseline
```

其它页 / 其它宽度 / empty / error / table mode 截图 = SHOULD。
真实 Desktop shell + 左侧导航截图 = SHOULD（§27）。

Acceptance:

```text
A-VIS-001
A-VIS-002
A-VIS-003
```

---

## REQ-MIGRATE-001 — 保持 Knowledge Business Contract

UI 重构期间：

```text
MUST 保持 useKnowledgeFacade 行为。
MUST 保持 typed IPC 行为。
MUST 保持 KnowledgeBaseSnapshot / KnowledgeJobSnapshot authoritative。
MUST 保持 loading/unavailable/empty/content/error/not-found 语义。
MUST 保持 mutation enabled/disabled gate。
MUST 保持 current Login/JWT ownership。
MUST 保持 File Platform ownership。
```

Acceptance:

```text
A-MIGRATE-001
A-MIGRATE-002
```

---

# 11. Side-Effect Contract

| Operation | DB Write | File Write | Network | Cache | User Data | Business Source |
|---|---:|---:|---:|---:|---:|---:|
| render Knowledge page | NO | NO | existing read only | NO | NO | NO |
| search/filter/view toggle | NO | NO | NO | NO | NO | NO |
| visual baseline capture | NO | test artifact only | NO | MAY | NO | NO |
| create/edit/delete base | existing behavior | NO | YES existing | MAY | existing | existing API |
| upload file | existing behavior | existing File Platform | YES existing | MAY | existing | existing API |
| cancel/retry job | existing behavior | NO | YES existing | MAY | existing | existing API |

规则：

```text
UI migration itself MUST introduce 0 new business-side mutation.
Visual test artifact write is test-only side effect.
Logging/telemetry MUST NOT be added as a hidden requirement by this PRD.
```

---

# 12. Ownership Contract

## 12.1 Ownership

```text
Work Design System:
  owner = apps/work/src/renderer/src/components/ui/
         + apps/work/src/renderer/src/components/common/
         + .ui-* namespace
         + light/dark-only new tokens

Knowledge Domain:
  owner = apps/work/src/renderer/src/screens/Knowledge/components/

Knowledge Page composition:
  owner = apps/work/src/renderer/src/screens/Knowledge/pages/
         + KnowledgeModuleNav + knowledge-page-chrome

Knowledge layout CSS:
  owner = screens/Knowledge layout classes (e.g. knowledge-card-grid)

Knowledge business state:
  owner = existing Knowledge IPC/Facade

File preview/picker:
  owner = existing Work File Platform

Legacy feature CSS / global .btn:
  owner = existing feature owners; out of scope this release
```

## 12.2 Migration Ownership Rule

```text
source copilot-knowledge UI = REFERENCE_ONLY
existing Work UI = AUTHORITATIVE_TARGET
```

如果 source component 与 Work component 冲突：

```text
PRESERVE Work architecture
PORT semantic behavior
DO NOT import second design system
```

---

# 13. Identity / Hash Contract

本需求没有业务对象 hash 变更。

Visual baseline identity MUST 至少由以下字段组成：

```text
page_id
viewport_width
viewport_height
theme
fixture_state
baseline_file
source_commit
```

Evidence 必须绑定 repository commit SHA。

---

# 14. Transaction Contract

本 PRD 不引入新的跨资源业务事务。

对于 Modal mutation：

```text
first click:
  existing mutation invoked at most once

while submitting:
  outside click / Escape / confirm re-click MUST NOT fire second mutation
```

如果 UI wrapper 导致 double submit：

```text
error: UI_DOUBLE_MUTATION
release gate: FAIL
```

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---|
| Work primitive 与 source shadcn 实现冲突 | review/import scan | Work wins | UI_SYSTEM_CONFLICT | 0 |
| Knowledge 借用其他 feature private class | static scan | BLOCK | CROSS_FEATURE_STYLE_DEPENDENCY | 0 |
| 改写全局 .btn 或 Knowledge 重定义 .ui-* | static/review | BLOCK | UI_SYSTEM_BOUNDARY | 0 |
| 实现期新增未冻结 primitive | catalog diff | BLOCK | DUPLICATE_UI_SYSTEM | 0 |
| 新 UI 与 backend snapshot 字段不匹配 | typecheck/test | BLOCK | UI_DATA_CONTRACT_MISMATCH | 0 |
| visual baseline 非显式更新 | CI diff | BLOCK | VISUAL_BASELINE_UNAPPROVED | 0 |
| duplicate UI system | import/dependency scan | BLOCK | DUPLICATE_UI_SYSTEM | 0 |

禁止：

```text
last writer wins
为了快速恢复页面直接复制整套 source UI
通过新增 !important 覆盖所有冲突
```

---

# 16. Compatibility / Migration

## 16.1 Existing State

旧实现：

```text
Knowledge 页面已存在。
业务路由已存在。
Facade / IPC 已存在。
部分真实 Bases/Uploads 链路已存在。
UI 依赖多个其他 feature CSS。
```

## 16.2 Migration Order

```text
1. implement frozen Work UI primitives + .ui-*
2. implement frozen Work common components
3. migrate knowledge-page-chrome + KnowledgeModuleNav
4. migrate Home
5. migrate Bases
6. migrate Base Detail
7. migrate Uploads
8. migrate Sets
9. migrate Documents
10. migrate Chat
11. final Knowledge forbidden-class scan == 0
12. Bases + Detail page/component screenshots (1440/2048, light/dark)
13. Work typecheck / guard / unit tests
```

## 16.3 Compatibility Rule

迁移必须允许按页面逐步提交。中间 commit 可以同时存在 Knowledge legacy/new presentation。

最终 Release Gate：

```text
Knowledge 生产代码 forbidden class count == 0
required page migration count == 7 domains
Work 其它模块允许继续使用私有 CSS 与全局 .btn
```

「不得留下混合 UI」仅指 Knowledge 生产代码，不是整个 Work renderer。

---

# 17. External Dependency Contract

| Dependency | Version Source | Use | Rule |
|---|---|---|---|
| React | apps/work/package.json | renderer | preserve |
| lucide-react | apps/work/package.json | icons | preserve |
| @radix-ui/react-dialog | apps/work/package.json | AppModal/dialog | reuse |
| react-hot-toast | apps/work/package.json | toast | reuse if needed |
| Playwright | apps/work/package.json | `npm run test:knowledge-ui-visual` only | REQUIRED for visual gate |
| Vitest | apps/work/package.json | unit/component test | reuse; MUST NOT 承担 8 张 REQUIRED 截图 |
| original copilot-knowledge | GitHub master reference | semantic reference | runtime MUST NOT depend |

Offline behavior：

```text
Work runtime MUST NOT require network access to copilot-knowledge repository.
```

---

# 18. Security Contract

## SEC-001 — Renderer data boundary

Threat:

```text
UI 重构绕过 typed IPC，直接在 renderer 增加 backend token / HTTP。
```

Control:

```text
MUST preserve existing renderer contract guards.
MUST pass check:no-renderer-runtime-http where applicable.
```

Acceptance:

```text
A-SEC-001
```

## SEC-002 — XSS / unsafe content

Threat:

```text
Knowledge text/content 被新组件以 unsafe HTML 渲染。
```

Control:

```text
MUST keep React escaped text as default.
MUST NOT introduce dangerouslySetInnerHTML unless existing sanitized renderer contract explicitly requires.
```

Acceptance:

```text
A-SEC-002
```

---

# 19. Observability

UI migration不新增业务 telemetry 要求。

Test/Evidence 阶段至少输出：

```text
operation_id
page_id
viewport
theme
fixture_state
test_status
screenshot_path
baseline_path
diff_result
commit_sha
timestamp
```

---

# 20. Acceptance Standard

## A-ARCH-001 — Work UI P0 Exists

Requirement Refs:

```text
REQ-ARCH-001
```

Given:

```text
baseline work/prd-v5.1
```

When:

```text
scan apps/work/src/renderer/src/components/ui/
```

Then:

```text
第 9.1 / 9.2 冻结 MUST 项全部存在。
未冻结项（Tooltip/Skeleton/Separator/IconButton/Pagination/DropdownMenu/Switch）
未作为 REQUIRED 实现，或仅以 SHOULD 存在且不挡 Gate。
```

Oracle:

```text
frozen MUST catalog coverage == 100%
unfrozen REQUIRED catalog count == 0
primitive/common 对外 class 前缀 == .ui-
其它 DS 前缀 count == 0
```

Evidence:

```text
inventory artifact
typecheck result
component tests
```

---

## A-ARCH-002 — No Second Theme System

Oracle:

```text
Knowledge runtime import of source app theme/components == 0
new Knowledge ThemeProvider == 0
```

---

## A-ARCH-003 — Existing Work Build Remains Green

Command:

```text
cd apps/work
npm run typecheck
npm run guard
npm test
```

Oracle:

```text
all exit_code == 0
```

---

## A-ARCH-004 — Cross-feature Style Dependency Removed

Scan scope:

```text
apps/work/src/renderer/src/screens/Knowledge/
```

Forbidden tokens（Knowledge 生产 TSX/CSS）：

```text
discover-
memory-
gateway-
settings-card
settings-card-
settings-section
settings-section-
settings-field
```

Oracle:

```text
forbidden Knowledge production dependency count == 0
scan includes KnowledgeModuleNav and knowledge-page-chrome
```

测试 fixture / 说明文字必须排除。本 AC 是最终 Gate，不是 chrome Phase 的中间 Gate。

---

## A-UI-001 — Knowledge Chrome Uses Work Components

Oracle:

```text
knowledge-page-chrome production implementation:
cross-feature class refs == 0
Work UI/Common imports > 0
```

---

## A-BASE-001 — Bases Toolbar Usable

Given:

```text
content state with >= 8 bases
```

When:

```text
open Bases at fixture widths 1440 and 2048 (REQUIRED visual)
component/layout tests MAY also cover 1024/1280
```

Then:

```text
search/filter/view/create visible
no control overlaps
no horizontal page scrollbar
```

Oracle:

```text
all target elements bounding boxes inside content viewport
horizontalOverflow == false
```

---

## A-BASE-002 — Bases Grid Column Contract

Oracle（宽度 = Knowledge 内容夹具，无 sidebar）：

```text
fixture/content >= 1400 → columns == 4
1000..1399              → columns == 3
640..999                → columns == 2
<640                    → columns == 1
columns never > 4
REQUIRED visual fixtures 1440 and 2048 MUST satisfy this oracle
```

---

## A-BASE-003 — Card Information Contract

Oracle for every card:

```text
name visible
status visible
visibility visible
open action reachable
card overflow == false
```

---

## A-BASE-004 — Card/Table Mode Functional

Given:

```text
same filtered dataset
```

When:

```text
toggle Card → Table → Card
```

Then:

```text
same entity id set displayed
view state changes only presentation
```

Oracle:

```text
sorted(entity_ids_card) == sorted(entity_ids_table)
network mutation count == 0
```

---

## A-HOME-001 — Home Uses Work Components

Oracle:

```text
Home production implementation:
settings-card / settings-section refs == 0
Work Card / Button usage present
```

---

## A-HOME-002 — Home Does Not Fabricate Metrics

Oracle:

```text
Home displayed metrics/recent items ⊆ facade/snapshot fields
fabricated business field count == 0
```

---

## A-BASE-DETAIL-001 — Standard Controls

Oracle:

```text
Base Detail 产品级 button/input/select/textarea/checkbox 裸用 count == 0
required Work component usage present
semantic HTML (h1/h2/p/section/ul) 允许
```

---

## A-BASE-DETAIL-002 — Destructive Action Protection

Oracle:

```text
delete confirmation required
double confirmation while submitting → mutation call count == 1
```

---

## A-SETS-001 — Sets Uses Unified UI

Oracle:

```text
产品级 checkbox/input/select/textarea/button 裸用 count == 0
semantic HTML 允许
Sets 仍受现有 mock/capability/mutationsEnabled gate 约束
```

---

## A-SETS-002 — Sets Behavior Preserved

Oracle:

```text
mutation disabled state before migration == after migration
binding selection result equivalent
retrieval mode result equivalent
```

---

## A-DOCS-001 — Documents Unified UI

Oracle:

```text
search/filter/table/tabs rendered with Work components
no horizontal overflow
```

---

## A-DOCS-002 — File Preview Ownership Preserved

Oracle:

```text
FilePreviewRouter remains preview owner
new Knowledge-specific preview implementation count == 0
```

---

## A-UPLOAD-001 — Work Progress and FileJob Card

Oracle:

```text
job.progress 0/50/100 maps to visible 0/50/100 progress
no manual business-progress state duplication
```

---

## A-UPLOAD-002 — Upload Behavior Preserved

Oracle:

```text
picker invokes existing files API
cancel invokes existing cancel path
retry invokes existing retry path
second FileJob store count == 0
```

---

## A-CHAT-001 — Knowledge Runtime Boundary Preserved

Oracle:

```text
Knowledge Chat import/call to Work Chat session API == 0
Knowledge Chat import/call to Skill Run session API == 0
```

---

## A-CHAT-002 — Chat Layout Usable

Oracle:

```text
session rail visible
thread visible
composer visible
citation rail visible on supported wide layout
narrow layout no horizontal overflow
```

---

## A-THEME-001 — Light Theme

Oracle:

```text
REQUIRED visual pages (Bases + Base Detail) PASS in light theme
other themes are Non-goal
```

---

## A-THEME-002 — Dark Theme

Oracle:

```text
REQUIRED visual pages (Bases + Base Detail) PASS in dark theme
other themes are Non-goal
```

---

## A-A11Y-001 — Keyboard

Oracle:

```text
all primary actions keyboard reachable
focus indicator visible
dialog close/confirm keyboard operable
```

---

## A-A11Y-002 — Automated Scan (SHOULD)

Oracle:

```text
IF executed: critical violations == 0 AND serious violations == 0
SKIPPED does not fail Release Gate
```

---

## A-VIS-001 — Required Page Baselines Exist

Oracle:

```text
required files in apps/work/tests/visual/knowledge-ui/baselines/ ==
  bases-card-{1440,2048}-{light,dark}.png
  base-detail-{1440,2048}-{light,dark}.png
count == 8
no Desktop shell
card mode only
```

---

## A-VIS-002 — No Unauthorized Baseline Rewrite

Oracle:

```text
npm run test:knowledge-ui-visual 失败时 baseline 文件不变
baseline 更新仅允许：
  npm run test:knowledge-ui-visual -- --update-baselines
  且必须有 review
```

---

## A-VIS-003 — Screenshot Regression

Oracle:

```text
cd apps/work && npm run test:knowledge-ui-visual
exit_code == 0
maxDiffPixelRatio <= 0.01 for each of the 8 files
```

Threshold 0.01 全矩阵共用，MUST NOT 按页面放宽。

---

## A-MIGRATE-001 — Business State Equivalent

Oracle:

```text
same fixtures/input:
pre-migration business state == post-migration business state
```

---

## A-MIGRATE-002 — Existing Work Guards Green

Command:

```text
npm run guard
npm run typecheck
npm test
```

Oracle:

```text
exit_code == 0
```

---

## A-SEC-001 — Renderer Contract

Command:

```text
npm run check:no-renderer-runtime-http
npm run check:work-renderer-contract
```

Oracle:

```text
exit_code == 0
```

---

## A-SEC-002 — Unsafe HTML

Oracle:

```text
new unsanitized dangerouslySetInnerHTML in Knowledge scope == 0
```

---

# 21. Acceptance Input Matrix

| Case | Data | Capability | Width | Theme | Gate | Expected |
|---|---|---|---:|---|---|---|
| 1 | 8+ bases | enabled | 2048 | light | REQUIRED visual | 4 columns |
| 2 | 8+ bases | enabled | 1440 | light | REQUIRED visual | 4 columns（1440>=1400） |
| 3 | 8+ bases | enabled | 2048 | dark | REQUIRED visual | 4 columns |
| 4 | detail content | enabled | 1440 | dark | REQUIRED visual | Work controls, no overflow |
| 5 | empty | enabled | n/a | n/a | REQUIRED component | Work EmptyState |
| 6 | content | unavailable | n/a | n/a | REQUIRED component | unavailable, mutation blocked |
| 7 | error | enabled | n/a | n/a | REQUIRED component | error, not EMPTY |
| 8 | long base name | enabled | 1440 | light | REQUIRED component | no card overflow |
| 9 | upload progress 0/100 | enabled | n/a | n/a | REQUIRED component | 0% / 100% |
| 10 | mutation disabled | disabled | n/a | n/a | REQUIRED component | controls disabled |
| 11 | detail missing | enabled | n/a | n/a | REQUIRED component | NOT_FOUND |
| 12 | keyboard-only | enabled | n/a | both | REQUIRED | primary actions operable |
| 13 | Home content | enabled | n/a | n/a | REQUIRED component | Work cards, no settings-card |
| 14 | 1024-wide bases | enabled | 1024 | light | SHOULD | 2/3 columns, no overflow |
| 15 | real Desktop shell | enabled | 1440 | light | SHOULD Golden | left nav visible |

---

# 22. Negative Acceptance

## NEG-001 — 禁止借用其他 Feature CSS

Given:

```text
Knowledge production scope
```

When:

```text
static scan
```

Then:

```text
发现 discover-/memory-/gateway-/settings-card/settings-card-/settings-section/settings-section-/settings-field
→ FAIL CROSS_FEATURE_STYLE_DEPENDENCY
```

## NEG-002 — 禁止第二套 Design System

```text
新增独立 Knowledge ThemeProvider
或直接复制完整 source ui + source theme
或实现期私自新增未冻结 primitive
或 primitive 使用非 .ui-* 的 DS 前缀
→ FAIL DUPLICATE_UI_SYSTEM
```

## NEG-006 — 禁止误伤 legacy CSS / 污染 .ui-*

```text
改写全局 .btn 对其它模块的语义
或在 screens/Knowledge 重定义 .ui-*
→ FAIL UI_SYSTEM_BOUNDARY
```

## NEG-003 — 禁止 UI 伪造业务字段

```text
snapshot 不提供字段但 UI hard-code/mock 为真实业务数据
→ FAIL UI_DATA_CONTRACT_MISMATCH
```

## NEG-004 — 禁止视觉通过但业务回归

```text
visual PASS + existing guard/test FAIL
→ Release Gate FAIL
```

## NEG-005 — 禁止 double mutation

```text
submitting 状态二次点击触发第二次 create/delete/update
→ FAIL UI_DOUBLE_MUTATION
```

---

# 23. Failure Injection

至少覆盖：

```text
FI-001 Base list API rejects
FI-002 Base create rejects
FI-003 Base delete rejects
FI-004 File picker returns 0 imported files
FI-005 Upload cancel rejects
FI-006 Upload retry rejects
FI-007 File preview API unavailable
FI-008 Knowledge capability unavailable
FI-009 dialog submitting + Escape/outside click
FI-010 visual snapshot mismatch
```

每个 failure：

```text
MUST 不导致页面 crash。
MUST 显示确定 error/unavailable 状态。
MUST 不把失败 mutation 显示为成功。
MUST 不产生额外重复 mutation。
```

---

# 24. Evidence Contract

每个 required Acceptance 的 Evidence 至少包含：

```json
{
  "acceptance_id": "A-BASE-002",
  "status": "PASS",
  "requirement_ids": ["REQ-UI-002"],
  "test_ids": ["TEST-A-BASE-002"],
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v5.1",
  "commit_sha": "<tested SHA>",
  "command": "<executed command>",
  "exit_code": 0,
  "oracle": {
    "type": "responsive_grid",
    "expected": "max 4 columns and breakpoint contract",
    "actual": "<machine result>"
  },
  "evidence_files": [
    "<screenshot-or-report>"
  ]
}
```

Evidence MUST NOT 仅写：

```text
PASS
looks good
manual verified
```

---

# 25. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Required Evidence | Release |
|---|---|---|---|---|
| REQ-ARCH-001 | Work DS catalog 冻结落地 | A-ARCH-001/002/003 | inventory + build/test | REQUIRED |
| REQ-ARCH-002 | Knowledge 无私有 CSS 借用 | A-ARCH-004 | static scan（最终 Gate） | REQUIRED |
| REQ-UI-001 | chrome + ModuleNav 用 Work UI | A-UI-001 | component/static test | REQUIRED |
| REQ-UI-HOME | Home 用 Work UI | A-HOME-001/002 | component/static test | REQUIRED |
| REQ-UI-002 | Bases 可用且 <=4列 | A-BASE-001/002/003/004 | component + required screenshots | REQUIRED |
| REQ-UI-003 | Detail 使用标准控件 | A-BASE-DETAIL-001/002 | component + mutation test | REQUIRED |
| REQ-UI-004 | Sets presentation 统一 UI | A-SETS-001/002 | component/behavior | REQUIRED |
| REQ-UI-005 | Documents 统一 UI | A-DOCS-001/002 | component/preview | REQUIRED |
| REQ-UI-006 | Upload 统一 UI | A-UPLOAD-001/002 | job/picker tests | REQUIRED |
| REQ-UI-007 | Chat ownership 不变 | A-CHAT-001/002 | boundary + component | REQUIRED |
| REQ-UI-008 | light/dark | A-THEME-001/002 | required screenshots | REQUIRED |
| REQ-UI-009 | keyboard a11y | A-A11Y-001 | keyboard evidence | REQUIRED |
| REQ-UI-009 scan | automated a11y | A-A11Y-002 | a11y report | SHOULD |
| REQ-UI-010 | 收缩 visual gate | A-VIS-001/002/003 | `npm run test:knowledge-ui-visual` + 8 png + 0.01 | REQUIRED |
| REQ-MIGRATE-001 | business state 不变 | A-MIGRATE-001/002 | regression tests | REQUIRED |
| REQ-SEC-001/002 | renderer/security | A-SEC-001/002 | guard/static scan | REQUIRED |

---

# 26. Release Gate

Release status：

```text
PASS
FAIL
SKIPPED
BLOCKED
```

规则：

```text
SKIPPED != PASS
BLOCKED != PASS
```

Release Gate MUST FAIL if：

```text
任何 REQUIRED Acceptance != PASS
Knowledge 生产代码仍有 forbidden class
任何 required Knowledge 页面未迁移
冻结 catalog 缺失或私自新增未冻结 REQUIRED primitive
npm run guard != 0
npm run typecheck != 0
npm test != 0
required page/component screenshots != PASS
```

A-A11Y-002 SKIPPED 与 §27 Golden SKIPPED **不得**使 Release Gate FAIL。

最低必跑：

```bash
cd apps/work
npm run typecheck
npm run guard
npm test
```

另加（Evidence 必须绑定 commit SHA）：

```bash
cd apps/work
npm run test:knowledge-ui-visual
```

MUST NOT 把 `npm run test:live-visual` 列为最低必跑。

---

# 27. Golden Consumer / Real-world Acceptance

本节为 **SHOULD**，不能替代 §26 的页面/组件截图 REQUIRED Gate。

```text
repository: loudon84/smc-copilot
branch: work/prd-v5.1
baseline HEAD: d32efcfce049e7f8e92edc3393939baa7cd989cf
application: apps/work Desktop
```

SHOULD 包含：

```text
真实 Work Desktop shell
真实左侧 navigation
Knowledge 独立页面
至少一个真实 Bases content state
light/dark 之一
```

SKIPPED Golden **不得**使 Release Gate FAIL。

---

# 28. Plan Generation Contract

只有：

```text
status = APPROVED_FOR_PLAN
```

才允许正式生成执行 `.plan.md`。

Plan 前必须检查：

```text
[x] P0 primitive 列表已按盘点冻结
[x] Work Design System Owner 已确认
[x] Knowledge 七页为第一消费者已确认
[x] cross-feature forbidden list 已确认（仅 Knowledge）
[x] 列数契约按内容夹具宽度已确认
[x] visual 命令 / 8 文件 / threshold 0.01 已冻结
[x] AppModal / FilePreview / OrbLoader reuse 已确认
[x] business API non-change 已确认
[x] .ui-* 为唯一 DS 前缀
[x] 本 Gate 新模块范围已收窄到 Knowledge + 本次 ui/common
[x] Product/Architecture 独立评审（v1.1.1 APPROVE_FOR_PLAN）
[x] 无 TBD / 待确认 / 视情况
```

Plan Todo 必须包含：

```yaml
id:
requirement_refs:
acceptance_refs:
files_or_symbols:
implementation_goal:
preconditions:
side_effect_scope:
failure_cases:
verification:
status:
evidence:
```

---

# 29. Recommended Implementation Phases

> 本节是 PRD 的依赖顺序，不替代 `.plan.md`。

## Phase 1 — Work UI Foundation

```text
Work UI primitives P0
Work common components P0
component tests
theme tests
```

Gate：

```text
A-ARCH-001
A-ARCH-002
A-ARCH-003
```

## Phase 2 — Knowledge Chrome

```text
knowledge-page-chrome
KnowledgeModuleNav
```

Gate：

```text
A-UI-001
```

A-ARCH-004 不得作为本 Phase Gate（其它页此时仍有 forbidden class）。

## Phase 3 — Home + Bases + Base Detail

Gate：

```text
A-HOME-001..002
A-BASE-001..004
A-BASE-DETAIL-001..002
```

## Phase 4 — Uploads

Gate：

```text
A-UPLOAD-001..002
```

## Phase 5 — Sets + Documents

Gate：

```text
A-SETS-001..002
A-DOCS-001..002
```

## Phase 6 — Chat

Gate：

```text
A-CHAT-001..002
```

## Phase 7 — Final Knowledge CSS 清零 + 收缩 Visual + Regression

Gate：

```text
A-ARCH-004
A-THEME-001..002
A-A11Y-001
A-VIS-001..003
A-MIGRATE-001..002
A-SEC-001..002
```

A-A11Y-002 与 §27 Golden 不进本 Phase REQUIRED Gate。

---

# 30. Code Review Contract

Review 必须按如下顺序：

```text
1. 是否只落地冻结 catalog，有无私自新增 primitive
2. 是否使用 .ui-* 且未改写全局 .btn
3. Knowledge 是否仍借用 feature 私有 CSS（含 ModuleNav）
4. Knowledge business contract 是否改变
5. File/AppModal/OrbLoader 是否被重复实现
6. Bases 夹具 1440/2048 列数是否满足
7. 产品级裸控件是否已收敛
8. 新 token 是否只保证 light/dark
9. error/unavailable/disabled 是否保持
10. 键盘 a11y 是否满足（自动化 scan 非必须）
11. 无 shell 截图是否真实执行且未自动刷 baseline
12. Evidence 是否绑定 tested SHA
13. 最后才审查一般代码质量
```

---

# 31. PRD Quality Gate

Architecture：

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 完整
[x] Owner 不重叠
[x] System Boundary 明确
```

State：

```text
[x] 业务状态 SOT 明确
[x] Presentation state 与业务 state 分离
[x] 页面 load state 明确
```

Semantics：

```text
[x] target component hierarchy 明确
[x] forbidden CSS dependency 明确
[x] responsive behavior 明确
[x] source UI 与 target Work UI 关系明确
```

Side Effects：

```text
[x] UI migration 不新增 business mutation
[x] existing mutation ownership 保留
```

Failure：

```text
[x] double mutation 定义
[x] unavailable/error 定义
[x] visual mismatch 定义
```

Acceptance：

```text
[x] 每个 MUST 有 AC
[x] MUST NOT 有 Negative AC
[x] high-risk page 有 viewport/input matrix
[x] Oracle 可机器判断
```

Evidence：

```text
[x] Evidence 绑定 repo/branch/commit
[x] BLOCKED/SKIPPED 不算 PASS
```

Plan Readiness：

```text
[x] Product/Architecture Review
[x] status 升级为 APPROVED_FOR_PLAN
```

---

# 32. Definition of Done

以下全部满足才算本需求完成：

```text
[ ] 冻结 Work UI Primitive MUST 完成
[ ] 冻结 Work Common MUST 完成
[ ] Knowledge Domain Components 完成
[ ] knowledge-page-chrome 与 ModuleNav 不再依赖 feature 私有 CSS
[ ] Home / Bases / Detail / Sets / Documents / Uploads / Chat 完成统一 UI
[ ] Knowledge 生产 forbidden class == 0
[ ] Bases 夹具 1440/2048 列数契约通过
[ ] 产品级裸 button/input/select/checkbox/textarea == 0
[ ] light/dark required screenshots 通过
[ ] keyboard a11y 通过
[ ] existing Knowledge business tests 通过
[ ] Work guard / typecheck / tests 通过
[ ] required Evidence 完整
[ ] Release Gate = PASS
```

下列 **不是** DoD：

```text
自动化 a11y scan
真实 Desktop Golden
非 light/dark 主题
未冻结 primitive
Discover/Memory/Settings 迁移
test:live-visual
```

---

# 33. 关键实施原则

```text
1. Production Owner 是 Work Design System；Knowledge 是第一消费者。
2. 迁移的是组件语义，不是原样复制 copilot-knowledge / shadcn。
3. 只实现冻结 catalog；遗漏先改 PRD。
4. 新样式走 .ui-*；不改写全局 .btn；Knowledge 不重定义 .ui-*。
5. 仅 Knowledge 清零 feature 私有 CSS；其它模块 Legacy 共存。
6. 业务状态继续由现有 Facade / IPC 提供。
7. File Preview / Picker / AppModal / OrbLoader 继续复用。
8. Sets / Chat 只换 presentation，不升真实 CRUD。
9. Visual REQUIRED 是无 shell 的 Bases+Detail × 1440/2048 × light/dark。
10. “能显示”不等于“实现完成”。
```

