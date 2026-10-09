---
title: "Runtime Provider First-Login Adoption Hotfix"
subtitle: "新机器首次登录被 RUNTIME_AUXILIARY_ADOPTION_MISSING 阻断；sidecar 缺失时就地捕获并继续 apply，不改 hermes-builder"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-FIRST-LOGIN-ADOPTION-HOTFIX-V1.8"
version: "1.8.2"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "d32fb43b303c792cdf1a3b3df625f1816b704774"
owner: "Work Platform / Runtime Provider"
reviewers: []
created_at: "2026-10-09"
updated_at: "2026-10-09"
target_release: "0.7.11"
change_type: ["HOTFIX", "BROWNFIELD_CHANGE"]
evidence_log: "apps/work/prd/hotfix.md + 2026-10-08/09 新机器安装现场日志 + grilling 2026-10-09"
related_docs:
  - "apps/work/prd/hotfix.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-v1.0.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-SESSION-RESTORE-BOOTSTRAP-HOTFIX-v1.6.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-COMPOSER-PLACEHOLDER-HOTFIX-v1.7.md"
supersedes: null
amends:
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-v1.0.md inspectAuxiliaryAdoption MISSING-block contract"
---

# 0. PRD 使用原则

本文件只覆盖 **新机器首次安装 smc-copilot 后，Portal 登录成功但 Runtime Provider 因 sidecar 缺失进入 ERROR** 这一类缺陷。它不改 Hermes 发行物、不改 hermes-builder、不把 `runtime-auxiliary-adoption.json` 打进 MSI。

本 hotfix **修正** v1.0 中「`provider=nodeskclaw` 且 auxiliary sidecar 不存在 → 必须 block」的合同：该合同把现场半初始化锁死。修正方式是 **就地捕获（in-place capture）**，不是伪造 `localhost`。

```text
status = APPROVED_FOR_PLAN
grilling = CLOSED 2026-10-09（HF-G-01～HF-G-11）
review = 2026-10-09 initial PASS（docs/work/reviews/prd-work-runtime-provider-first-login-adoption-hotfix-v1.8-initial-review.md）
implementation = 禁止。可以写 Plan。Cursor 实现要求已批准 .plan.md
```

现场分析原文：`apps/work/prd/hotfix.md`。对照当前 `apps/work` 基线（HEAD `d32fb43b`，分支 `work/prd-v6.2.1`）。

可以据此写 Plan。Plan 待用户另行要求后再写。禁止跳过已批准 Plan 去改生产代码。

## 0.1 现场现象与真正的 P0

企业新机器安装顺序：Hermes MSI → smc-copilot Setup → 首次 Portal 登录。登录成功，Runtime ERROR：

```text
RUNTIME_AUXILIARY_ADOPTION_MISSING
```

当时磁盘：`config.yaml` 的 `model.provider` **已经是** `nodeskclaw`；同目录 **没有** `runtime-provider-auxiliary-adoption.json`。

**源码事实（grilling 钉死）：** 若 yaml 仍是非 `nodeskclaw`（例如 `localhost`）且 sidecar 不存在，现有 `inspectAuxiliaryAdoption` **已经会 `capture`**，不会报 MISSING。因此 §6.1 不是现场 P0。现场 P0 是 **inspect 时 yaml 已经是 `nodeskclaw`**。

本轮成功标准（HF-G-01=A）：这种机器必须再次 apply 到 **ACTIVE**，用户不用手改 yaml、也不用从别的电脑拷 JSON。

明确代价：就地捕获时若没有 `runtime-provider-adoption.json`，登出 **不会** 把 `model.provider` 变回 Hermes Setup 的本地模型。要用本地模型，用户自己走 Hermes Setup。这不是实现疏漏。

## 0.2 禁止项

