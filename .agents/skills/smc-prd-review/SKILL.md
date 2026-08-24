---
name: smc-prd-review
description: 独立审查经过 Grounding 的 SMC Copilot PRD-DRAFT，验证其当前状态、复用判断、Capability Owner、合同基线、替换关系、执行入口、测试和 Acceptance Criteria 是否真实、完整且可实施。
version: 2.1.0
disable-model-invocation: true
---

# SMC PRD Review

## 目标

本 Skill 是 `smc-prd-grounding` 之后的独立 PRD 审查门禁。

它不负责重新设计 PRD，也不负责修改 PRD。

核心目标是独立验证：

1. Grounding 对当前系统已有能力的判断是否正确；
2. PRD 是否仍存在重复建设；
3. ADD / MODIFY / REPLACE / REMOVE 是否分类正确；
4. 一个 Capability 是否只有一个 Production Owner；
5. 所有生产执行入口是否满足同一业务约束；
6. 合同、状态、并发、安全和测试是否足以支撑目标行为；
7. Behaviour Contract 与 Acceptance Criteria 是否一致；
8. 是否存在阻止 PRD 进入 Converge 的外部证据或人工决策。

---

## 一、Review Independence

Review 必须保持只读。

不得：

- 修改 PRD；
- 替作者补写方案后再给 PASS；
- 直接接受 PRD 中的 Current Capability Inventory 为事实；
- 使用作者生成 PRD 时的私有推理作为证据。

Reviewer 应独立读取：

- PRD-DRAFT；
- Repository `AGENTS.md`；
- 受影响 subsystem `AGENTS.md`；
- PRD 声明的关键 Source Anchors；
- 相关直接 caller / entry point；
- 受影响 contracts / ADRs；
- 当前 tests。

如果可以使用独立上下文 Reviewer，应优先使用。

如果当前环境无法形成独立上下文，可以执行本 Skill，但不得宣称结果来自 fresh-context reviewer。

---

## 二、Evidence Precedence

发生冲突时，证据优先级如下：

1. 当前 checkout 的生产源码；
2. 当前生产测试所证明的行为；
3. 当前 Consumer 已锁定合同；
4. 正式发布且可验证的目标合同；
5. ADR / architecture reference；
6. 当前 PRD；
7. 历史 PRD、说明文档、评论和推断。

任何较低优先级材料不得覆盖较高优先级生产事实。

---

## 三、External Contract Scope Boundary

### 3.1 Review 的职责

外部合同只用于验证当前 PRD **实际消费的接口和语义**，例如：

- endpoint 是否存在；
- request / response shape；
- MCP / IPC / Event 字段；
- identity；
- 状态语义；
- reject / fallback / permission 规则。

Reviewer **不是外部 Provider 的 Release Auditor**。

除非当前 PRD 明确包含 Provider 发布、CI、部署、负载验收或合同发布流水线，否则不得把以下事项作为当前 Work PRD 的 `BLOCKED` 原因：

- Provider `main` 的发布流程状态；
- Provider manifest 的生成时元数据；
- `manifest.tagTargetCommit == null`；
- Provider 内部 CI / release job；
- Provider deploy 状态；
- 与当前 PRD 功能无关的 `loadGate`、benchmark、release checklist；
- Provider 是否把 peeled tag SHA 回写进自身 manifest。

这些信息可以作为背景证据，但不得扩张为 SMC Copilot PRD 的治理门禁。

### 3.2 Contract 三层

如果 PRD 涉及合同版本变化，区分：

- `Current Consumer Contract`：当前 SMC Copilot 源码实际消费的版本；
- `Target Contract`：本 PRD 实施后计划消费的明确版本；
- `Provider Development Head`：Provider 当前 `main`，仅用于背景比较，不能自动替代 Target Contract。

不要求每次 Review 都寻找 `Latest Published Contract`。只有 PRD 自己声明“升级到最新版”时才验证最新版。

