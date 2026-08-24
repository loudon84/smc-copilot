---
name: smc-prd-grounding
description: 将外部或 ChatGPT 生成的功能方案 PRD 与 SMC Copilot 当前源码、已有能力和有效合同进行校准；识别重复建设、已有能力复用、缺失需求和错误实现落点，并产出可独立审查的 PRD-DRAFT。
version: 2.0.0
disable-model-invocation: true
---

# SMC PRD Grounding

## 目标

本 Skill 用于处理尚未经过当前项目源码校准的功能方案 PRD，尤其是 ChatGPT、外部方案或人工需求分析生成的 PRD。

核心目标不是重新设计一套方案，而是先回答：

1. PRD 中提出的能力，当前项目是否已经存在？
2. 已存在能力是否可以直接复用？
3. PRD 是否重复创建了已有模块、Owner、Parser、Store、Service、IPC、API 或生命周期？
4. 已存在但能力不足时，应该 MODIFY 现有 Owner，还是确实需要 REPLACE / ADD？
5. PRD 是否遗漏了实现该目标必需的合同、状态、异常、并发、安全、测试或运维约束？
6. 最终方案是否收敛为一个 Capability 一个 Production Owner？

Grounding 的产物必须是基于当前项目事实修订后的 `PRD-DRAFT`，而不是脱离源码的理想架构设计。

---

## 一、输入

输入通常包括：

- 待校准的功能方案 PRD；
- 用户明确的业务目标和范围；
- 当前 repository / branch；
- 已知的外部系统或合同依赖。

将输入 PRD 视为“待验证方案”，不得默认其中描述的当前状态、缺失能力、文件位置或目标实现方式为事实。

---

## 二、Repository Routing

开始前：

1. 阅读仓库根目录 `AGENTS.md`。
2. 根据需求定位受影响 subsystem。
3. 只读取受影响 subsystem 的 `AGENTS.md`。
4. 遵守 subsystem 中定义的 `lat search`、`lat expand`、ADR、contract 等项目规则。
5. 不为了“完整性”扫描整个 monorepo。
6. 不读取无关 archived PRD、build output、runtime data 或 reference implementation。

只扩大读取范围到能够证明当前 Capability、调用链和边界所需要的程度。

---

## 三、建立 Evidence Baseline

开始修改 PRD 前，记录本轮 Grounding 使用的事实基线。

至少确认：

### Project Baseline

- repository
- branch
- 当前 checkout / commit（能够取得时）
- affected subsystem

### Contract Baseline

如果涉及内部或外部 API / IPC / Event / MCP / Schema 合同，必须区分：

- `Current Consumer Contract`
  - 当前 SMC Copilot 源码实际消费的版本；
- `Latest Published Contract`
  - Provider 已正式发布并可以被 Consumer 锁定的最新版本；
- `Target Contract`
  - 本 PRD 明确计划实施后消费的版本。

禁止把 Provider `main` 中尚未完成发布或锁定的合同自动当作 Target Contract。

禁止因为发现更新版本，就静默把 PRD 从当前合同升级到最新合同。

如果 Target Contract 尚未正式发布、无法锁定或存在外部未决条件：

- PRD 保持 `DRAFT`；
- 明确记录 External Gate；
- 可以描述候选合同带来的目标变化；
- 不得把候选合同描述为已经冻结的生产事实。

---

## 四、先拆 Capability，再读实现

将输入 PRD 拆成独立 Capability。

每个 Capability 至少识别：

- 业务目标；
- 输入；
- 输出；
- 当前假定 Owner；
- 主要状态；
- 主要执行入口；
- 是否跨进程 / 跨服务 / 跨仓库；
- 是否改变已有合同或生命周期。

不要直接按照 PRD 给出的“新增文件列表”开始找代码。

先确认 Capability，再确定实现位置。

---

## 五、Current Capability Inventory

在提出目标实现前，必须先建立当前能力清单。

每个 Capability 至少记录：

| Capability | Existing Owner | Entry Point | Current Behaviour | Existing Tests | Grounding Result |
|---|---|---|---|---|---|

`Grounding Result` 只能使用：

- `EXISTS`：当前能力已完整存在，可直接复用；
- `PARTIAL`：已有 Owner，但能力不足，需要修改；
- `MISSING`：确认当前没有对应生产能力；
- `CONFLICT`：当前实现与目标合同或目标行为冲突；
- `UNKNOWN`：证据不足，不能确认。

