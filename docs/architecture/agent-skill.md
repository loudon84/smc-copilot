# PRD-Agent-Skills-v1.0 — SMC Copilot Agent Engineering Workflow & PRD Governance

**文档类型**：工程解决方案 PRD
**目标仓库**：`loudon84/smc-copilot`
**目标分支**：`opsi/prd-2.0`
**上游能力来源**：`addyosmani/agent-skills`
**上游基线版本**：`0.6.7`
**锁定 Commit**：`df1edb2e05487d0aa6d93c747141e0aed1187f25`
**状态**：Implementation Ready
**实施工具**：Codex → Cursor

---

# 1. 目标

在 `smc-copilot` 中建立统一的 Agent Engineering Workflow，使当前：

```text
ChatGPT Solution Draft
        ↓
Codex PRD
        ↓
Cursor Plan
        ↓
Cursor Implementation
```

升级为：

```text
ChatGPT Solution Draft
        ↓
Codex Codebase Grounding
        ↓
PRD-DRAFT
        ↓
PRD Architecture Review
        ↓
PRD Convergence
        ↓
PRD-APPROVED
        ↓
Cursor Plan
        ↓
Plan Architecture Review
        ↓
PLAN-APPROVED
        ↓
Cursor Implementation
        ↓
Test / Review / Simplification
        ↓
Staged Review
        ↓
Commit
```

本版本重点解决：

1. PRD 未充分理解现有源码即定义新实现。
2. `ADD / REPLACE / REMOVE` 不明确导致新旧实现长期并存。
3. Test 为满足 PRD 而反向固化重复架构。
4. Codex、Cursor 各使用自己的 Prompt，工程方法不一致。
5. Skill 重复维护导致 Codex/Cursor Workflow 漂移。
6. PRD Created 被错误等同于 PRD Approved。

---

# 2. 当前仓库基础

`smc-copilot` 已经具备较好的 Agent Governance 基础，不重新建设第二套体系。

根目录已有 `AGENTS.md`，负责按 Desktop、Work、Runtime、OPSI、Contract 等领域路由 Agent，并明确跨项目修改必须先检查 Contract。

仓库已经存在：

```text
.agents/skills/
.cursor/skills/
.cursor/rules/
.cursor/plans/
.cursor/review/
.codex/agents/
```

`.agents/skills` 当前已有 `review-staged`，而 `.cursor/skills` 已经存在对应 Skill 目录结构。

现有 `review-staged` 已经实现：

```text
active plan
→ staged diff
→ tests
→ independent code reviewer
→ PASS / BLOCK
→ commit gate
```

因此后续不得重新创建第二套 Pre-Commit Review Skill。

同时 `.codex/agents/code-review.toml` 已经定义独立只读 Code Reviewer，并以 `PASS/BLOCK` 作为最终结果。

Cursor 现有 `plan-codegen-minimal.mdc` 也已经明确要求：

* 先追踪真实调用链；
* 共享根因只修一次；
* 复用现有实现优先；
* 默认不新增生产文件、依赖、公共接口或抽象；
* 禁止无意义的 adapter/factory/compatibility 层。

因此本 PRD 的原则是：

> **在现有治理基础上补齐 PRD Review 与 Plan Governance，而不是再建设一套平行 Workflow。**

---

# 3. 上游 `agent-skills` 定位

`addyosmani/agent-skills` 当前提供完整：

```text
DEFINE
→ PLAN
→ BUILD
→ VERIFY
→ REVIEW
→ SHIP
```

工程生命周期，并包含 Spec、Planning、TDD、Review、Simplification、Migration、CI/CD 等 Skills。

其中：

* `spec-driven-development`：Spec → Plan → Tasks → Implement，并要求阶段性人工 Gate。
* `planning-and-task-breakdown`：要求 Planning 阶段只读源码、分析依赖、再拆任务。
* `doubt-driven-development`：要求 fresh-context adversarial review，而不是自我验证。
* `code-simplification`：明确处理重复逻辑、dead code、无价值 wrapper 和过度抽象。
* `deprecation-and-migration`：明确 replacement 完成后必须迁移 consumer 并删除旧代码。

