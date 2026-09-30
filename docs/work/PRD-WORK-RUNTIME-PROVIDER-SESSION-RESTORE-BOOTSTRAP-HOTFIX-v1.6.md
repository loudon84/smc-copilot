---
title: "smc-copilot Runtime Provider Session Restore Bootstrap Hotfix v1.6"
subtitle: "已保存登录态由启动页在进入主界面之前执行与 login 相同的 Runtime Bootstrap"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-SESSION-RESTORE-BOOTSTRAP-HOTFIX-V1.6"
version: "1.6"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "e5ce6ecf1347e9b463487234ffd142f583e0bb69"
external_contract_repository: "loudon84/nodeskclaw"
external_contract_branch: "main"
external_contract_commit: "7abb73e90e163f85257208ac4aa58e4914d2da6e"
owner: "Work Platform / Runtime Provider"
reviewers: ["Product", "Architecture", "Desktop Main", "Renderer", "QA"]
created_at: "2026-09-28"
updated_at: "2026-09-29"
target_release: "Runtime Provider Session Restore Bootstrap Hotfix v1.6"
change_type: ["HOTFIX", "BROWNFIELD_CHANGE"]
golden_consumer: "smc-copilot apps/work local mode + persisted portal session + POST /api/v1/runtime/model-bootstrap"
related_docs:
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.2-CLOSURE-RECONCILE.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-CONTINUOUS-RECONCILE-v1.3.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-OPERATIONS-DIAGNOSTICS-v1.4.md"
supersedes: null
---

# 0. PRD 使用原则

本文件是 Runtime Provider 主链的 **hotfix delta**。它不改 NodeDeskClaw Bootstrap 合同，也不改 `NOT_READY` 时清除企业密钥的语义。它把已保存登录态的 `TRIGGER-002` 改成：启动页在进入主界面之前发起唯一一次 `bootstrapRuntimeProvider("restore")`。§0.5 另将 `NOT_READY` 从聊天栏和企业设置锁上挪开：Composer 继续使用本地模型。

## 0.1 Delta Priority

```text
§0.5 Composer 与企业同步分离
  >
§0.4 Grilling 决定 HF-G-01～HF-G-05
  >
本 PRD HF-D-01～HF-D-12
  >
v1.0 TRIGGER-002 / restored authenticated session
  >
当前源码行为
```

未被本文修改的 v1.0～v1.5 语义继续有效。`MODEL_LIST_EMPTY` 仍是后端 `ready: false` 的合法状态，不是本 hotfix 要改掉的接口结果。

## 0.2 Status

```text
status = APPROVED_FOR_PLAN
grilling = CLOSED 2026-09-29
review = 2026-09-29 对照启动页、auth:login、handleReconnect、skipPortalLogin 后收紧 HF-D-02、HF-D-12、A-HF-005、A-HF-008
```

2026-09-29 用户确认 §0.4，同日检查收紧后转为可计划。可以据此写 Plan。禁止跳过已批准 Plan 直接改生产代码。

## 0.3 No-Inference Rule

§0.4 已关闭下列事项。计划不得再把它们当作缺口自行选择：

```text
restore 由谁发起、相对 app ready 与 hydrate 的顺序
无会话或非 local 时是否允许调用 model-bootstrap
login 与 restore 是否共用 bootstrapRuntimeProvider
MODEL_LIST_EMPTY 在两条路径上的公开状态
启动页是否等待 restore 结束后再进主界面
等待期的界面与英文文案
切回 local 是否再发一轮 restore
```

profile 是否为 `default`、IPC 是否调用 `notifyAcceptedRuntimeBootstrap`、Bootstrap 抛错后是否取消会话，已由 HF-D-03、HF-D-06、HF-D-09 写死。计划不得另选。

## 0.4 Grilling 决定

2026-09-29 用户逐项确认：

| ID | 决定 |
|---|---|
| HF-G-01 | 以登录路径为准。已登录重启必须 bootstrap。`MODEL_LIST_EMPTY` 仍进入 `NOT_READY`。聊天栏文案与设置锁改由 §0.5 规定，两条路径相同，且都不关掉本地 Composer。 |
| HF-G-02 | 主界面等这次 restore 结束再出现。等待期间使用现有启动页。 |
| HF-G-03 | 在现有启动页状态行旁加转圈，不新增第二块全屏。 |
| HF-G-04 | 这次只加英文源 `Loading user profile`。`加载用户资料` 是以后的中文翻译，本次不改中文语言包。 |
| HF-G-05 | 只由启动页发起这一次 restore。应用就绪前的 restore 删除。hydrate 只读会话，不发 Bootstrap。 |

