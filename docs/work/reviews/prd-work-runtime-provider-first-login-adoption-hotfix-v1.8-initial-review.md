# Runtime Provider First-Login Adoption Hotfix v1.8 — PRD Initial Review

**Mode:** initial  
**Verdict:** PASS  
**Reviewed artifact:** `docs/work/PRD-WORK-RUNTIME-PROVIDER-FIRST-LOGIN-ADOPTION-HOTFIX-v1.8.md` v1.8.2  
**Work item:** PRD-WORK-RUNTIME-PROVIDER-FIRST-LOGIN-ADOPTION-HOTFIX-V1.8  
**Grounded commit:** `d32fb43b303c792cdf1a3b3df625f1816b704774`  
**Evidence freshness:** GROUNDED（对照 `apps/work` 当前 inspect / applyReady / purgeRuntime / rememberAdoption / auth-ipc）  
**Grilling:** CLOSED 2026-10-09（HF-G-01～HF-G-11，用户确认共享理解）  
**Clarification provider:** grilling Round 1–2  

本 review 按 G1–G7 独立判断。不授权实现，不进入 Plan。status 仍为 DRAFT，须用户改为 APPROVED 后才能写 `.plan.md`。

审查中对 v1.8.1 的四处合同缺陷已回写为 v1.8.2（见 Findings 已关闭）。下列判断针对 **v1.8.2**。

## G1 Scope

PASS。范围收在 `apps/work` Runtime Provider 处理逻辑：auxiliary 就地捕获、active-model 不得伪造原值、login/splash 传 Profile、logout 不再被 MISSING 卡住。明确排除 hermes-builder / 预置 JSON / 密钥落盘 / YAML 整文件重写 / 新 UI。现场 P0 从「干净 localhost 首次 capture」（源码已如此）纠正为「yaml 已是 nodeskclaw 且无 sidecar 必须能 ACTIVE」，与 `hotfix.md` 和 inspect 源码一致。

## G2 Existing Capability / Duplicate Owner

PASS。无新生产模块。Owner 仍是 `inspectAuxiliaryAdoption`、`applyReady`、`rememberAdoption`、`auth-ipc`、`purgeRuntime`。没有第二套 adoption 文件格式，没有新 IPC channel。

## G3 Production Ownership

PASS。就地捕获的唯一写入点是现有 `writeAuxiliaryAdoption(snapshot.files.config)`。禁止从安装包、default Profile 或内置默认值合成 sidecar。`rememberAdoption` 在已是 nodeskclaw 时继续不是写入点（禁止把 nodeskclaw 写成原值）。logout 还原仍只消费已有 sidecar，缺失则跳过。

## G4 Change Classification

PASS。MISSING-block 分支 REMOVE；inspect `capture`/`reuse`/`INVALID` KEEP；IDENTITY_CONFLICT 与 POST_APPLY_DRIFT KEEP。v1.8.2 纠正了把 `AUXILIARY_ROUTING_DRIFT` 误写成 inspect block 的分类错误：预检 DRIFTED 走 PROJECT，post-check 才 `RUNTIME_PROVIDER_POST_APPLY_DRIFT`。这与 `runtime-provider-integrity.ts` / `applyReady` 一致。

## G5 API / IPC / Auth / Contract / Security Boundary

PASS。

- 不改 Portal 登录成功合同（v1.6 KEEP），不把 Runtime ERROR 伪装成登录失败。
- 不把 apiKey 写入 yaml/sidecar。
- 不预置 sidecar 进 MSI。
- 就地捕获禁止猜 `localhost`。
- 可观察错误码：capture 写盘失败钉死 `RUNTIME_PROVIDER_PROJECT_FAILED`，且必须在 `applyReady` 内接住（当前源码里 `writeAuxiliaryAdoption` 在 PROJECT `try` 外，Plan 必须包起来）。
- `RUNTIME_AUXILIARY_ADOPTION_MISSING` 保留在联合类型，生产 apply/logout 不再 emit。

## G6 Behaviour → Acceptance Criteria

PASS。grilling 决定都有对应 AC：