上游同时原生支持 Codex Plugin，并提供 Cursor `.cursor/skills/` 集成方式。

---

# 4. 集成原则

## 4.1 不全量导入 24 Skills

`smc-copilot` 属于已有大型工程，不采用 Big Bang。

上游自身对于成熟代码库也要求：

```text
incremental
verification-first
```

而不是一次性启用完整 Lifecycle。

---

## 4.2 一个 Skill 只有一个 SOT

定义：

```text
.agents/skills/
=
SMC 项目 Skill Canonical Source
```

Cursor 使用：

```text
.cursor/skills/
=
Generated Mirror
```

禁止：

```text
人工修改 .agents/skills/A
同时人工修改 .cursor/skills/A
```

所有修改只能发生在：

```text
.agents/skills/
```

然后通过同步工具生成 Cursor Mirror。

---

## 4.3 Upstream Skill 不直接修改

上游 Skill：

```text
UPSTREAM
```

SMC 特有规则：

```text
CUSTOM
```

必须分离。

禁止修改：

```text
spec-driven-development/SKILL.md
```

硬塞入大量 SMC 专有逻辑。

SMC 逻辑放：

```text
smc-prd-grounding
smc-prd-review
smc-prd-converge
smc-plan-from-approved-prd
```

---

# 5. 目标目录

```text
smc-copilot/
│
├── AGENTS.md
│
├── .agents/
│   ├── skills/
│   │   │
│   │   ├── using-agent-skills/
│   │   ├── context-engineering/
│   │   ├── spec-driven-development/
│   │   ├── planning-and-task-breakdown/
│   │   ├── source-driven-development/
│   │   ├── doubt-driven-development/
│   │   ├── incremental-implementation/
│   │   ├── test-driven-development/
│   │   ├── code-review-and-quality/
│   │   ├── code-simplification/
│   │   ├── deprecation-and-migration/
│   │   ├── ci-cd-and-automation/
│   │   │
│   │   ├── review-staged/              # existing
│   │   │
│   │   ├── smc-prd-grounding/
│   │   ├── smc-prd-review/
│   │   ├── smc-prd-converge/
│   │   └── smc-plan-from-approved-prd/
│   │
│   └── references/
│       ├── definition-of-done.md
│       ├── architecture-convergence.md
│       ├── prd-contract.md
│       └── upstream/...
│
├── .cursor/
│   ├── skills/                          # generated mirror
│   ├── references/                      # generated mirror
│   ├── rules/
│   │   ├── agent-workflow-governance.mdc
│   │   └── ... existing rules
│   ├── plans/
│   └── review/
│
├── .codex/
│   └── agents/
│       ├── code-review.toml             # existing
│       └── prd-review.toml
│
├── tools/
│   └── agent-skills/
│       ├── upstream.lock.yaml
│       ├── sync_agent_skills.py
│       ├── validate_agent_skills.py
│       ├── validate_prd.py
│       └── validate_plan.py
│
├── third_party/
│   └── agent-skills/
│       ├── LICENSE
│       └── NOTICE.md
│
└── docs/
    └── engineering/
        ├── agent-development-workflow.md
        └── prd-template.md
```

---

# 6. Upstream Lock

不得执行：

```text
每次 npx skills add latest
```

直接覆盖项目。

增加：

```yaml
# tools/agent-skills/upstream.lock.yaml

schema: smc.agent-skills.lock.v1

source:
  repository: addyosmani/agent-skills
  version: 0.6.7
  commit: df1edb2e05487d0aa6d93c747141e0aed1187f25

skills:
  - using-agent-skills
  - context-engineering
  - spec-driven-development
  - planning-and-task-breakdown
  - source-driven-development
  - doubt-driven-development
  - incremental-implementation
  - test-driven-development
  - code-review-and-quality
  - code-simplification
  - deprecation-and-migration
  - ci-cd-and-automation
```