## 0.5 Composer 与企业同步分离

2026-09-29 用户纠正：Chat Composer 读取本地模型目录。登录和 restore 的 `model-bootstrap` 只做与远程用户 backend 的同步校验。

`MODEL_LIST_EMPTY` 仍写入公开状态 `NOT_READY`，`backendState=MODEL_LIST_EMPTY`。该结果只出现在企业运行时诊断卡。聊天栏不显示 “An administrator has not configured runtime models”，也不显示 “Refresh enterprise models”。公开状态为 `UNBOUND` 时，聊天栏不显示 “Enterprise runtime is not bound”。

门户 backend 不可达，且当前没有已生效的企业绑定（冷启动公开状态为 `UNBOUND`）时，不发布 `ERROR` / `RUNTIME_BOOTSTRAP_UNAVAILABLE`。公开状态回到请求前的值，调度结果记为 `DEFERRED` 并稍后重试。已经是 `ACTIVE` 时的传输失败仍进入 `STALE_ACTIVE`。重叠的启动页 restore 共用一次 `bootstrapRuntimeProvider("restore")`，开发模式的二次挂载不得再开一轮 generation。

`NOT_READY` 时，本地 Composer：

```text
Chat Picker 列出本地 catalog，不含 providerRef=named:nodeskclaw
本地模型发送放行
named:nodeskclaw 发送仍返回 RUNTIME_NOT_READY
isRuntimeSettingsLocked() 为 false，本地 set-model-config 与 add-model 可写
```

企业密钥清除、Gateway restart、诊断卡上的 `ACTION_REQUIRED` / `MODEL_LIST_EMPTY` 保持不变。同步成功后的 `ACTIVE` / `STALE_ACTIVE` 仍只使用已应用的企业模型，设置锁仍在。本纠正覆盖 v1.0 `RPB-D-03`、`RPB-D-07`、`RPB-D-16`、`RPB-D-17` 里把 `NOT_READY` 当成整窗不可选、不可发送、不可改设置的句子，也覆盖本文中要求聊天栏文案和设置锁与旧登录呈现对齐的句子。

落点：`runtime-provider-orchestrator.ts` 的发送门与设置锁，`useModelConfig.ts` 的本地模型列表与聊天栏状态。

# 1. 现场

2026-09-28，`apps/work` 本地模式，`npm run dev`。

路径 A：进程起来后再登录。

```text
reason=login
stage 到达 COMPLETE
runtime_state=NOT_READY
backend_state=MODEL_LIST_EMPTY
```

当时聊天栏显示 “An administrator has not configured runtime models”，并出现 “Refresh enterprise models”。随后 `set-model-config` 与 `add-model` 抛 `RUNTIME_PROVIDER_SETTINGS_LOCKED`。§0.5 已纠正这一呈现：空列表留在企业诊断卡，本地 Composer 继续可发送、可改本地模型。

路径 B：会话已经在磁盘上，再执行 `npm run dev`。界面进入已登录主界面，但聊天栏不出现路径 A 的 `MODEL_LIST_EMPTY` 文案。启动日志里没有 `reason=restore` 的 `runtime_provider_operation`。

两条路径面对的是同一份已登录会话和同一个 Bootstrap 接口。差异只在 Desktop 有没有发出这次请求。

# 2. 根因

`apps/work/src/main/index.ts` 在模块加载时调用 `startMainProcess()`。`registerAuthIpc()` 发生在 `app.whenReady()` 之前，并立刻：

```text
hydrateTokenStore()
  → readStoredSessionSync() 为空则 return
  → 否则 bootstrapRuntimeProvider("restore")
```

Windows 上，`app ready` 之前 `safeStorage.isEncryptionAvailable()` 为 false。没有可用 keytar 时，`session.enc` 读不出来，内存会话仍是 `null`。这次回调把 restore 当成“没有会话”结束，不重试，也不记失败。

`app.whenReady()` 里的第二次 `hydrateTokenStore()` 只调用 `startKnowledgeProviderAfterAuth()`。会话这时可以解密，渲染进程 `auth:get-state` 判定已登录，但没有人再调用 `bootstrapRuntimeProvider("restore")`。公开状态保持默认 `{ state: "UNBOUND" }`。