### 判断规则

#### EXISTS

如果现有实现已经满足 PRD 目标：

- 不得创建新的平行实现；
- 在目标 PRD 中标为 `KEEP`；
- 删除原 PRD 中对应的重复新增建议。

#### PARTIAL

如果已有 Owner，但缺少部分能力：

优先：

`MODIFY existing owner`

不得因为实现方便直接：

`ADD another owner`

#### MISSING

只有在确认：

- 无现有 Owner；
- 无等价能力；
- 无适合扩展的现有 Owner；

之后才允许 `ADD`。

#### CONFLICT

如果目标要求替换现有能力：

必须使用：

`REPLACE + REMOVE`

不能使用：

`ADD new implementation + keep old implementation indefinitely`

---

## 六、重复建设检查

对输入 PRD 中每个新增建议检查是否重复以下生产能力：

- Service
- Client
- Controller
- Store
- State owner
- Parser / Serializer
- Adapter
- IPC bridge
- HTTP client
- API endpoint
- Event lifecycle
- Queue
- Cache
- Retry
- Authentication / Authorization
- Routing
- Configuration owner
- Contract DTO
- UI lifecycle owner

发现已有实现时，必须指出：

1. 当前 Owner；
2. PRD 原建议；
3. 是否重复；
4. 应改为 KEEP / MODIFY / REPLACE / REMOVE 中哪一种；
5. 为什么不能再新增第二套实现。

---

## 七、执行入口闭环

对于涉及以下能力的需求：

- 调用权限；
- availability；
- permission；
- approval；
- destructive operation；
- routing；
- validation；
- retry；
- security；
- 状态门禁；

不能只检查主 Happy Path。

必须列出所有能够触发该 Capability 的生产入口，例如：

```text
Chat Submit
→ ...

Retry
→ ...

Resume / Rehydrate
→ ...

Background execution
→ ...
```

并确认最终约束在哪一个 Owner 强制执行。

如果同一个业务约束只存在于 UI，但其他入口可以绕过 UI，则视为缺失项。

---

## 八、State / Invariant Inventory

当需求包含多个容易混淆的状态或 Capability 时，必须建立状态/不变量清单。

例如：

| State / Invariant | Meaning | Owner | Effect |
|---|---|---|---|
| Gateway Health | Gateway 是否可达 | Controller | 只表示服务健康 |
| Item Status | Expert / Skill 是否可用 | Contract / Parser | 决定 Item readiness |
| Call Enabled | 是否允许调用 | Contract / Execution | false 时禁止调用 |
| Approval | 是否需要人工审批 | Execution | 禁止静默执行 |

禁止将不同 Capability 压缩到一个 enum，然后用同一个状态承担多个业务语义。

---

## 九、补充输入 PRD 的缺失项

Grounding 不只是删除重复建议，还必须补齐实现目标真正需要、但原 PRD 缺失的内容。

仅检查与本次需求相关的项目，包括：

### Contract

- API / IPC / Event / MCP / DTO 是否有明确 Owner；
- 当前合同版本；
- 目标合同版本；
- Consumer 是否需要 pin / migration；
- Runtime validation；
- 非法数据处理。

### Lifecycle

- mount / unmount；
- login / logout；
- profile / identity change；
- refresh；
- retry；
- cancel；
- cache invalidation；
- stale request。

### Concurrency

当存在异步加载、切换、刷新或重试：

- latest-wins；
- revision / generation；
- abort；
- stale result discard。

### Security

当跨 Renderer / Main / Service：

- sender；
- authentication；
- authorization；
- token / URL ownership；
- Renderer 是否能够绕过受信边界。

### Failure Behaviour

至少确认本需求相关的：

- network failure；
- invalid response；
- unauthorized；
- dependency unavailable；
- stale state；
- partial state。

### Test Evidence

确认：

- 当前测试能够证明什么；
- 当前测试不能证明什么；
- 新目标需要哪一级测试：
  - parser；
  - unit；
  - integration；
  - real handler；
  - routing；
  - regression；
  - operational verification。

禁止为了形式完整而把与当前需求无关的治理项全部塞进 PRD。

---

