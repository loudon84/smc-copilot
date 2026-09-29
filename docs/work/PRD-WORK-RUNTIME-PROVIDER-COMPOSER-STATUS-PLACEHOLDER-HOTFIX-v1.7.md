---
title: "smc-copilot Runtime Provider Composer Status Placeholder Hotfix v1.7"
subtitle: "ACTIVE 不再显示企业就绪文案；NOT_READY/ERROR 时企业不可用提示挪进输入框占位符"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-COMPOSER-STATUS-PLACEHOLDER-HOTFIX-V1.7"
version: "1.7"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "06f10901"
external_contract_repository: "loudon84/nodeskclaw"
external_contract_branch: "main"
external_contract_commit: "7abb73e90e163f85257208ac4aa58e4914d2da6e"
owner: "Work Platform / Runtime Provider"
reviewers: ["Product", "Architecture", "Renderer", "QA"]
created_at: "2026-09-29"
updated_at: "2026-09-29"
target_release: "Runtime Provider Composer Status Placeholder Hotfix v1.7"
change_type: ["HOTFIX", "BROWNFIELD_CHANGE"]
golden_consumer: "smc-copilot apps/work local mode Chat Composer"
related_docs:
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.2-CLOSURE-RECONCILE.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-OPERATIONS-DIAGNOSTICS-v1.4.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-SESSION-RESTORE-BOOTSTRAP-HOTFIX-v1.6.md"
supersedes: null
---

# 0. PRD 使用原则

本文件是 Runtime Provider 主链的 **hotfix delta**。它不改 Bootstrap 合同、不改公开状态机、不改发送门与设置锁。它只改 Chat Composer 的**呈现**：企业同步结果在哪里显示、以什么形式显示。

## 0.1 Delta Priority

```text
§0.4 Grilling 决定 HF-G-01～HF-G-02
  >
本 PRD HF-D-01～HF-D-08
  >
v1.6 §0.5 Composer 与企业同步分离
  >
当前源码行为
```

未被本文修改的 v1.0～v1.6 语义继续有效。`NOT_READY` 时本地 Composer 继续可用（v1.6 §0.5），本 delta 不改变这一点。

## 0.2 Status

```text
status = APPROVED_FOR_PLAN
grilling = CLOSED 2026-09-29（§0.4 两项用户已确认）
review = 2026-09-29 独立评审 REVISE → 已修订：HF-D-03 内嵌规范映射表、HF-D-08 接口约定、HF-D-09 适用范围、§1 v1.6 交叉引用
approved = 2026-09-29 用户确认转为可计划；本次不写 Plan
```

可以据此写 Plan。Plan 待用户另行要求后再写。禁止跳过已批准 Plan 直接改生产代码。

## 0.3 No-Inference Rule

§0.4 已关闭下列事项，计划不得再把它们当作缺口自行选择：

```text
哪些公开状态算「企业模型不可用」
NOT_READY 占位符措辞是否提及本地模型
ACTIVE 是否保留任何聊天栏状态文案
```

## 0.4 Grilling 决定

2026-09-29 用户逐项确认：

| ID | 决定 |
|---|---|
| HF-G-01 | 「企业模型不可用」= `NOT_READY`（任意 backendState）+ `ERROR`（任意 errorCode）。`STALE_ACTIVE` 不算（仍在用上次已应用配置）。过渡期 `FETCHING` / `APPLYING` / `CLEARING` 不算。 |
| HF-G-02 | `NOT_READY` 占位符只提示企业模型不可用，**不提及本地模型仍可发送**。 |

# 1. 现场

2026-09-29，打包 `smc-copilot.exe`，local 模式，登录后 `ACTIVE`（`provider_ref=named:nodeskclaw`）。

问题 A：Composer 输入框工具栏常驻 `Enterprise models are ready`。企业模型正常可用时这句提示是噪音——正常状态不需要解释。

问题 B：企业模型不可用（如 `NOT_READY` / `MODEL_LIST_EMPTY`）时，Composer 没有任何提示（v1.6 §0.5 把文案挪去了 Providers 页诊断卡），用户对着普通的 `Ask anything` 占位符，无从感知企业同步失败。用户要求：不可用时把提示放进**输入框占位符**。本 delta 是对 v1.6 §0.5「只出现在企业运行时诊断卡」的**有界修订**：工具栏规则不变，仅输入框占位符允许携带企业不可用提示。

现状落点：