- 禁止修改 `hermes-builder`、Hermes MSI、`hermes-agent` 发行物内容。
- 禁止把 `runtime-auxiliary-adoption.json` / `runtime-provider-adoption.json` 作为静态文件打进 Setup / extraResources / Hermes 目录。
- 禁止把 `model.provider` 写成猜的 `localhost`（或任何未证实的「原 provider」）。
- 禁止用内置 Hermes 默认 auxiliary、default Profile、或其它机器的 JSON 合成 sidecar。
- 禁止把「登录成功」当成「Runtime ACTIVE」。Portal 会话与 Runtime Provider 必须继续是两条状态。
- 禁止为了绕过 ERROR 而跳过 IDENTITY_CONFLICT / POST_APPLY_DRIFT / INVALID sidecar。
- 禁止把本 hotfix 扩成 Knowledge / FilePreview / 分析埋点 / 自动更新 / YAML 整文件 `yaml` 库重写 / overwrite 诊断。
- 禁止把上一轮已落地的 Windows 现场修复（EXDEV、BOM、PROJECT catch、Gateway 60s、MSI 非 git 根禁止 clone）重新设计一遍；那些能力 KEEP。
- 禁止为本包新增横幅、强制确认框、或挡住主界面。

## 0.3 本轮范围边界

| 在范围 | 不在范围 |
|---|---|
| auxiliary sidecar 缺失时就地捕获并继续 apply | hermes-builder / MSI payload / 预置 JSON |
| `rememberAdoption`：已是 nodeskclaw 时不得把 nodeskclaw 写成原值 | 密钥落盘 |
| login / splash restore 传入 `getActiveProfileNameSync()` | 用 `yaml` 库重做投影；overwrite 打诊断 |
| 登出：缺 sidecar 不挡、不猜 localhost、session 仍清 | 后端 `/api/v1/runtime/model-bootstrap` |
| 就地捕获诊断事件（无新 UI） | Desktop `apps/desktop`；新 Runtime 横幅 |
| 改写「必须 MISSING-block」测试 | 登录 IPC 改为失败 |

## 0.4 术语

| 术语 | 含义 |
|---|---|
| auxiliary sidecar | `runtime-provider-auxiliary-adoption.json`，登出时还原 auxiliary 槽位 |
| active-model sidecar | `runtime-provider-adoption.json`，登出时还原 `model.provider` / `model.default` |
| 就地捕获 in-place capture | auxiliary sidecar 文件不存在时，从 **当前磁盘** `config.yaml` 捕获 auxiliary 槽位并写入 sidecar，然后继续托管 apply；即使当前 provider 已是 `nodeskclaw` |
| 干净首次 | inspect 时 provider **不是** `nodeskclaw`，无 sidecar → 普通 `capture`（现有行为 KEEP） |

---

# 1. Current Capability Inventory

对照 HEAD `d32fb43b` 与当前工作区 `apps/work` 源码。生产路径只有下列入口。

| Capability | Existing Owner | Existing Entry Point | Current Tests |
|---|---|---|---|
| Auxiliary adoption inspect/capture/reuse | `runtime-provider-auxiliary-adoption.ts` | `inspectAuxiliaryAdoption` / `writeAuxiliaryAdoption` / `restoreAuxiliaryFromAdoption` | `runtime-provider-auxiliary-adoption.test.ts` |
| Apply-ready 在 PROJECT 前阻断缺失 sidecar | `runtime-provider-orchestrator.ts` `applyReady` | `inspect` → `block` → `ERROR` | 「nodeskclaw + 无 sidecar」断言为必须 block（本轮要改） |
| 首次 capture 写入 sidecar | `applyReady` | `action === "capture"` 时 `writeAuxiliaryAdoption(snapshot.files.config)` | 有「不重写已有 sidecar」 |
| Active-model adoption 记忆 | `runtime-provider-projection.ts` `rememberAdoption` | PROJECT 内 `setModelConfig(nodeskclaw)` 之前 | 无「已是 nodeskclaw 时不得伪造原值」 |
| Login bootstrap | `auth-ipc.ts` `auth:login` | `bootstrapRuntimeProvider("login")` **不传 profile** | splash restore 有测试；login 未断言 profile |
| Splash restore bootstrap | `auth-ipc.ts` `restoreRuntimeProviderForSplash` | `bootstrapRuntimeProvider("restore")` **不传 profile** | `restore-runtime-provider-for-splash.test.ts` |
| Reconcile bootstrap | `runtime-provider-reconcile-bindings.ts` | `getActiveProfileNameSync()` | reconcile 单测 |
| Logout purge 缺 sidecar | `purgeRuntime("logout")` | 无文件且已是 nodeskclaw → `ERROR` MISSING，`auxiliaryRestored` 保持 false | 与 apply 同一错误码 |
| Login 与 Runtime 解耦 | `auth-ipc.ts` | login catch 后仍返回 session | 无「登录成功 + runtime ERROR 必须对 UI 可见」产品验收 |
| Secret 仅内存 | `runtime-provider-secret-store.ts` | `installManagedSecret` | 现有测试 |
| YAML 原子写 | `utils.ts` `safeWriteFile` | EXDEV/EPERM 时可 overwrite | 上一轮已加 EXDEV |
| BOM / 重复 `model:` | config / projection | BOM-tolerant 读 + 投影 | 上一轮已加 |
| Gateway 冷启动等待 | `native-hermes-runtime-backend.ts` | health wait 60s | 上一轮已加 |
| MSI PROGRAM_MANAGED 根 | `hermes-bootstrap.ts` / `hermes-repair.ts` | 禁止当坏 git 全量 clone | `hermes-bootstrap.test.ts`（KEEP） |