### 3.3 Target Contract 是否可用于 Review

Target Contract 视为可用于 Consumer PRD Review，只要满足：

1. PRD 指定明确版本或不可变 ref；
2. 该 tag / commit ref 可以实际解析；
3. 本 PRD 依赖的合同产物可以从该 ref 读取；
4. 合同语义足以定义本 PRD 的目标行为。

**禁止使用 Provider manifest 中 `tagTargetCommit` 是否为 `null` 来判断 tag 是否存在。**

如果 Release Contract 明确规定 tag SHA 通过：

```bash
git rev-parse <tag>^{commit}
```

等外部方式解析，则必须按该发布规则理解。不能要求 manifest 自包含打 tag 后的自身 commit SHA。

### 3.4 Consumer 尚未升级不是 BLOCKED

如果当前 Consumer 仍在旧合同，而本 PRD 的目标之一就是迁移到 Target Contract，那么：

`Consumer 尚未锁定 Target Contract`

属于 **待实施变更**，不是外部阻塞。

Reviewer 应检查 PRD 是否把以下内容归入 `MODIFY` / Acceptance Criteria：

- Consumer contract version；
- consumer lock / immutable ref；
- DTO / parser；
- runtime validation；
- 与新合同相关的调用约束。

如果这些内容缺失：`REVISE`。

不得仅因为“当前还没升级”判定 `BLOCKED`。

### 3.5 只有什么情况下合同问题才是 BLOCKED

仅当以下条件之一成立，并且无法通过修改当前 SMC Copilot PRD 本身解决时，才允许 `BLOCKED`：

- Target Contract 的 tag / commit ref 无法解析；
- 本 PRD 必需的 endpoint / field / semantics 在稳定合同中不存在；
- 权威合同产物对同一语义互相冲突，无法确定 SOT；
- Provider 尚未定义本 PRD 必需的行为，Consumer 无法安全实现；
- 用户明确规定必须等 Provider 完成某个外部门禁后才能实施，且该门禁确实未完成。

如果 Target Contract 已可解析，只是当前 PRD 没写清迁移、pin 或 parser 规则：`REVISE`。

## 四、Current Capability Verification

对 PRD 中所有重要 Capability 独立抽查其 Current Inventory。

重点验证：

- Existing Owner 是否真实；
- Entry Point 是否完整；
- 当前 Behaviour 是否与源码一致；
- Existing Tests 是否真正覆盖该行为；
- `EXISTS / PARTIAL / MISSING / CONFLICT` 判断是否正确。

特别检查：

### False MISSING

PRD 声称能力不存在，但项目已有实现。

结果通常意味着重复建设。

### False EXISTS

PRD 声称已有能力可以复用，但现有实现实际上不满足目标约束。

### False MODIFY

实际上已经改变 Production Owner，应分类为 REPLACE。

### False ADD

新增实现与当前 Owner 重复。

---

## 五、Architecture Convergence

使用：

[`../../references/architecture-convergence.md`](../../references/architecture-convergence.md)

至少检查：

- 一个 Capability 只有一个 Production Owner；
- REPLACE 有对应 REMOVE；
- 无无限期 Legacy；
- Compatibility 有真实 Consumer 和移除条件；
- 历史 Bug 只存在于 tests / fixtures；
- 无重复 parser；
- 无重复 serializer；
- 无重复 adapter；
- 无重复 lifecycle owner；
- 新生产文件有明确必要性。

---

## 六、Execution Entry-Point Closure

对于涉及：

- authorization；
- permission；
- callEnabled；
- approval；
- availability；
- routing；
- validation；
- retry；
- destructive operation；
- security gate；

必须独立检查所有生产执行入口。

不能只验证 Chat Submit 或主 Happy Path。

例如：

```text
Submit
Retry
Resume
Rehydrate
Background operation
Direct IPC/API entry
```

检查：