当前上游基线 Commit 对应 Plugin `0.6.7`。

---

# 7. Upstream License

`agent-skills` 当前为 MIT License，允许复制、修改和再分发，但需要保留版权和许可声明。

因此同步工具必须同时维护：

```text
third_party/agent-skills/LICENSE
third_party/agent-skills/NOTICE.md
```

---

# 8. Shared References 必须同步

上游明确提示：

> 单独安装一个 Skill 可能不会复制 repo-level `references/`，导致 Skill 中引用的共享 checklist 丢失。

因此不能只复制：

```text
skills/<name>/SKILL.md
```

必须同步：

```text
agent-skills/references/
        ↓
.agents/references/upstream/
```

同步到 Cursor 时：

```text
.agents/references/
        ↓
.cursor/references/
```

必要时同步工具对 upstream Skill 中：

```text
../../references/xxx.md
```

进行路径映射校验。

---

# 9. `sync_agent_skills.py`

新增：

```text
tools/agent-skills/sync_agent_skills.py
```

职责仅包括：

```text
Read lock
→ checkout exact upstream commit
→ copy selected skills
→ copy required references
→ preserve smc-* custom skills
→ preserve review-staged
→ generate Cursor mirror
→ verify frontmatter
→ verify links
```

禁止：

```text
自动改写 upstream SKILL 内容
```

---

# 10. Sync 模式

支持：

```bash
python tools/agent-skills/sync_agent_skills.py \
  --source-dir ../agent-skills \
  --check
```

以及：

```bash
python tools/agent-skills/sync_agent_skills.py \
  --source-dir ../agent-skills \
  --apply
```

`--check`：

```text
只检测 drift
不得写文件
```

`--apply`：

```text
同步 upstream
生成 Cursor mirror
```

---

# 11. Custom Skill：`smc-prd-grounding`

职责：

```text
Solution Draft
+
真实源码
+
AGENTS routing
+
Architecture/Contracts
+
Current tests
        ↓
Codebase-grounded PRD-DRAFT
```

执行前必须读取：

```text
AGENTS.md
```

再根据路由读取对应：

```text
apps/*/AGENTS.md
ADR
contracts
architecture docs
```

不得为了“完整”扫描整个 monorepo。

---

# 12. `smc-prd-grounding` 强制 Current-State Inventory

PRD 生成前必须形成：

```markdown
## Current Capability Inventory

| Capability | Existing Owner | Existing Entry Point | Current Tests |
|---|---|---|---|
```

禁止没有 Existing Owner 调查就创建：

```text
xxx_v2
xxx_new
xxx_adapter
xxx_compat
```

---

# 13. PRD Change Classification

所有变更必须属于：

```text
KEEP
MODIFY
ADD
REPLACE
REMOVE
```

禁止模糊动作：

```text
优化
升级
兼容
增强
调整
```

而没有说明最终代码状态。

---

# 14. Target End-State Inventory

每份非平凡 PRD 强制：

```markdown
## Target End-State Inventory

| Capability | Production Owner | Allowed Implementations |
|---|---|---:|
| YAML serialization | PyYAML | 1 |
| Managed Config Merge | managed_config_apply.py | 1 |
```

核心不变式：

```text
One Capability
=
One Production Owner
```

---

# 15. Replacement / Removal Matrix

PRD 出现：

```text
REPLACE
```

时必须同时存在：

```markdown
## Replacement / Removal Matrix

| Existing | Action | Replacement | Removal Condition |
|---|---|---|---|
```

否则 PRD：

```text
BLOCKED
```

---

# 16. Compatibility Contract

任何：

```text
legacy
compat
adapter
fallback
alias
```

必须声明：

```text
Current Consumer
Reason
Removal Condition
Removal Version
```

没有真实 Consumer：

```text
禁止增加 compatibility layer
```

---

# 17. Regression Rule

历史 Bug 只能通过：

```text
fixture
golden input
golden output
```

保存。

禁止为了证明 RED 在 production module 中增加：