## 1.1 当前代码仍存在的缺陷

### D1. apply 把「已是 nodeskclaw 且 sidecar 不存在」一律 block

`inspectAuxiliaryAdoption` 在文件不存在且 `getModelConfig().provider === nodeskclaw` 时返回 `block` / `RUNTIME_AUXILIARY_ADOPTION_MISSING`。`applyReady` 在 PROJECT 之前消费后直接 ERROR。现有单测固化该行为。

现场 yaml 已经是 `nodeskclaw` 时，永远进不了 `writeAuxiliaryAdoption`，自锁。

### D2. `rememberAdoption` 在已经是 nodeskclaw 时直接 return

不会补写 active-model sidecar；也正因为不得把 `nodeskclaw` 当成「原值」，本轮 **继续 skip 写入**，只补诊断。登出因此可能无法还原 Setup 模型（已接受代价）。

### D3. 登录 / splash restore 不传活跃 Profile

`bootstrapRuntimeProvider("login"|"restore")` 无第二参。Reconcile 才 `getActiveProfileNameSync()`。`getActiveProfileNameSync()` 在缺少 `active_profile` 文件时已回退 `"default"`。本轮 login/splash 必须传入该返回值，不另造 unresolved 诊断。

### D4. Portal 登录成功掩盖其它 Runtime ERROR

v1.6 会话优先 KEEP。就地捕获落地后，MISSING 不再是 apply 主失败码；其它 apply 失败仍须出现在 Runtime 公共状态，不得只 `console.error`。Composer 不得画成「模型已就绪」。

### D5 / D6. YAML overwrite 与密钥内存 — 本轮 KEEP 不做

overwrite 诊断与 `yaml` 库整文件投影不进本包（HF-G-02=A，HF-G-05=A）。密钥仍仅内存。

### D7. 登出 `purgeRuntime` 用同一 MISSING 挡住清理

无 auxiliary 文件且已是 nodeskclaw 时 `setState(ERROR, MISSING)`，`auxiliaryRestored` 仍为 false，Gateway 若重启成功也会提前 return，到不了 `UNBOUND`。与 HF-G-08=A（不挡登出）冲突，必须改。

---

# 2. 根因

v1.0 把 auxiliary sidecar 当成「切换到 nodeskclaw **之前** 才能捕获」的前置不变量。文件不存在且已经是 nodeskclaw 时拒绝 apply，是为了防止把原路由猜成 `localhost`。

现场与半初始化落入这个分支的原因包括：上次 PROJECT 已把 yaml 写成 nodeskclaw、sidecar 从未生成或丢失、安装残留。拒绝 apply 并不能恢复原路由，只会让企业模型也无法用。

登录路径不是完整的 Runtime 入口（不传 profile）。登出路径把同一 MISSING 当成不可清理状态。

---

# 3. Target End-State Inventory

| Capability | Production Owner | Allowed Implementations |
|---|---|---|
| sidecar 文件不存在 → 一律 capture（含已是 nodeskclaw） | `inspectAuxiliaryAdoption` + `applyReady` | 1 |
| 就地捕获来源 = 当前磁盘 yaml auxiliary 槽位 | `writeAuxiliaryAdoption(snapshot.files.config)` | 1 |
| capture 写盘成功后才 PROJECT→SECRET→RESTART→VERIFY | `applyReady` | 1 |
| 已是 nodeskclaw 时不把 nodeskclaw 写入 active-model sidecar | `rememberAdoption` | 1 |
| login / restore 传入 `getActiveProfileNameSync()` | `auth-ipc.ts` | 1 |
| 登出缺 sidecar 不挡，不猜 localhost，进 UNBOUND | `purgeRuntime("logout")` | 1 |
| 就地捕获诊断事件，无新 UI | 现有 runtime-provider 操作日志 / 诊断导出 | 1 |
| Secret 仅内存 | 现有 secret store | 1 |
| INVALID / IDENTITY_CONFLICT / POST_APPLY_DRIFT | 现有 owners | KEEP |

