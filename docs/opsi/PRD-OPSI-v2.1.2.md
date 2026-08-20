# PRD-OPSI-v2.1.2 — Work Hermes Local Runtime Connection Contract Stabilization

**项目**：SMC Copilot  
**文档类型**：工程实施 PRD  
**版本**：v2.1.2  
**适用模块**：`apps/work`  
**目标分支**：`opsi/prd-2.0`  
**目标平台**：Windows 10 / Windows 11 x64  
**状态**：Implementation Ready  
**日期**：2026-08-20

---

## 1. 版本定位

OPSI 已负责 Hermes 的安装、升级、修复、Gateway 启停和 Endpoint 生命周期治理；Work 只负责发现本机 Managed Hermes Runtime、校验 CLI、探测 Gateway Health/Auth，并消费 Chat、Session、Tool、Skill 数据面。

本版本冻结两条相互独立的契约：

```text
Control Owner
= 谁负责 Hermes 生命周期

Runtime Adapter
= Work 如何确认并消费本机 Hermes
```

核心约束：

> OPSI 决定 Hermes 由谁管理；LegacyLocalRuntimeAdapter 决定 Work 如何确认并消费本机 Hermes。两者不得再次耦合。

## 2. 背景与问题

Work 当前故障终端显示：

```text
Connection state   runtime_invalid
Error              Hermes Agent is not ready
Hermes Home        C:\ProgramData\SMC\Hermes
Gateway endpoint   http://127.0.0.1:8642
Hermes version     —
```

源码中同时存在三套 `HermesRuntimeAdapter` 相关实现：

```text
LegacyLocalRuntimeAdapter
HermesAvailabilityBackend
RuntimeServiceAdapter
```

当前 `RuntimeManager` 已默认构造 `LegacyLocalRuntimeAdapter`，符合 OPSI Managed Consumer 模型；但历史 Backend、生产期 adapter 注入、IPC/Startup 引用、Control Owner 分支和旧打包产物仍可能让实际安装包走到其他路径。

客户端错误文本 `Hermes Agent is not ready` 来自 `HermesAvailabilityBackend`，而当前 `LegacyLocalRuntimeAdapter` 的 Runtime Invalid 文案为 `Hermes Agent runtime directory structure is invalid.`。该差异说明必须同时验证生产依赖图和最终打包产物身份，不能只以源码单测证明终端行为。

## 3. 当前架构基线

```text
OPSI
 ├── Hermes install / upgrade / repair
 ├── Gateway lifecycle
 └── Endpoint governance

apps/work
 ├── Runtime discovery
 ├── CLI/version validation
 ├── Gateway health/auth probe
 └── Chat / Session / Tool / Skill calls
```

目标连接链：

```text
Renderer
   ↓
Main IPC
   ↓
RuntimeManager.ensureReady(profile)
   ↓
LegacyLocalRuntimeAdapter.ensureReady()
   ↓
Home + CLI + Gateway Health + Gateway Auth
   ↓
READY
   ↓
Gateway API :8642
```

Work 不得安装、spawn、kill、restart 或 upgrade Hermes。

## 4. 非目标

本版本不做：

- 不修改 Hermes Gateway API、`127.0.0.1:8642` 数据面协议、`/v1/*`、WebSocket、Runs 或 TUI transport。
- 不降低 readiness 为仅 Gateway Health；不取消 Hermes Home、CLI/version 或 Gateway Auth 校验。
- 不恢复 `Work → services/runtime :8765 → Hermes`。
- 不让 Work 调 OPSI Control API 启动、修复或安装 Hermes。
- 不修改 Hermes 安装目录、OPSI MSI/EXE、Hermes 模型配置或 Chat Transport。
- 不迁移 Hermes 数据、Home、Gateway 协议、OPSI Schema 或数据库。
- 不强制物理删除历史 Adapter 文件；本版本只保证其退出生产 Runtime Connection 主链。

## 5. Connection Readiness Contract

### 5.1 状态机