```text
useModelConfig.ts runtimeStatusKey()
  ACTIVE → chat.runtimeProvider.active（"Enterprise models are ready"）→ ModelPicker 工具栏渲染
  NOT_READY / UNBOUND / ERROR(RUNTIME_BOOTSTRAP_UNAVAILABLE) → ""（v1.6 已隐藏）
ChatInput.tsx:805 placeholder = t("chat.typeMessage")，静态，不随运行时状态变化
```

# 2. 需求

## HF-D-01 ACTIVE 不再显示聊天栏状态

`runtimeStatusKey()` 的 `ACTIVE` 分支返回 `""`。`ModelPicker` 不渲染状态行。英文源 `chat.runtimeProvider.active` 键随用途消失一并删除。

## HF-D-02 不可用状态进入输入框占位符

公开状态为 `NOT_READY`（任意 `backendState`）或 `ERROR`（任意 `errorCode`，含 `RUNTIME_BOOTSTRAP_UNAVAILABLE`）时，Composer 输入框占位符替换为企业不可用提示，替换掉 `chat.typeMessage`。

## HF-D-03 占位符文案复用现有英文源

不新增 i18n 键。注意：v1.6（`1459a5d1`）把 backendState 映射表从 `useModelConfig.ts` 里删掉了，本 delta 需要**重新引入**这张表（键本身仍在 en 语言包中）。规范映射如下，与 `runtime-provider-contract.ts` 的 `NOT_READY_STATES` 对齐：

| backendState | i18n 键 | 英文源 |
|---|---|---|
| `MODEL_NOT_CONFIGURED` | `chat.runtimeProvider.modelNotConfigured` | An administrator has not configured an enterprise model |
| `MODEL_CREDENTIAL_DISABLED` | `chat.runtimeProvider.modelCredentialDisabled` | Enterprise model credentials are disabled |
| `MODEL_CREDENTIAL_CLOSING` | `chat.runtimeProvider.modelCredentialClosing` | Enterprise model credentials are closing |
| `MODEL_SYNC_NOT_READY` | `chat.runtimeProvider.modelSyncNotReady` | Enterprise model configuration has not finished syncing |
| `MODEL_LIST_EMPTY` | `chat.runtimeProvider.modelListEmpty` | An administrator has not configured runtime models |
| `MODEL_DEFAULT_NOT_SET` | `chat.runtimeProvider.modelDefaultNotSet` | An administrator has not set a default model |
| `MODEL_DEFAULT_INVALID` | `chat.runtimeProvider.modelDefaultInvalid` | The default model configuration is invalid |
| `MODEL_PROVIDER_UNSUPPORTED` | `chat.runtimeProvider.modelProviderUnsupported` | The current model provider is not supported |
| `MODEL_CREDENTIAL_INVALID` | `chat.runtimeProvider.modelCredentialInvalid` | Enterprise model credentials are invalid |
| 缺失 / 未知 | `chat.runtimeProvider.modelSyncNotReady` | （同上） |
| `ERROR`（任意 errorCode） | `chat.runtimeProvider.error` | Enterprise model setup failed: {{code}} |

措辞只讲企业模型不可用，不提本地模型（HF-G-02）。

## HF-D-04 其余状态保持不变

```text
UNBOUND      → 无状态行，占位符 chat.typeMessage（现状）
STALE_ACTIVE → 工具栏 staleActive 文案 + Refresh 按钮保留，占位符 chat.typeMessage
FETCHING / APPLYING / CLEARING → 工具栏过渡期文案保留，占位符 chat.typeMessage
```

## HF-D-05 发送行为不变

占位符只是提示。`NOT_READY` 时本地模型仍可发送（v1.6 §0.5），`named:nodeskclaw` 仍返回 `RUNTIME_NOT_READY`。本 delta 不动 `gateLocalRuntimeSend`、`isRuntimeSettingsLocked` 与任何主进程逻辑。

## HF-D-06 诊断卡职责不变

Providers 页企业诊断卡继续显示 `ACTION_REQUIRED` / `backendState` / Models / Credential。占位符提示是 Composer 内的补充，不替代诊断卡。

## HF-D-07 只改英文源

本次只改 `apps/work/src/shared/i18n/locales/en/**`（删除 `active` 键）。zh-CN 及其他语言包走翻译流程，本 delta 不触碰。

## HF-D-08 落点与接口约定