REPLACE 本轮为 0。无新生产模块。

---

# 4. Change Classification

| Item | Action | Target State |
|---|---|---|
| 非 nodeskclaw 且无 sidecar → capture | KEEP | 不变 |
| sidecar 有效 → reuse | KEEP | 不变 |
| sidecar 损坏 → inspect `INVALID` block | KEEP | 不变 |
| 预检 `AUXILIARY_ROUTING_DRIFT` | KEEP | 属 `checkManagedRuntimeProjection` 的 DRIFTED 原因，**不是** inspect block；预检 DRIFTED 走 PROJECT，不在 capture 前 ERROR。POST_APPLY 仍因该原因报 `RUNTIME_PROVIDER_POST_APPLY_DRIFT` |
| 已是 nodeskclaw 且无 sidecar → MISSING block | **REMOVE（该分支）** | 改为与其它缺失相同：`capture` |
| 固化 MISSING-block 的单测 | MODIFY | 断言 capture 后可 apply；禁止伪造 localhost |
| `rememberAdoption` 已是 nodeskclaw 时 skip 写入 | KEEP 写入策略 | 缺文件时打诊断，**不得**把 nodeskclaw 写成原值 |
| capture 先于 PROJECT | KEEP | 写盘失败则中止 apply，不得改 yaml |
| 已 ACTIVE 且 MATCH 才 noop | KEEP | 就地捕获后的首次登录 `previous` 不是 ACTIVE → 必须满流水线 |
| login / splash 不传 profile | MODIFY | 传入 `getActiveProfileNameSync()` |
| login 失败仍返回 session | KEEP | 其它 Runtime ERROR 仍走公共状态 |
| logout 缺 sidecar → MISSING | MODIFY | 跳过 auxiliary/model 还原；不改 `model.provider`；`auxiliaryRestored=true`；清密钥；进 UNBOUND |
| 错误码字符串 MISSING 留在联合类型 | KEEP | 生产 apply/logout **不再** `setState(MISSING)` |
| 密钥落盘 / 预置 JSON / YAML 库重写 / overwrite 诊断 / 新 UI | KEEP（不做） | 禁止 |
| EXDEV/BOM/Gateway 60s/MSI 非 git 根 | KEEP | 不回滚 |

## Replacement / Removal Matrix

| Existing | Action | Replacement | Removal Condition |
|---|---|---|---|
| apply/logout 「nodeskclaw + 无 sidecar ⇒ MISSING ERROR」 | REMOVE | 就地 capture（apply）/ 跳过还原并 UNBOUND（logout） | 本 hotfix 同一 PR |
| 测试「blocks a nodeskclaw profile that has no sidecar」 | REMOVE（该期望） | 「无 sidecar → capture，yaml provider 不被改成 localhost」 | 同一 PR |

## Compatibility Contract

| Compatibility | Current Consumer | Reason | Removal Condition | Removal Version |
|---|---|---|---|---|
| 错误码 `RUNTIME_AUXILIARY_ADOPTION_MISSING` 字符串仍存在于联合类型 | 旧日志 / UI 映射 | 避免旧诊断解析崩 | 生产路径不再 emit 后，可在后续 PRD 删除 | 不在本 hotfix 删除类型 |
| login 失败不回滚 Portal session | `auth-ipc.ts` | v1.6 | 无 | 长期 KEEP |
| sidecar 文件名与 schema | logout restore | v1.0 | 无 | 长期 KEEP |
| 已 ACTIVE + MATCH noop | `applyReady` | 避免无谓重启 | 无 | 长期 KEEP |

---

# 5. 与上一轮现场修复的关系

下列问题出现在同一批新机器日志里，已在 HEAD `d32fb43b`（及工作区 Hermes MSI 根保护）处理。本 PRD 不作为新需求：