```text
runtime probe
    ↓
Hermes Home / CLI
    ├── missing → runtime_missing
    └── found
          ↓
      Runtime Valid?
          ├── false → runtime_invalid
          └── true
                ↓
            Gateway Health
                ├── false → gateway_unreachable
                └── true
                      ↓
                  Gateway Auth
                      ├── fail → gateway_auth_failed
                      └── pass → ready
```

### 5.2 READY 定义

```text
READY =
    runtimeFound
 && runtimeValid
 && cliAvailable/runtimeVersionAvailable
 && gatewayHealthy
 && authenticated
```

Gateway 健康但 CLI 缺失时必须保持 `runtime_invalid`，不得进入 READY。

## 6. FR-212-01 — RuntimeManager 唯一默认 Adapter

`apps/work/src/main/runtime/runtime-manager.ts` 的生产默认值必须固定为：

```ts
constructor(adapter?: HermesRuntimeAdapter) {
  this.adapter = adapter ?? new LegacyLocalRuntimeAdapter();
}
```

禁止生产默认构造：

```ts
new RuntimeServiceAdapter()
new HermesAvailabilityBackend()
```

测试可以通过 constructor dependency injection 替换 Adapter。

## 7. FR-212-02 — Adapter 注入管控

生产代码不得调用 `runtimeManager.setAdapter(...)` 改变正式 Backend。

首选方案是删除生产可见的 `setAdapter()`，仅保留 constructor injection 与 `setRuntimeManagerForTests()`。若现有测试迁移无法在本版本完成，可临时保留，但必须：

- 标记为 `@internal test-only`。
- 仅允许 `*.test.ts`、`*.spec.ts`、`test/`、`tests/`、`fixtures/` 调用。
- 由静态 Gate 拒绝生产源调用。

## 8. FR-212-03 — HermesAvailabilityBackend 隔离

`apps/work/src/main/hermes/availability-backend.ts` 本版本可保留用于独立诊断、测试或未来 Endpoint observation，但不得用于：

- `runtime-probe-local`
- `runtime-get-status`
- `runtime-ensure-ready`
- Chat readiness
- Startup Connection Ready

`HermesAvailabilityBackend` 不得进入正式 Electron Main dependency graph 的 Runtime Connection 主链。

## 9. FR-212-04 — RuntimeServiceAdapter 隔离

`apps/work/src/main/runtime/runtime-service-adapter.ts` 属于历史 Runtime Service 架构，可暂时保留迁移兼容，但不得被 RuntimeManager、IPC、Chat、Startup 或 Control Owner 作为默认 Runtime Connection 引用。

禁止恢复：

```text
RuntimeManager
   ↓
RuntimeServiceAdapter
   ↓
services/runtime :8765
   ↓
Hermes
```

## 10. FR-212-05 — Control Owner 解耦

`owner=opsi` 仅表示 OPSI 拥有以下生命周期能力：

```text
Install / Upgrade / Repair / Start / Stop / Restart
```

它不得改变 Runtime Adapter、Runtime discovery、CLI validation、Gateway probe 或 Chat transport。

当环境变量或 `%ProgramData%\SMC\control-owner.json` 指定：

```json
{
  "hermes": "opsi"
}
```

Runtime Connection 仍必须是：

```text
RuntimeManager → LegacyLocalRuntimeAdapter
```

Probe/Health/Auth/Chat 在 READY 时允许；Install/Restart 等生命周期操作必须拒绝并显示 enterprise-managed 提示。

## 11. FR-212-06 — IPC 与 Chat 调用链

以下本地 Runtime IPC 必须统一通过 singleton `getRuntimeManager()`：

- `runtime-probe-local`
- `runtime-get-status`
- `runtime-ensure-ready`
- 本地 Chat send 前的 readiness

所有本地 Chat 请求发送前继续调用 `RuntimeManager.ensureReady(profile)`。Renderer、Chat、Startup 不得直接实例化 `HermesAvailabilityBackend` 或 `RuntimeServiceAdapter`。

Remote/SSH connection mode 保持现有旁路，不纳入本地 Managed Runtime Gate。

## 12. FR-212-07 — Startup 生产依赖图

`apps/work/src/main/app/start.ts::startMainProcess()` 负责注册 IPC、创建窗口和应用生命周期，但不得：