| 行为 | AC |
|---|---|
| 已是 nodeskclaw + 无 sidecar → 就地捕获并 ACTIVE，不改 localhost | AC-01 |
| 非 nodeskclaw 无 sidecar 仍 capture | AC-02 |
| capture 写盘失败不 PROJECT，码为 PROJECT_FAILED | AC-03 |
| PROJECT 失败后 sidecar 仍在，下次 reuse | AC-04 |
| 损坏 sidecar → INVALID | AC-05 |
| 不创建「原值=nodeskclaw」的 active-model json | AC-06 |
| 已有 localhost adoption json 不覆盖 | AC-07 |
| login/splash 传 `getActiveProfileNameSync()` | AC-08 |
| 登录成功进主界面；其它 Runtime ERROR 仍可见 | AC-09 |
| 登出缺 sidecar → UNBOUND，不改 provider | AC-10 |
| 无 MSI json / 无密钥落盘 / 无新 UI | AC-11 |
| 既有 CONFLICT / DRIFT / INVALID 回归 | AC-12 |
| 就地捕获 → 登出 → 再登录可再次 capture 到 ACTIVE | AC-13 |

## G7 Acceptance / Blocking / Evidence Integrity

PASS。AC 可观察、可测，绑定现有错误码与文件名，没有把 Plan 符号写进需求。grilling 已 CLOSED。残留风险（登出后 yaml 仍为 nodeskclaw、密钥已清）与 hotfix.md §3.1 YAML 写入安全被明确 Out of Scope，没有假装已修。

## Findings

### 已关闭（v1.8.1 → v1.8.2，审查中回写）

1. **必须修复** 把 `AUXILIARY_ROUTING_DRIFT` 写成 inspect block。已改为预检 DRIFTED → PROJECT，post-check KEEP。
2. **必须修复** capture 写盘失败码写成「PROJECT_FAILED 或其它」。已钉死 `RUNTIME_PROVIDER_PROJECT_FAILED` 且必须在 `applyReady` 内接住。
3. **必须修复** AC-06「文件仍不存在或实现保证不创建」含糊。已改为 apply 后文件仍不存在。
4. **必须修复** 缺登出后再登录循环。已加 AC-13。

### 建议修改（不挡 APPROVED）

1. **登出后的运行窗口。** AC-10 之后、再次登录之前：yaml 仍可能是 `nodeskclaw`，内存密钥已清，Gateway 已按 logout 重启。独立 Hermes 或用户立刻调模型会失败。这是 HF-G-08 的代价，但正文只写了「Setup 模型不会自动回来」，没写「登出后到再登录前企业模型也没有钥」。建议在 §6.6 加一句，避免现场当成回归。
2. **`recoveryActions`。** 今天 MISSING 只有 `export`、没有 `retry`。本包不再 emit MISSING 后该分支变死码。Plan 不必为 MISSING 补 retry；也不必在本 PRD 扩 UI 动作表。

### 仅供参考

1. logout 遇到 **损坏** sidecar 仍 `INVALID`、可能到不了 UNBOUND。grilling 只关了「文件缺失」。KEEP v1.0，损坏文件本就不应当原值。
2. hotfix.md §3.1 YAML 文本拼接 / overwrite 非事务仍是真实风险，本包明确不做。不要在实现时借机重写 `upsertBlockChild`。
3. `AuxiliaryAdoptionDecision` 联合类型仍含 `MISSING` 作为 block error。PRD 允许类型残留；inspect 实现不得再返回该变体。

## Residual risks (accepted)

- 就地捕获没有 active-model sidecar 时，登出不还原 Hermes Setup 的 `localhost` 模型。
- 密钥仍仅内存；进程重启必须再次 bootstrap。
- YAML 整文件安全重写不在本包。

## Verdict

**PASS。** 可以作为独立审批对象。用户将 status 改为 `APPROVED` 之后才能写 Plan。建议修改第 1 条可在 APPROVED 前顺手补进 §6.6，不补也不构成拒绝。禁止从本 review 直接改生产代码。