`auth:login` 发生在应用就绪之后。`writeStoredSession` 已经把会话放进内存，因此 `bootstrapRuntimeProvider("login")` 一定会请求 `POST /api/v1/runtime/model-bootstrap`。后端返回 `MODEL_LIST_EMPTY` 时，公开状态变成 `NOT_READY`。登录不传 profile，`fileProfile(undefined)` 落到 `default`。聊天栏与设置锁按 §0.5，不随该状态关闭本地模型。

父 PRD 已经要求：

```text
TRIGGER-002 restored authenticated session，且 connection mode=local
UNBOUND + authenticated + connection mode=local → FETCHING，MUST bootstrap
```

当前实现把 TRIGGER-002 放在会话尚不可读的时刻，并且没有由启动页补发。

# 3. 解决方案

进程内的启动 restore 只有启动页这一处调用方。`registerAuthIpc()` 在 `app.whenReady()` 之前不得调用 `bootstrapRuntimeProvider("restore")`。`app.whenReady()` 里的 `hydrateTokenStore()` 继续只把会话读进内存并衔接知识库启动，不得发 Bootstrap。

已登录且 connection mode 为 local 的冷启动顺序：

```text
启动页现有 “Checking account…”
  → auth:get-state 判定已登录且 mode=local
  → 启动页状态行 “Loading user profile”，状态行旁显示转圈
  → 唯一一次 IPC
       → bootstrapRuntimeProvider("restore")    // 不传 profile，作用域为 default
       → notifyAcceptedRuntimeBootstrap(result)
  → IPC 返回后，才进入现有 “Connecting to Hermes Agent…”
  → 该连接步骤结束后进入主界面
```

没有会话时不发这次 IPC，启动页按现在的逻辑进入登录页。connection mode 不是 local 时不发这次 IPC。`auth:login` 仍在点击登录后自己调用 `bootstrapRuntimeProvider("login")`，成功返回后的启动页文案仍是 “Connecting to Hermes Agent…”，不得改成 “Loading user profile”。

从非 local 切回 local、连接失败后的 `handleReconnect`、以及 `skipPortalLogin()` 为真的启动，都不得调用这次 restore IPC。

传输超时沿用 `DEFAULT_FETCH_TIMEOUT_MS`（30000）。Bootstrap 抛错、返回 `ERROR` 或 `NOT_READY` 时，IPC 正常结束，启动页继续进入后续连接步骤和主界面，不得因此清除已恢复的会话。

# 4. 决定

## HF-D-01 恢复时机

启动 restore 只能由渲染进程启动页在 “Checking account…” 已经确认本地已登录会话之后发起。此时 `app.whenReady()` 已完成，且 `hydrateTokenStore()` 已把会话放进内存。应用就绪前的调用不得当作 TRIGGER-002。

## HF-D-02 唯一调用方

每个进程的冷启动最多一次 restore，调用方只能是启动页在已登录且 local 时发出的那次 IPC。`registerAuthIpc` 中 ready 之前的 hydrate-then-restore 必须删除。切回 local、`handleReconnect`、`skipPortalLogin()`、`auth:refresh` 都不得再调用 `bootstrapRuntimeProvider("restore")`。既有定时 reconcile 仍使用自己的 `scheduled_reconcile` reason，不算第二轮启动 restore。hydrate 失败或会话为空时不得循环重试 model-bootstrap。

## HF-D-03 与 login 同一合同

`restore` 与 `login` 都必须调用现有 `bootstrapRuntimeProvider`，且都不传 profile，公开状态键为 `default`。后端 `ready: false` 且 `state` 属于既有 NOT_READY 集合（含 `MODEL_LIST_EMPTY`）时，两条路径的公开状态与 `backendState` 必须一致。聊天栏与设置锁按 §0.5：两条路径都不在 Composer 显示企业空列表，也都不锁本地模型编辑。

本 hotfix 不得把 `MODEL_LIST_EMPTY` 显示成 `UNBOUND`。公开状态保持 `NOT_READY`。

## HF-D-04 跳过条件

以下任一成立时，启动页 IPC 不得请求 model-bootstrap，公开状态保持 `UNBOUND`，并立即返回：

```text
connection mode 不是 local
readStoredSessionSync() 为 null
```

`auth:refresh` 继续不得单独触发 bootstrap。

## HF-D-05 并发