```text
setAdapter(...)
new HermesAvailabilityBackend()
new RuntimeServiceAdapter()
```

Main Process 启动后本地 Connection Ready 必须收敛到唯一 `RuntimeManager` singleton。

## 13. FR-212-08 — Gateway 生命周期能力

`LegacyLocalRuntimeAdapter` 只允许：

```text
probe / connect / diagnose
```

禁止：

```text
spawn / kill / restart / install / upgrade / repair
```

`ensureReady()` 必须是 probe-only。`restart()` 和相应 IPC/UI 操作必须返回 managed runtime 错误或企业托管提示，不得调用 `RuntimeManagementBackend`、旧 Runtime Service 或本地进程启动函数。

现有 `check-no-work-gateway-spawn.mjs` 中要求本地 `start-gateway` 调用 `RuntimeManagementBackend` 的旧断言与本契约冲突，必须替换为“生产本地路径拒绝 lifecycle”的新 Gate。

## 14. FR-212-09 — Hermes Transport 保持不变

本地 Gateway URL 继续由 `getGatewayBaseUrl()` 提供，默认 `http://127.0.0.1:8642`。本版本不修改 `getApiUrl()`、Gateway API、WebSocket、Runs transport、TUI transport 或 Remote/SSH Connection Config。

## 15. FR-212-10 — Build Artifact Identity

Work build 必须生成并打入最终 Electron 安装包：

```text
work-build-info.json
```

Schema：

```json
{
  "schema": "smc.work.build.v1",
  "version": "2.1.2",
  "gitCommit": "<full-commit>",
  "gitBranch": "opsi/prd-2.0",
  "buildTime": "2026-08-20T00:00:00Z",
  "runtimeAdapter": "legacy-local",
  "runtimeContract": "managed-local-v1"
}
```

约束：

- `gitCommit` 必须来自实际构建 checkout；Release Build 默认拒绝 dirty source 或明确记录非正式状态。
- `runtimeAdapter`、`runtimeContract` 必须由构建配置/代码常量的单一 SOT 生成，不得靠人工编辑 JSON。
- 最终 `app.asar`/resources 或安装目录中必须可读；Release validation 必须 read-back 并核对 manifest、app version 和 commit。
- Dev build 可使用可识别的 `dev/unknown` 值，但不得进入正式发布。

## 16. FR-212-11 — Startup Identity Logging

Main Process 启动阶段必须输出结构化、可检索的 Build/Runtime 身份：

```text
[WORK]
version=2.1.2
commit=<sha>
runtimeAdapter=legacy-local
runtimeContract=managed-local-v1
controlOwner=opsi
```

该日志只证明版本、adapter contract 与 lifecycle owner，不得输出凭据。

## 17. FR-212-12 — Runtime Diagnostic Logging

`RuntimeManager.probe()` 在状态变化时输出结构化事件；相同状态与相同关键字段不得无界重复刷屏。

示例：

```json
{
  "event": "hermes_runtime_probe",
  "profile": "default",
  "state": "runtime_invalid",
  "runtimeFound": true,
  "runtimeValid": false,
  "cliAvailable": false,
  "gatewayHealthy": false,
  "authenticated": false,
  "homePath": "C:\\ProgramData\\SMC\\Hermes",
  "executablePath": "D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe",
  "endpoint": "http://127.0.0.1:8642",
  "adapter": "legacy-local"
}
```

禁止输出 API Key、Bearer Token、`.env` secrets、Provider credentials 或认证响应体。

## 18. FR-212-13 — UI 状态与操作

Waiting/Connection 页面保留，状态文案统一映射：

```text
runtime_missing       Hermes runtime not found
runtime_invalid       Hermes runtime is invalid
gateway_unreachable   Hermes Gateway is unreachable
gateway_auth_failed   Hermes Gateway authentication failed
ready                 Connected
```

当 `owner=opsi`：

- Retry 只重新 probe。
- Restart 显示企业托管提示。
- UI 不启动、重装或重启 Gateway，也不调用 OPSI。

实际安装后的错误消息必须与 build identity 对应的源码版本一致。

## 19. FR-212-14 — Hermes Version