## 十、Target End-State Inventory

完成 Current Capability Inventory 后才能定义目标状态。

格式：

| Capability | Production Owner | Allowed Implementations | Target Responsibility |
|---|---|---:|---|

规则：

1. 每个 Capability 只能有一个 Production Owner。
2. `Allowed Implementations` 默认必须为 `1`。
3. 新 Owner 必须证明现有 Owner 无法承担该职责。
4. UI、Main、Backend、Contract 的职责必须明确分界。
5. 不允许通过新增 wrapper、helper、adapter 隐式形成第二 Owner。

---

## 十一、Change Classification

所有受影响项必须分类为：

- `KEEP`
- `MODIFY`
- `ADD`
- `REPLACE`
- `REMOVE`

不得使用模糊描述代替变更分类。

### KEEP

现有能力已经满足目标，不改变职责。

### MODIFY

保留现有 Owner，在原 Owner 内增加或调整能力。

### ADD

确认不存在等价 Owner 后新增能力。

### REPLACE

新的实现取得原 Capability 的 Production Ownership。

每个 `REPLACE` 必须同时定义：

- 被替换实现；
- 新 Owner；
- 切换条件；
- 对应 `REMOVE`；
- removal condition。

### REMOVE

明确删除旧生产路径、旧 Owner、旧 fallback 或旧入口。

---

## 十二、Compatibility

只有存在真实 Current Consumer 时才允许：

- compat；
- adapter；
- fallback；
- alias；
- legacy path。

必须写明：

- Current Consumer；
- Reason；
- Removal Condition；
- Removal Version。

禁止为了“保险”保留无限期 legacy。

历史错误行为只能保留在：

- tests；
- fixtures；
- golden input；
- golden output。

不得保留在生产代码作为 fallback。

---

## 十三、PRD 内部一致性

提交 Grounding 结果前必须检查：

- Contract version 前后一致；
- enum 前后一致；
- breakpoint / timeout / retry count 等数字一致；
- Source Anchor 与 Change Classification 一致；
- Behaviour Contract 与 Acceptance Criteria 一致；
- Current Inventory 与 Target Inventory 一致；
- REPLACE 与 REMOVE 一一对应；
- Capability Owner 没有重复；
- 测试覆盖目标 Behaviour，而不是只验证 helper；
- Scope 与文件变更范围一致。

---

## 十四、Grounding 输出

Grounding 必须明确输出以下结果。

### Grounding Summary

至少包含：

- `复用现有能力`
- `删除重复建议`
- `修改现有能力`
- `新增能力`
- `替换 / 删除`
- `补充的缺失项`
- `未决外部依赖`

### Source Anchors

记录支持当前状态判断的关键源码、测试、合同和 ADR。

### Current Capability Inventory

必须位于目标方案之前。

### Target End-State Inventory

明确最终 Owner。

### Change Classification

明确 KEEP / MODIFY / ADD / REPLACE / REMOVE。

### Acceptance Criteria

必须从 Target Behaviour 推导，不能与 Behaviour Contract 冲突。

---

## 十五、禁止事项

Grounding 禁止：

- 按输入 PRD 的新增文件列表机械实施；
- 默认相信 PRD 描述的“当前系统没有该能力”；
- 为了完整性扫描整个 monorepo；
- 因为发现新版本合同就静默升级 Target Contract；
- 将 Provider `main` 自动视为已发布合同；
- 新增第二个 Production Owner；
- 用 ADD 掩盖实际 REPLACE；
- 保留没有 Current Consumer 的兼容层；
- 把历史 Bug 继续留在生产 fallback；
- 将 Renderer 方便性置于已有受信边界之上；
- 在 Grounding 阶段将 PRD 标记为 APPROVED。

---

## Exit

Grounding 完成时：

1. 输入方案中的重复建设已经被删除或改为 KEEP / MODIFY；
2. 当前已有能力与缺失能力有源码证据；
3. 必要缺失项已经补入 PRD；
4. 所有 Capability 有明确目标 Owner；
5. 所有变更已分类；
6. 外部合同基线及未决 Gate 已明确；
7. Behaviour 与 Acceptance Criteria 一致；
8. PRD 状态只能是：
   - `DRAFT`
   - `REVIEW_REQUIRED`

不得在本 Skill 中设置：

`APPROVED`