```text
apps/work/src/renderer/src/screens/Chat/hooks/useModelConfig.ts
  runtimeStatusKey ACTIVE 分支返回 ""
  新增 composerPlaceholder：string（hook 内完成 t() 翻译）
    NOT_READY → t(§HF-D-03 映射键)
    ERROR     → t("chat.runtimeProvider.error", { code: errorCode || "" })
    其余状态  → ""（表示不覆盖）
apps/work/src/renderer/src/screens/Chat/Chat.tsx
  把 modelConfig.composerPlaceholder 透传给 ChatInput
apps/work/src/renderer/src/screens/Chat/ChatInput.tsx
  新增可选 prop placeholder?: string
  渲染：placeholder={placeholder || t("chat.typeMessage")}
apps/work/src/shared/i18n/locales/en/chat.ts
  删除 chat.runtimeProvider.active
```

接口约定（计划不得另选）：

```text
翻译只在 useModelConfig 内做一次，ChatInput 拿到的是译后字符串，不感知 i18n 键
ChatInput 的 placeholder prop 为空字符串或 undefined 时回退 chat.typeMessage
占位符只覆盖 Chat 主 Composer；本仓库没有其他消息编辑输入面
textarea 已有内容时浏览器原生隐藏占位符，不做额外处理
```

## HF-D-09 适用范围

本 delta 的占位符逻辑跟随 `getRuntimeProviderState` 公开状态，不限连接模式。实际上只有 local 模式会进入 `NOT_READY` / `ERROR`（remote / SSH 下运行时提供方不绑定，公开状态保持 `UNBOUND`，占位符维持 `chat.typeMessage`），因此 remote / SSH 体验自然不变，无需特判。

# 3. 验收

| ID | 条件 | 期望 |
|---|---|---|
| A-HF-001 | `ACTIVE` | 工具栏无状态行；占位符为 `chat.typeMessage` |
| A-HF-002 | `NOT_READY` + `MODEL_LIST_EMPTY` | 占位符为 `modelListEmpty` 文案；工具栏无状态行、无 Refresh；本地模型仍在 Picker |
| A-HF-003 | `NOT_READY` + backendState 缺失/未知 | 占位符为 `modelSyncNotReady` 文案 |
| A-HF-004 | `ERROR` + 非 bootstrap-unavailable | 占位符为 `error` 文案（含 code）；工具栏错误文案与 Refresh 保留 |
| A-HF-005 | `ERROR` + `RUNTIME_BOOTSTRAP_UNAVAILABLE` | 占位符为 `error` 文案（含 code）；工具栏维持 v1.6 现状（无状态行） |
| A-HF-006 | `STALE_ACTIVE` | 工具栏 staleActive + Refresh 保留；占位符为 `chat.typeMessage` |
| A-HF-007 | `UNBOUND` / `FETCHING` / `APPLYING` / `CLEARING` | 与现状一致 |
| A-HF-008 | 全部 | zh-CN 语言包零改动；`gateLocalRuntimeSend` / `isRuntimeSettingsLocked` 行为不变 |

# 4. 测试

```text
useModelConfig.test.tsx
  ACTIVE → runtimeStatus 为空、composerPlaceholder 为空
  NOT_READY(MODEL_LIST_EMPTY) → composerPlaceholder 为 modelListEmpty 文案
  NOT_READY(未知 backendState) → composerPlaceholder 为 modelSyncNotReady 文案
  ERROR(RUNTIME_GATEWAY_RESTART_FAILED) → composerPlaceholder 含 error 文案与 code
  ERROR(RUNTIME_BOOTSTRAP_UNAVAILABLE) → composerPlaceholder 含 error 文案与 code
  STALE_ACTIVE / UNBOUND → composerPlaceholder 为空
ChatInput.test.tsx
  传入 placeholder 时渲染覆盖值；未传入时渲染 chat.typeMessage
ModelPicker / Chat 层
  ACTIVE 时不渲染 .chat-runtime-provider-status（回归守卫）
```

# 5. Out of Scope

```text
Providers / Runtime 设置页只读门控（RUNTIME_PROVIDER_SETTINGS_LOCKED 的 UI 侧）——独立 PRD
purgeRuntime 的 NOT_READY 幂等（避免每轮 reconcile 重启网关）——独立 PRD
AuxiliaryTasksSection routeLocked 与 v1.6 NOT_READY 解锁的对齐——独立 PRD
主进程状态机、Bootstrap 合同、发送门、设置锁
zh-CN 翻译
```