Hermes version 必须由正式 `LegacyLocalRuntimeAdapter`/统一 CLI consumer 获取。获取失败时允许 `version=undefined`，但 CLI 不可用且无法获取版本必须判定为 `runtime_invalid`。

Version 不替代 Gateway Health/Auth，也不单独决定 READY。本版本不重构 Version Store。

## 20. 自动化测试要求

### 20.1 Readiness 状态矩阵

| Home | CLI | Gateway | Auth | Expected |
| --- | --- | --- | --- | --- |
| false | — | — | — | `runtime_missing` |
| true | false | running | — | `runtime_invalid` |
| true | true | false | — | `gateway_unreachable` |
| true | true | true | false | `gateway_auth_failed` |
| true | true | true | true | `ready` |

### 20.2 Adapter Regression

新增固定测试证明 `new RuntimeManager()` 使用 `LegacyLocalRuntimeAdapter`，且不会构造 `RuntimeServiceAdapter` 或 `HermesAvailabilityBackend`。

### 20.3 OPSI Owner Regression

输入 `{"hermes":"opsi"}` 后验证：

- Runtime Adapter 仍为 `LegacyLocalRuntimeAdapter`。
- Probe、Gateway Health/Auth 和 READY 后 Chat 允许。
- Install、spawn、stop、restart、upgrade 被拒绝。
- Control Owner 改变不重建、不替换 Runtime Adapter。

### 20.4 IPC/Startup Regression

静态与行为测试证明 Runtime IPC、Chat readiness、Startup 都只通过 `getRuntimeManager()`；生产目录不得出现其他 Backend 的构造或 `setAdapter()` 调用。

## 21. Packaged App Test

Packaged App Gate 必须针对 electron-builder 最终安装包/`app.asar`，不能只运行 `npm test`、`npm run dev` 或未打包 `out/main`。

最小步骤：

```text
Build Windows package
  ↓
Read back work-build-info.json
  ↓
Assert runtimeAdapter=legacy-local
  ↓
Install and launch Work
  ↓
Verify startup identity log
  ↓
Verify runtime probe reaches READY
  ↓
Send one real Chat request
```

Fixture/smoke 可以验证结构，但不得作为真实 Windows packaged proof。

## 22. CI Gates

### Gate 1 — Runtime Adapter Static Gate

扫描生产 TypeScript，禁止：

```text
RuntimeManager default = RuntimeServiceAdapter
RuntimeManager default = HermesAvailabilityBackend
production .setAdapter(...)
```

允许测试、spec、fixtures 中显式注入。

### Gate 2 — Production Dependency Graph Gate

Main entry、Startup、IPC 和 Chat 生产 bundle 不得把 `HermesAvailabilityBackend`、`RuntimeServiceAdapter` 或 Runtime Service client 作为本地 readiness 路径。

### Gate 3 — Packaged Build Identity Gate

最终 Electron artifact 必须包含合法 `work-build-info.json`，且 read-back 得到 `runtimeAdapter=legacy-local`、`runtimeContract=managed-local-v1`、与 release provenance 一致的 version/commit。

### Gate 4 — Managed Owner Contract Gate

`owner=opsi` 不得触发 spawn、kill、restart、install、upgrade 或 Runtime `:8765`；READY 后 Chat 仍走 Gateway `:8642`。

## 23. 终端验收矩阵

### Case A — Full Ready

Home、CLI、Gateway、Auth 全部正常：状态 `ready`，Chat 可用。

### Case B — CLI Missing

Home 正常、Gateway 可访问但 CLI 缺失：状态必须为 `runtime_invalid`。

### Case C — Gateway Down

Home 与 CLI 正常、Gateway 不可达：状态 `gateway_unreachable`，Work 不自动启动 Gateway。

### Case D — Authentication Failed

Home、CLI、Gateway Health 正常但 Auth 失败：状态 `gateway_auth_failed`。

### Case E — OPSI Owner

`owner=opsi` 且 Runtime READY：Adapter 仍为 `legacy-local`，Chat 成功；Retry 只 probe，Restart 被拒绝。

## 24. Release 与回滚