| 现场错误 | 本轮 |
|---|---|
| `RUNTIME_PROVIDER_PROJECT_FAILED` / `EXDEV` | KEEP |
| `RUNTIME_PROVIDER_POST_APPLY_DRIFT`（BOM / 重复 `model:`） | KEEP |
| `RUNTIME_GATEWAY_RESTART_FAILED`（15s vs 冷启动） | KEEP（60s） |
| `hermes-agent` 被当成坏 git 整树 `broken-*` 后 clone | KEEP；不与本 PR 混提交 |
| APPLYING 吞掉 PROJECT 异常 | KEEP |

本轮主缺陷：adoption 状态机在 **已经是 nodeskclaw 且 sidecar 缺失** 时自锁；login/splash 不传 profile；logout 被同一 MISSING 挡住。

---

# 6. 行为合同（MUST / MUST NOT）

## 6.1 干净首次（KEEP，非现场 P0）

inspect 时 provider **不是** `nodeskclaw`，auxiliary sidecar 不存在：

- MUST `capture`，从当前磁盘 yaml 写入 sidecar，再 PROJECT。
- MUST NOT 因「sidecar 本来就不存在」而 MISSING。

## 6.2 就地捕获 — 现场 P0（HF-G-01=A，HF-G-07=A，HF-G-11=A）

auxiliary sidecar **文件不存在**（不论当前 provider 是否 `nodeskclaw`）：

- MUST `inspect` → `capture`。
- MUST 只从 **当前磁盘** `config.yaml` 的 auxiliary 槽位捕获。MUST NOT 合成 Hermes 默认值、MUST NOT 从 default Profile 或其它家目录抄、MUST NOT 从安装包取。
- MUST NOT 把 `model.provider` 改成猜的 `localhost`。
- MUST 在 PROJECT 之前把 sidecar 落盘。`writeAuxiliaryAdoption` 与随后的 `projectManagedRuntime` 对调用方必须是同一条失败面：写盘抛错 MUST 被 `applyReady` 接住，MUST NOT 只靠 `auth:login` 的外层 catch。可观察 `errorCode` MUST 为 `RUNTIME_PROVIDER_PROJECT_FAILED`。MUST NOT 继续 `projectManagedRuntime`，MUST NOT `setState(MISSING)`。
- 写盘成功后 MUST 走完整 PROJECT → SECRET → RESTART → VERIFY。现有「`previous.state === ACTIVE` 且 secret/revision/投影 MATCH 才 noop」KEEP。首次登录 `previous` 不是 ACTIVE，MUST NOT 因 yaml 已是 nodeskclaw 而跳过重启（密钥只在内存）。
- MUST 打诊断事件 `adoption_captured_in_place`（profile、当时 provider、是否已有 active-model sidecar）。MUST NOT 加横幅或对话框。
- `RUNTIME_AUXILIARY_ADOPTION_MISSING` MUST NOT 再由 apply 路径 `setState`。

sidecar 文件存在但无法解析：KEEP inspect `INVALID` block。IDENTITY_CONFLICT 仍在 inspect 之后、PROJECT 之前阻断。POST_APPLY_DRIFT（含 post-check `AUXILIARY_ROUTING_DRIFT`）KEEP。`inspectAuxiliaryAdoption` MUST NOT 再返回 `block`/`MISSING`。

## 6.3 active-model sidecar（HF-G-06=A）

- 当前 provider **不是** `nodeskclaw`：KEEP，`rememberAdoption` 在 PROJECT 改写前写入原 provider/model。
- 当前 provider **已是** `nodeskclaw`：MUST NOT 把 `{ provider: "nodeskclaw", ... }` 写入 `runtime-provider-adoption.json` 冒充原值。文件缺失 MUST 只记诊断，MUST NOT 补写。
- 文件已存在：MUST NOT 覆盖。登出时 `restoreAdoptedActiveModel` 仍从该文件还原。

## 6.4 Profile（HF-G-03=A）

- `auth:login` 在 `mode === "local"` 时 MUST `bootstrapRuntimeProvider("login", getActiveProfileNameSync())`。
- splash restore MUST 传入同一函数的返回值。
- 该函数在缺少 `active_profile` 时已回退 `"default"`。本轮 MUST NOT 另造 `profile_unresolved` 诊断要求。