`login`、`logout`、`refresh`、`profile_switch` 与这次 `restore` 继续使用现有 generation coordinator。后发生的 intent 作废仍在队列中的前一个 mutation。若 login 发生在 restore 尚未接受结果之前，login 的 generation 胜出，restore 结果必须是 `superseded`，不得覆盖 login 的最终公开状态。

## HF-D-06 调度器

启动页 IPC 在 `bootstrapRuntimeProvider("restore")` 返回后，若结果被接受，必须 `notifyAcceptedRuntimeBootstrap`。没有会话或非 local 时不得启动可请求 Bootstrap 的调度。

## HF-D-07 不在范围内

```text
POST /api/v1/runtime/model-bootstrap 的请求体、响应 schema、MODEL_LIST_EMPTY 的后端含义
NOT_READY 时 purge secret、CLEARING、Gateway restart
ACTIVE / STALE_ACTIVE 时的企业模型列表与设置锁
add-model 的 MODEL_PROVIDER_UNRESOLVED
logout 的 RUNTIME_AUXILIARY_ADOPTION_MISSING
desktop_session_model_overrides 的列迁移
切回 local 时补做 TRIGGER-006
本次修改 zh-CN 或其它非英文语言包
把历史启动页文案（Checking account…、Connecting to Hermes Agent…）迁入 i18n
```

管理员模型列表为空时，登录与已登录重启的公开状态都是 `NOT_READY` / `MODEL_LIST_EMPTY`。企业诊断卡显示该结果。Composer 按 §0.5 继续使用本地模型。

## HF-D-08 实现边界

允许改动的生产位置：

```text
apps/work/src/main/auth/auth-ipc.ts
apps/work/src/main/ipc/register.ts
apps/work/src/preload/index.ts
apps/work/src/preload/index.d.ts
apps/work/src/renderer/src/App.tsx
apps/work/src/renderer/src/screens/SplashScreen/SplashScreen.tsx
apps/work/src/renderer/src/assets/main.css
apps/work/src/shared/i18n/locales/en/**
```

`apps/work/src/main/app/start.ts` 的 `whenReady` hydrate 保持只读会话。不得在该处新增 bootstrap。不得新增 Bootstrap 客户端，不得复制一套 restore 状态机，不得在 renderer 里用定时器补拉状态来掩盖 Main 没写公开状态。

## HF-D-09 主界面门闩

已登录且 local 的冷启动，在 restore IPC settle 之前不得把 screen 设为 `main`。settle 包括：Bootstrap 成功、`NOT_READY`、传输失败、抛错、或 HF-D-04 的立即返回。抛错和传输失败不得清除会话。主界面第一次读取 `get-runtime-provider-state` 时，必须已经是这次 restore 写入的公开状态，而不是先画默认 `UNBOUND` 再跳变。

## HF-D-10 启动页等待

等待只出现在现有 `SplashScreen`。restore IPC 进行期间：

```text
状态行来自英文 i18n 源：Loading user profile
状态行旁有转圈
不新增第二块全屏
```

IPC 返回后，转圈与这句文案撤下，随后仍使用现有 “Connecting to Hermes Agent…”。登录成功后的启动页不得显示 “Loading user profile”。

## HF-D-11 文案

新增用户可见字符串只写入 `locales/en`。英文原文固定为 `Loading user profile`。`加载用户资料` 只记录为后续翻译目标，本次不得写入 `zh-CN` 或其它非英语言包。

## HF-D-12 切回 local

用户从非 local 切回 local，或在连接错误页重连而进入 `handleReconnect` 时，沿用现有账号检查与 Hermes 连接步骤。这两次进入启动页不得调用 restore IPC，也不得把状态行设为 “Loading user profile”。`skipPortalLogin()` 为真时同样不得调用 restore IPC。

# 5. 验收