```text
_pre_vXXX()
_legacy_bug()
_old_impl()
```

这种历史错误实现。

---

# 18. Custom Skill：`smc-prd-review`

输入：

```text
PRD-DRAFT
+
Current source anchors
+
Architecture contract
```

输出：

```text
PASS
REVISE
BLOCKED
```

该 Skill：

```text
READ ONLY
```

不得直接改 PRD。

---

# 19. PRD Review Dimensions

固定检查：

```text
Existing Capability
Ownership
ADD vs REPLACE
Removal completeness
Compatibility lifetime
Parallel implementations
Test architecture
New-file necessity
Scope expansion
Architecture boundary
Operational verification
```

---

# 20. Fresh-Context Review

`smc-prd-review` 使用 upstream：

```text
doubt-driven-development
```

方法进行 adversarial review。

该 Skill 本身强调 fresh-context reviewer 应主动寻找：

```text
unstated assumptions
hidden coupling
contract violation
failure modes
```

而不是确认作者方案正确。

---

# 21. 新增 Codex PRD Reviewer

新增：

```text
.codex/agents/prd-review.toml
```

定位：

```text
Independent Architecture / PRD Reviewer
Read Only
```

输入：

```text
PRD
Current-state inventory
Relevant architecture contracts
Relevant source anchors
```

不得输入原作者推理过程。

最终只能：

```text
PASS
REVISE
BLOCK
```

---

# 22. `smc-prd-converge`

该 Skill 负责：

```text
PRD-DRAFT
+
Review Findings
+
Human Decisions
        ↓
PRD-APPROVED
```

必须删除：

```text
被否决方案
探索过程
临时 hotfix
旧错误算法
非最终 architecture
```

最终 PRD 只表达：

```text
最终状态
迁移方式
Acceptance
```

---

# 23. PRD Status

PRD frontmatter：

```yaml
---
work_item_id: OPSI-216
version: v2.1.6
status: DRAFT
target_branch: opsi/prd-2.0
review_verdict:
approved_at:
---
```

允许：

```text
DRAFT
REVIEW_REQUIRED
APPROVED
SUPERSEDED
```

---

# 24. Plan Gate

Cursor 不得从：

```text
status: DRAFT
```

生成实施计划。

只有：

```text
status: APPROVED
```

才能运行：

```text
smc-plan-from-approved-prd
```

---

# 25. Custom Skill：`smc-plan-from-approved-prd`

优先复用 upstream：

```text
planning-and-task-breakdown
```

其原有流程已经要求 Planning 阶段只读代码并分析 dependency graph。

SMC 在此基础增加：

```text
Change Matrix
Removal Matrix
File Budget
New File Justification
Architecture Gate
```

---

# 26. `.plan.md` 强制 Change Matrix

每份 Plan：

```markdown
## Change Matrix

| File / Symbol | Action | Existing Owner | Target State |
|---|---|---|---|
| simple_yaml.py | REMOVE | legacy writer | PyYAML only |
```

---

# 27. 新文件约束

如果 Plan 新增生产文件：

```text
New File Justification
```

必须回答：

```text
为什么已有 Owner 不能承担该能力？
```

回答不了：

```text
禁止 ADD FILE
```

这与现有 `plan-codegen-minimal.mdc` 的最小新增原则保持一致。

---

# 28. Architecture Convergence 不新增第五个 Skill

本版本**不创建**：

```text
smc-architecture-convergence
```

避免 Skill 本身继续膨胀。

将 Architecture Convergence 作为共享 Reference：

```text
.agents/references/architecture-convergence.md
```

由：

```text
smc-prd-review
smc-plan-from-approved-prd
review-staged
```

共同读取。

---

# 29. Architecture Convergence Checklist

固定：

```text
[ ] 一个 Capability 只有一个 Production Owner
[ ] REPLACE 对应 REMOVE
[ ] 无无期限 Legacy
[ ] 无无实际 Consumer 的 Compat
[ ] 无 test-only implementation 进入 production
[ ] 无 duplicate parser
[ ] 无 duplicate serializer
[ ] 无 duplicate adapter
[ ] 无 duplicate lifecycle owner
[ ] 新文件均有明确必要性
```