## 6.5 登录表面（HF-G-04=A）

- Portal 登录成功 MUST 仍写入 session（v1.6 KEEP）。
- MUST NOT 用登录失败表达 Runtime ERROR。MUST NOT 挡住主界面。
- Runtime 非 `ACTIVE` 时，Composer / 模型选择 MUST 走现有 NOT_READY/ERROR 表面，MUST NOT 显示「模型已就绪」。

## 6.6 登出（HF-G-08=A）

`purgeRuntime("logout")`：

- MUST 清内存密钥。
- auxiliary sidecar 不存在：MUST 跳过 auxiliary 还原；MUST NOT `setState(MISSING)`；MUST 视同 `auxiliaryRestored = true` 以便走到 UNBOUND。
- auxiliary sidecar 损坏：KEEP `INVALID`（与 apply 一致，登出仍不能拿损坏文件当真值）。
- auxiliary sidecar 有效：KEEP 按文件 restore 槽位。
- active-model sidecar 不存在：MUST NOT 修改 `model.provider`。yaml 可能继续为 `nodeskclaw`。
- Portal session MUST 仍被 `auth:logout` 清掉。
- Gateway 重启成功且还原步骤已跳过或完成：MUST `UNBOUND`。MUST NOT 把人留在 ERROR MISSING。
- MUST NOT 为了「还原 Setup 模型」而写入 `localhost`。

## 6.7 密钥与安装包

- MUST NOT 把 managed apiKey 写入 yaml 或任一 sidecar。
- MUST NOT 把 sidecar 打进 Setup 或 Hermes 发行物。
- 进程重启后密钥不在是预期；restore/login MUST 再次 bootstrap。

---

# 7. Acceptance Criteria

- [ ] **AC-01** 磁盘 yaml 已是 `nodeskclaw`、无 auxiliary sidecar、无或不论 active-model sidecar：Portal 登录后 Runtime 能走就地 capture → 满流水线 apply，**不会**因 `RUNTIME_AUXILIARY_ADOPTION_MISSING` 停在 ERROR。apply 成功则 `ACTIVE`。`model.provider` 仍为 `nodeskclaw`，不被改成 `localhost`。
- [ ] **AC-02** 磁盘 yaml 为非 `nodeskclaw`、无 sidecar：仍 capture 再 apply（回归，不得回归成 MISSING）。
- [ ] **AC-03** capture 写盘失败：不调用 / 不完成 `projectManagedRuntime`；yaml 不被写成新托管内容；错误不是 MISSING。
- [ ] **AC-04** capture 成功、PROJECT 在 `setModelConfig(nodeskclaw)` 之后失败：sidecar 已在磁盘；再次登录 inspect 为 `reuse`。
- [ ] **AC-05** sidecar 文件损坏：仍 `INVALID`，不覆盖、不 capture。
- [ ] **AC-06** 已是 `nodeskclaw` 且 apply 前无 `runtime-provider-adoption.json`：apply 成功后该文件仍不存在。诊断含 `adoption_captured_in_place`。
- [ ] **AC-13** 就地捕获成功后登出（无 active-model sidecar）：Runtime `UNBOUND`，`model.provider` 仍为 `nodeskclaw`，auxiliary sidecar 被删除或不存在。再次登录必须再次就地捕获并可以回到 `ACTIVE`，不得 MISSING。
- [ ] **AC-07** 已有合法 `runtime-provider-adoption.json`（例如 `localhost`）：apply 不覆盖它；登出可按该文件还原 model。
- [ ] **AC-08** `auth:login` 与 splash restore 把 `getActiveProfileNameSync()` 的返回值传给 `bootstrapRuntimeProvider`。
- [ ] **AC-09** 登录 IPC 成功返回 session；Runtime 若因 **其它** 原因 ERROR，公共状态仍为 ERROR；主界面可进；Composer 非「已就绪」。
- [ ] **AC-10** 登出时无 auxiliary sidecar：不 MISSING；session 清除；Runtime `UNBOUND`；`model.provider` 若登出前是 `nodeskclaw` 且无 active-model sidecar，登出后仍是 `nodeskclaw`。
- [ ] **AC-11** 无 hermes-builder / extraResources 预置 json；无 apiKey 落盘；无新横幅/对话框。
- [ ] **AC-12** IDENTITY_CONFLICT / POST_APPLY_DRIFT / inspect `INVALID` 现有测试仍绿。