| ID | When | Then |
|---|---|---|
| A-HF-001 | 冷启动，ready 前会话不可读，hydrate 后会话在且 mode=local | 恰好一次 `bootstrapRuntimeProvider("restore")`，发生在启动页 IPC 内，且在 hydrate settle 之后；`registerAuthIpc` 不再调用它 |
| A-HF-002 | hydrate 之后没有会话 | restore IPC 不请求 model-bootstrap，公开状态为 `UNBOUND`，进入登录页 |
| A-HF-003 | 有会话但 connection mode 不是 local | 不请求 model-bootstrap，公开状态为 `UNBOUND`，不显示 “Loading user profile” |
| A-HF-004 | restore 收到 `ready: false, state: MODEL_LIST_EMPTY` | 公开状态 `NOT_READY`，`backendState=MODEL_LIST_EMPTY`。本地模型发送成功，`named:nodeskclaw` 发送为 `RUNTIME_NOT_READY`，`isRuntimeSettingsLocked()==false`。login 收到同一响应后公开状态相同 |
| A-HF-005 | 无会话时用户在登录页登录 | 仍恰好走 `bootstrapRuntimeProvider("login")`；登录成功后的启动页不得显示 “Loading user profile” |
| A-HF-006 | restore 进行中又发生 login | login generation 胜出；restore 的 superseded 结果不得把公开状态写回旧值 |
| A-HF-007 | restore 返回 accepted 且 mode=local、会话仍在 | 同一次 IPC 调用 `notifyAcceptedRuntimeBootstrap` |
| A-HF-008 | restore IPC settle 之后 Chat 读取 `get-runtime-provider-state` | 返回这次 restore 写入的公开状态；该次响应为 `MODEL_LIST_EMPTY` 时与 A-HF-004 相同。screen 在 settle 之前不是 `main` |
| A-HF-009 | restore IPC 未返回 | 启动页可见 “Loading user profile” 与转圈，且没有第二块全屏加载层 |
| A-HF-010 | 用户从非 local 切回 local、连接错误页重连，或 `skipPortalLogin()` 为真 | 不调用 restore IPC，不显示 “Loading user profile” |
| A-HF-011 | Bootstrap 抛错或在 30000ms 传输超时 | IPC 结束，会话仍在，启动页继续后续步骤并可以进入主界面 |
| A-HF-012 | 本次 diff | `locales/en` 含 `Loading user profile`；不含对非英语言包的修改 |

测试落点：

```text
apps/work/src/main/auth/auth-ipc.test.ts
启动页 restore IPC 的 Main 单测
启动页等待与 “Loading user profile” 的 renderer 测试
```

公开状态用 Main 单测断言。renderer 测试只断言门闩、转圈和英文状态行，不得用它代替 `NOT_READY` 断言。

# 6. 证据

实现前，当前源码必须仍满足：

```text
registerAuthIpc 在 startMainProcess 内、app.whenReady 之前调用 hydrate 并可能调用 bootstrap("restore")
app.whenReady 内的 hydrateTokenStore 只衔接 startKnowledgeProviderAfterAuth
auth:login 在 mode=local 时调用 bootstrap("login") 与 notifyAcceptedRuntimeBootstrap，且不传 profile
getRuntimeProviderPublicState 在 map 为空时返回 { state: "UNBOUND" }
isRuntimeSettingsLocked 在 local 且 state !== UNBOUND 时为 true
SplashScreen 用 splash-status 显示一行状态，没有独立转圈
App.tsx 冷启动已登录后进入 runRuntimeConnect，文案为 “Connecting to Hermes Agent…”
```

实现后，路径 B 的日志必须出现 `reason=restore`，并且当 Bootstrap 返回 `MODEL_LIST_EMPTY` 时出现与路径 A 相同的 `runtime_state=NOT_READY` 与 `backend_state=MODEL_LIST_EMPTY`。该日志不得出现在应用就绪之前。

# 7. 追踪

| 决定 | Grilling | 验收 | 现有合同 |
|---|---|---|---|
| HF-D-01 HF-D-02 | HF-G-05 | A-HF-001 A-HF-002 | TRIGGER-002 |
| HF-D-03 | HF-G-01 | A-HF-004 A-HF-005 A-HF-008 | NOT_READY；login 不传 profile |
| HF-D-04 | HF-G-05 | A-HF-002 A-HF-003 | mode=local 且已认证才 bootstrap |
| HF-D-05 |  | A-HF-006 | runtime intent generation |
| HF-D-06 | HF-G-01 | A-HF-007 | notifyAcceptedRuntimeBootstrap |
| HF-D-07 | HF-G-04 | A-HF-012 | v1.0～v1.5；源语言只改 en |
| HF-D-08 HF-D-10 HF-D-11 | HF-G-02 HF-G-03 HF-G-04 | A-HF-009 | 现有 SplashScreen |
| HF-D-09 | HF-G-02 | A-HF-008 A-HF-011 | login IPC 返回后才离启动页 |
| HF-D-12 | HF-G-05 | A-HF-010 | 切回 local 不在本次补 TRIGGER-006 |