---

# 30. 不创建第二个 Code Review

现有：

```text
review-staged
+
.codex/agents/code-review.toml
```

继续作为 Commit Gate。

不得新增：

```text
smc-final-code-review
smc-precommit-review-v2
```

因为现有实现已经覆盖该 Capability。

---

# 31. Cursor Routing Rule

新增：

```text
.cursor/rules/agent-workflow-governance.mdc
```

保持极短，只定义状态机：

```text
Non-trivial change:
PRD APPROVED
→ PLAN APPROVED
→ IMPLEMENT
→ review-staged
→ COMMIT

Never implement directly from PRD-DRAFT.

One capability must have one production owner.

REPLACE requires REMOVE unless a bounded compatibility contract exists.

Historical bug implementations belong under tests/fixtures, never production.
```

不要复制完整 Skill 内容到 Rule。

上游 Cursor 指南同样明确：

```text
Rules = short policies
Skills = full workflows
```

并反对把完整 Skill 粘进 Rules。

---

# 32. AGENTS.md 修改

现有 Repository Routing 保留。

只追加：

```text
For non-trivial feature / architecture changes:

1. Ground requirements against current source.
2. Produce PRD-DRAFT.
3. Run PRD review.
4. Implementation planning requires PRD status APPROVED.
5. Cursor implementation requires approved .plan.md.
6. Existing repository routing and subsystem AGENTS.md remain authoritative.
```

不得把所有 Skill 工作流塞进 `AGENTS.md`。

---

# 33. Skill Validator

新增：

```text
tools/agent-skills/validate_agent_skills.py
```

校验：

```text
SKILL.md exists
frontmatter valid
name == directory
description exists
references resolvable
upstream skills match locked commit
custom skills not overwritten
.cursor mirror == .agents canonical source
```

---

# 34. PRD Validator

新增：

```text
validate_prd.py
```

最低验证：

```text
status
work_item_id
Current Capability Inventory
Target End-State Inventory
Change Classification
Replacement / Removal Matrix when REPLACE exists
Acceptance Criteria
```

---

# 35. Plan Validator

新增：

```text
validate_plan.py
```

检查：

```text
linked PRD exists
PRD status == APPROVED
Change Matrix exists
REPLACE has REMOVE
New files have justification
plan doesn't introduce parallel capability owner
```

---

# 36. CI Gate

新增：

```text
agent-governance
```

CI Job：

```text
validate skills
        ↓
validate upstream lock
        ↓
validate Cursor mirror
        ↓
validate active PRDs
        ↓
validate plans
```

失败例如：

```text
AGENT_SKILL_DRIFT
PRD_NOT_APPROVED
PRD_REPLACEMENT_WITHOUT_REMOVAL
PLAN_PARALLEL_IMPLEMENTATION
CURSOR_SKILL_MIRROR_DRIFT
```

---

# 37. Upstream Upgrade

升级 upstream 不直接：

```text
git pull
→ overwrite
```

正式流程：

```text
new upstream commit
        ↓
review CHANGELOG/diff
        ↓
update lock
        ↓
sync --apply
        ↓
validate
        ↓
review changed SKILL behavior
        ↓
commit
```

---

# 38. Codex Plugin 的定位

开发者本机可以安装 upstream Codex Plugin：

```bash
codex plugin marketplace add addyosmani/agent-skills
codex plugin add agent-skills@agent-skills
```

这是 upstream 官方支持方式。

但：

```text
Codex global plugin
```

不能成为项目可重复执行的唯一依赖。

项目实际 Governance 以仓库中锁定的：

```text
.agents/skills
upstream.lock.yaml
```

为准。

---

# 39. 实施阶段

## Phase 1 — Skill Foundation

实现：