---

# 8. 测试合同

均在 `apps/work`：

| 测试 | 断言 |
|---|---|
| nodeskclaw + 无 auxiliary sidecar | inspect=`capture`；apply 不 MISSING；provider 不被改成 localhost |
| 非 nodeskclaw + 无 sidecar | inspect=`capture`（回归） |
| capture 写盘失败 | 不完成 PROJECT；`errorCode=RUNTIME_PROVIDER_PROJECT_FAILED`；非 MISSING |
| PROJECT 失败于 nodeskclaw 写入之后 | 磁盘有 auxiliary sidecar；再次 inspect=`reuse` |
| 损坏 sidecar | `INVALID` |
| 已是 nodeskclaw + 无 active-model sidecar | 不创建「原值=nodeskclaw」的 adoption json |
| 已有 localhost adoption json | apply 后文件内容不变 |
| login / splash profile | 传入 `getActiveProfileNameSync()` 的 stub 返回值 |
| 登录成功 + 其它 runtime ERROR | session 在且 public state ERROR |
| logout 无 auxiliary sidecar + 已是 nodeskclaw | 非 MISSING；UNBOUND；provider 仍 nodeskclaw |
| 就地捕获 → 登出 → 再登录 | sidecar 可再次 capture；第二次 apply 不 MISSING，可 ACTIVE |
| 禁止 | 保留「blocks a nodeskclaw profile that has no sidecar」为正确期望 |

---

# 9. Out of Scope

- hermes-builder、Hermes MSI、`PROGRAM_MANAGED` 发行物内容。
- 预置 adoption JSON。
- 密钥持久化。
- 后端 model-bootstrap 合同。
- 整文件 `yaml` 库投影、禁止 overwrite 回退、overwrite 诊断日志。
- 就地捕获的用户横幅 / 确认框。
- Knowledge / FilePreview / analytics / auto-updater。
- 重做 EXDEV、BOM、Gateway 60s、禁止 MSI 根 clone。
- `apps/desktop`。
- 从联合类型删除 `RUNTIME_AUXILIARY_ADOPTION_MISSING` 字符串。

---

# 10. Grilling 记录（CLOSED 2026-10-09）

用户确认共享理解。建议项均被采纳。

| ID | 问题 | 决定 |
|---|---|---|
| HF-G-01 | 现场 P0 成功标准 | A：nodeskclaw+无 sidecar 必须能 apply 到 ACTIVE，不手改 yaml、不拷 JSON |
| HF-G-02 | YAML 库整文件投影是否进本包 | A：不进 |
| HF-G-03 | login/splash 是否传 Profile | A：传 `getActiveProfileNameSync()` |
| HF-G-04 | 登录成功但 Runtime ERROR 是否挡主界面 | A：进主界面；Composer 走现有表面 |
| HF-G-05 | overwrite 诊断是否 P0 | A：不进本包 |
| HF-G-06 | 改哪份 sidecar | A：auxiliary 就地捕获为 P0；active-model 不得把 nodeskclaw 写成原值，缺失只诊断 |
| HF-G-07 | 无 sidecar 是否仍 MISSING-block | A：一律 capture；apply 不再 setState(MISSING)；INVALID/DRIFT KEEP |
| HF-G-08 | 登出无原始 model sidecar | A：不挡；不改 model.provider；session 清；进 UNBOUND |
| HF-G-09 | 就地捕获用户提示 | A：仅诊断事件，无新 UI |
| HF-G-10 | yaml 已是 nodeskclaw 是否满流水线 | A：要；ACTIVE MATCH noop KEEP |
| HF-G-11 | 捕获来源 | A：仅当前磁盘 yaml auxiliary |

原草稿 Open Grilling HF-G-01～05（错误码拆分、retry 按钮禁用、profile_unresolved、overwrite P0）被上表取代，作废。

---

# 11. 实现门禁

```text
PRD status APPROVED_FOR_PLAN
→ 另写 .plan.md 并批准
→ 才允许改 apps/work 生产代码
```

Plan 批准前禁止：改 `inspectAuxiliaryAdoption`、改 login profile 传参、改 adoption 测试期望、发带该修复的安装包。