1. 是否都经过同一个最终 enforcement owner；
2. 是否存在绕过 UI gate 的第二调用路径；
3. Retry 是否重新验证当前仍成立的业务约束；
4. Server / Main 是否有必要的最终防线。

如果 PRD 只封住一个入口而其他生产入口可绕过：

`REVISE`。

---

## 七、State / Invariant Review

检查 PRD 是否把不同业务状态错误合并。

重点检查：

- health ≠ callable；
- reachable ≠ authorized；
- selected ≠ ready；
- ready ≠ callEnabled；
- callEnabled ≠ approval granted；
- UI state ≠ backend authoritative state。

每个影响行为的状态必须有：

- 明确定义；
- 唯一 Owner；
- 明确消费者；
- 明确对调用行为的影响。

如果一个 enum 同时承担多个独立 Capability，并导致错误放行或错误展示：

`REVISE`。

---

## 八、Internal Consistency Review

逐项检查 PRD 内部一致性。

### Version

- frontmatter；
- 正文；
- Source Anchors；
- Contract section；
- Acceptance Criteria。

版本必须一致。

### Enum / State

同一业务状态不得在不同章节出现不同定义。

### Numeric Contract

例如：

- breakpoint；
- timeout；
- retry count；
- TTL；
- queue limit；
- concurrency。

Behaviour 和 AC 必须一致。

### Ownership

Current Inventory、Target Inventory、Change Classification 中 Owner 必须一致。

### Behaviour → Acceptance Criteria

每个关键 Behaviour 必须有可验证 AC。

AC 不得引入 Behaviour Contract 中没有定义的新要求。

---

## 九、Test Architecture Review

Review 不能只检查“有没有测试文件”。

必须检查测试是否真正证明目标行为。

例如：

- 需要验证真实 IPC handler 时，不能只复制 validator helper；
- 需要验证 parser reject 时，不能只测 TypeScript type；
- 需要验证 routing 时，必须证明错误路径没有调用另一 backend；
- 需要验证 concurrency 时，必须有 stale result / latest-wins case；
- 需要验证 security boundary 时，必须从真实边界入口触发。

历史 Bug 应转化为 regression fixture / test，而不是生产 fallback。

---

## 十、Scope Review

检查 PRD 是否存在：

### Scope Expansion

为了完成小功能而引入：

- 新 framework；
- 新 store；
- 新 service；
- 新 generic abstraction；
- 新 protocol；
- 新 cross-app dependency；

但当前 Owner 已可承担。

此类情况应优先 `REVISE`。

### Scope Omission

PRD 声称某生产路径 KEEP，但目标合同实际上要求它修改。

此类情况同样 `REVISE`。

---

## 十一、Finding 格式

每个实质 Finding 必须包含：

### Finding

具体问题。

### Evidence

支持该判断的：

- source；
- test；
- contract；
- ADR；
- PRD section。

### Violated Rule / Invariant

违反的合同、Owner 原则或业务不变量。

### Impact

如果不修改，会产生什么实际错误。

### Required Correction

说明 PRD 必须补充或调整什么。

不要直接编写实现代码。

---

## 十二、Verdict

必须且只能返回：

- `PASS`
- `REVISE`
- `BLOCKED`

### BLOCKED

仅用于同时满足以下三项的条件：

1. 属于当前 PRD Scope；
2. 真实阻止目标 Capability 实施；
3. 无法通过修改当前 SMC Copilot PRD 本身解决。

例如：

- 本 PRD 必需的外部合同语义尚不存在；
- 必需的稳定 tag / commit ref 无法解析；
- 两个权威来源冲突，无法确认 SOT；
- 必需的人类产品 / 架构决策尚未完成。

以下情况本身不得判 `BLOCKED`：

- Consumer 尚未实施 Target Contract；
- Provider manifest 中 `tagTargetCommit == null`；
- Provider 的 release / CI / deploy 元数据不完整，但 Target Contract 已可由稳定 ref 解析；
- 与当前 PRD Capability 无关的 Provider load gate。