本版本回滚只替换 Work 应用为上一稳定安装包，不操作：

```text
C:\ProgramData\SMC\Hermes
Hermes config / profiles / sessions
Gateway Scheduled Task
OPSI state
```

回滚包仍必须能通过自身 build identity 证明版本和 commit。

## 25. Acceptance Criteria

- **AC-21201**：Work 默认 Runtime Adapter 固定为 `LegacyLocalRuntimeAdapter`。
- **AC-21202**：`HermesAvailabilityBackend` 不进入正式 local readiness 主链。
- **AC-21203**：`RuntimeServiceAdapter` 和 `services/runtime :8765` 不进入正式 local readiness 主链。
- **AC-21204**：`owner=opsi` 不改变 Runtime Adapter。
- **AC-21205**：Work 不 spawn、stop、restart、install 或 upgrade Hermes/Gateway。
- **AC-21206**：READY 继续要求 Runtime/CLI/Gateway Health/Auth 全部通过。
- **AC-21207**：Gateway 健康但 CLI 缺失时返回 `runtime_invalid`。
- **AC-21208**：本地 Chat 发送前继续调用 `RuntimeManager.ensureReady()`。
- **AC-21209**：最终安装包可识别 version、Git commit、runtime adapter 和 runtime contract。
- **AC-21210**：实际安装后的错误文本与对应 build identity 的源码一致。
- **AC-21211**：Windows packaged test 可进入 READY 并完成至少一次真实 Chat。
- **AC-21212**：OPSI Managed Hermes 不被 Work lifecycle API 操作。

## 26. No-Go 条件

以下任一存在，不允许发布：

- 生产代码或最终 Main bundle 默认构造非 `LegacyLocalRuntimeAdapter`。
- `owner=opsi` 导致 Runtime Adapter 切换或访问 Runtime `:8765`。
- Retry/Restart/Startup/IPC 能 spawn、kill 或 restart Gateway。
- Gateway Health 单独满足 READY，或 CLI/Auth Gate 被绕过。
- 本地 Chat 绕过 `RuntimeManager.ensureReady()`。
- 最终安装包缺失/无法读取 build identity，或 identity 与 release provenance 不一致。
- Packaged artifact 的 runtime error 文案与对应 commit 源码不一致。
- 日志泄露 API key、Bearer token、`.env` 或 Provider credentials。
- 仅以 unit/dev/smoke 结果代替真实 Windows packaged proof。

## 27. Definition of Done

v2.1.2 完成必须同时满足：

1. RuntimeManager、IPC、Startup、Chat readiness 的生产主链唯一指向 `LegacyLocalRuntimeAdapter`。
2. Control Owner 只控制 Lifecycle Capability，不控制 Runtime Adapter。
3. Work 仅发现、探测、诊断和消费 Hermes；所有生命周期操作由 OPSI 拥有。
4. Readiness 状态矩阵、Adapter/Owner regression、生产依赖图和 secret-redaction tests 全部通过。
5. 最终 Windows 安装包包含可 read-back 的 `work-build-info.json`，启动日志与该身份一致。
6. 在真实 OPSI Managed Hermes Endpoint 上，标准用户启动 Work 后达到 READY，并完成至少一次真实 Chat。
7. 人工验收证明 CLI 缺失、Gateway Down、Auth Failed 与 OPSI Restart denied 均呈现规定状态，且 Work 没有创建第二个 Gateway 进程。

## 28. 最终架构基线

```text
                  Control Plane
                       │
                       ▼
                ┌────────────┐
                │    OPSI    │
                └─────┬──────┘
                      │ install / update / lifecycle
                      ▼
              ┌───────────────┐
              │ Hermes Agent  │
              │ Home / CLI    │
              │ Gateway :8642 │
              └───────▲───────┘
                      │ Gateway API
              ┌───────┴────────┐
              │   apps/work    │
              │ RuntimeManager │
              │       ↓        │
              │ LegacyLocal    │
              │ RuntimeAdapter │
              │ Probe/Auth     │
              └────────────────┘
```

自动化实现完成不等于 Release GO；最终 Windows packaged proof 必须由操作员执行并签署。