```text
upstream.lock.yaml
sync_agent_skills.py
validate_agent_skills.py
selected upstream skills
shared references
Cursor mirror
MIT license
```

---

## Phase 2 — PRD Governance

实现：

```text
smc-prd-grounding
smc-prd-review
smc-prd-converge
prd-review.toml
prd-contract.md
architecture-convergence.md
```

---

## Phase 3 — Plan Governance

实现：

```text
smc-plan-from-approved-prd
validate_prd.py
validate_plan.py
agent-workflow-governance.mdc
```

并与现有：

```text
plan-codegen-minimal.mdc
```

组合，而不是替换。

---

## Phase 4 — Existing Review Integration

让现有：

```text
review-staged
```

额外读取：

```text
architecture-convergence.md
```

但不改变其：

```text
staged diff
independent review
PASS/BLOCK
```

主契约。

---

## Phase 5 — CI

加入：

```text
agent-governance
```

但第一阶段只作为：

```text
required check for governance files
```

不要阻断所有历史 PRD。

只检查：

```text
新创建/修改的 PRD
新创建/修改的 Plan
Skill tree
```

避免一次性要求历史文件全部迁移。

---

# 40. 测试矩阵

| ID         | 场景                           | 预期    |
| ---------- | ---------------------------- | ----- |
| SKILL-001  | upstream skill 缺 SKILL.md    | FAIL  |
| SKILL-002  | frontmatter name 错误          | FAIL  |
| SKILL-003  | shared reference 缺失          | FAIL  |
| SKILL-004  | Cursor mirror 漂移             | FAIL  |
| PRD-001    | DRAFT → Cursor Plan          | BLOCK |
| PRD-002    | REPLACE 无 REMOVE             | BLOCK |
| PRD-003    | 新 Compat 无 Consumer          | BLOCK |
| PRD-004    | 一个 Capability 两 Owner        | BLOCK |
| PRD-005    | 历史 Bug 函数进入 production       | BLOCK |
| PLAN-001   | Approved PRD → Plan          | PASS  |
| PLAN-002   | 新文件无 justification           | BLOCK |
| PLAN-003   | Plan 与 PRD Removal Matrix 冲突 | BLOCK |
| REVIEW-001 | staged diff 无 active plan    | BLOCK |
| REVIEW-002 | code review HIGH finding     | BLOCK |

---

# 41. Definition of Done

本 PRD 完成必须满足：

1. `.agents/skills` 成为项目级 Skill SOT。
2. `.cursor/skills` 只能由同步工具生成。
3. Upstream 固定到明确版本和 Commit。
4. 只引入选定 Skill，不全量加载。
5. Shared references 完整同步。
6. MIT License 正确保留。
7. `smc-prd-grounding` 可生成 codebase-grounded PRD。
8. PRD 强制 Current Capability Inventory。
9. PRD 强制 Target End-State Inventory。
10. 所有 Change 都分类为 KEEP/MODIFY/ADD/REPLACE/REMOVE。
11. REPLACE 必须绑定 REMOVE。
12. Compat 必须有 Consumer 与退出条件。
13. 历史 Bug 不得作为 production function 保存。
14. PRD Review 与 PRD Authoring 分离。
15. `PRD-DRAFT` 不允许进入 Plan。
16. `PRD-APPROVED` 才允许 Cursor Plan。
17. `.plan.md` 必须包含 Change Matrix。
18. 新文件必须说明 Existing Owner 为什么不能承担。
19. Architecture Convergence 使用共享 Reference，不新增重复 Skill。
20. 现有 `review-staged` 继续作为唯一 Pre-Commit Gate。
21. 现有 Codex `code-review` 继续作为 Code Review Owner。
22. CI 能检测 Skill Mirror drift。
23. CI 能检测 PRD/Plan Governance violation。
24. 不要求一次性迁移所有历史 PRD。
25. 新流程能够完整执行：

```text
Solution
→ PRD Draft
→ PRD Review
→ PRD Approved
→ Plan
→ Plan Approved
→ Code
→ Review
→ Commit
```