如果同时存在真正的 BLOCKED 和普通 PRD 缺陷，最终 Verdict 仍为 `BLOCKED`，并同时列出需要修订的 PRD 问题。

### REVISE

所有必要权威证据已经存在，但 PRD 本身存在可修正问题，例如：

- 当前能力判断错误；
- 重复建设；
- ADD / REPLACE 分类错误；
- Owner 重复；
- 合同版本写错；
- parser / runtime validation 缺失；
- 执行入口未闭合；
- 状态定义错误；
- 测试不足；
- Behaviour 与 AC 冲突。

### PASS

只有以下条件全部满足才能 PASS：

- 无 BLOCKED 条件；
- Current Capability 判断有证据；
- 无重复 Production Owner；
- 变更分类正确；
- 所有 REPLACE 有 REMOVE；
- 外部合同基线明确；
- 执行入口闭合；
- 状态和不变量清晰；
- Test architecture 足够证明目标行为；
- Behaviour 与 AC 一致；
- 无未解决的实质 Finding。

### Verdict Precedence

严格使用：

```text
BLOCKED > REVISE > PASS
```

不得因为 PRD 同时存在可修订问题而把 BLOCKED 降级为 REVISE。

---

## 十三、输出格式

输出必须按以下顺序。

# PRD Review

**Verdict：PASS | REVISE | BLOCKED**

## Baseline

- Project / Branch
- Current Consumer Contract（仅涉及合同变化时）
- Target Contract（仅涉及合同变化时）
- Evidence limitations

## Blocking Findings

仅列出导致 BLOCKED 的问题。

无则写：

`无。`

## Required Revisions

列出导致 REVISE 的实质问题。

无则写：

`无。`

## Architecture Convergence

逐项报告与本 PRD 有关的：

- Capability Owner；
- ADD / REPLACE；
- REMOVE；
- Compatibility；
- duplicate implementation；
- execution entry points；
- test architecture。

## Review Conclusion

只说明：

- 为什么得到当前 Verdict；
- 下一步是修改 PRD、补外部证据，还是可以进入 `smc-prd-converge`。

---

## 十四、External Scope Guard

当 Review 的 Required Correction 开始要求修改以下外部内容时：

- Provider release pipeline；
- Provider manifest；
- Provider tag generation；
- Provider CI；
- Provider deployment；

必须先检查这些内容是否属于当前 PRD Scope。

如果不属于，停止扩张，不得形成 Blocking Finding。

Review 应返回到当前 SMC Copilot Consumer 侧，判断真正需要修改的是：

- Consumer version / lock；
- parser / DTO；
- execution guard；
- test；
- acceptance criteria。

## 十五、禁止事项

Review 禁止：

- 审计与当前 PRD 无关的 Provider release / manifest / CI / deploy；
- 把 `manifest.tagTargetCommit == null` 单独解释为 tag 未发布；
- 把“Consumer 尚未实施 Target Contract”解释成外部 BLOCKED；
- 修改 PRD；
- 为作者补完方案后直接 PASS；
- 信任 PRD 的 Current Inventory 而不验证；
- 因 Provider `main` 更新而自动切换 Target Contract；
- 用 historical PRD 覆盖当前源码；
- 因为 lint / validator 通过就判 PASS；
- 将 UI gate 当作所有执行路径的充分保护；
- 把 reviewer 猜测当成事实；
- 默认调用或要求 `doubt-driven-development`；
- 默认要求 Gemini、Codex 或其他跨模型第二意见。

跨模型审查只在用户明确要求时执行，它不是本 Skill 的 PASS 前置条件。

---

## Exit

Review 完成时：

- PRD 未被修改；
- 每个实质 Finding 有证据；
- Verdict 使用确定性优先级；
- `PASS` 才允许进入 `smc-prd-converge`；
- `REVISE` 返回 Grounding / PRD 修订；
- `BLOCKED` 等待外部证据或人工决策，同时保留已发现的 PRD 修订项。
