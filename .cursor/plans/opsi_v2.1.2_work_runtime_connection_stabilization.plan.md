---
name: OPSI v2.1.2 Work Runtime Connection Stabilization
overview: 冻结 apps/work 的本地 Hermes Connection Ready 主链为 RuntimeManager → LegacyLocalRuntimeAdapter，彻底解耦 OPSI Control Owner 与 Runtime Adapter，阻止 RuntimeService/HermesAvailability 历史 Backend 回流，并用 packaged build identity 与真机回归证明源码、构建和终端行为一致。
todos:
  - id: freeze-runtime-adapter
    content: 固定 RuntimeManager 唯一生产默认 Adapter，收敛 setAdapter 测试注入并增加生产静态 Gate
    status: completed
  - id: decouple-owner-lifecycle
    content: 解耦 owner=opsi 与 Runtime Adapter，禁止 Work 本地 lifecycle/RuntimeService 路径并替换冲突的旧 Gateway guard
    status: completed
  - id: unify-ipc-startup-readiness
    content: 审计并统一 Runtime IPC、Startup、UI Retry 与 Chat readiness 全部通过 getRuntimeManager 和完整 readiness 状态机
    status: completed
  - id: packaged-build-identity
    content: 生成并打包 work-build-info.json，输出安全 startup/probe identity 日志并完成 artifact read-back Gate
    status: completed
  - id: automated-regression-gates
    content: 补齐 readiness、Adapter、OPSI owner、dependency graph、日志脱敏与 packaged artifact 自动化回归
    status: completed
  - id: manual-windows-packaged-proof
    content: 人工在 OPSI Managed Windows Endpoint 安装最终 Work 包，验证 READY/失败矩阵、无 Gateway lifecycle 与一次真实 Chat；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v2.1.2 Work Runtime Connection Stabilization

## 结果与边界

要实现：

- `RuntimeManager` 的生产默认 Adapter 唯一固定为 `LegacyLocalRuntimeAdapter`，测试替换仅允许 constructor injection/test helper。
- `owner=opsi` 只限制 Install/Upgrade/Repair/Start/Stop/Restart，不影响 Runtime discovery、CLI、Gateway Health/Auth 或 Chat transport。
- Runtime IPC、Startup Connection Ready、UI Retry 和本地 Chat send 全部通过 `getRuntimeManager()`；完整 readiness contract 不降级。
- `HermesAvailabilityBackend`、`RuntimeServiceAdapter`、Runtime `:8765` 与旧 lifecycle backend 退出正式 local Runtime Connection dependency graph。
- 最终 Electron artifact 内含可 read-back 的 `work-build-info.json`，startup/probe 日志可证明 version、commit、adapter、contract、owner，且不泄露 secrets。
- 自动化 Gate 与真实 Windows packaged proof 共同证明源码、打包和终端安装行为一致。

明确不做：

- 不修改 Hermes Gateway API、`127.0.0.1:8642` 数据面、Chat transport、Remote/SSH transport 或 Hermes 模型配置。
- 不恢复 `services/runtime`，不让 Work 调 OPSI Control API，不修改 OPSI MSI/EXE 或 Hermes 路径布局。
- 不降低 READY 为 Gateway Health only，不取消 Home/CLI/Auth 检查。
- 不强制删除历史 Adapter 源文件；只保证它们不在生产主链。
- 不迁移 Hermes Home、config、profiles、sessions、OPSI state 或数据库。
- 不自动完成 Windows Live Evidence、签名、Release GO 或生产发布。

## 上下文路由

立即读取：

- [`AGENTS.md`](AGENTS.md)：OPSI provider isolation 与 Work Direct Gateway 基线。
- [`apps/work/AGENTS.md`](apps/work/AGENTS.md)：`lat` 检索、文档与 post-task gate。
- [`docs/opsi/PRD-OPSI-v2.1.2.md`](docs/opsi/PRD-OPSI-v2.1.2.md)：全部 FR、AC、No-Go、DoD。
- [`apps/work/lat.md/runtime-connection.md`](apps/work/lat.md/runtime-connection.md)：Managed Runtime Consumer 的当前架构 SOT。
- [`apps/work/src/main/runtime/runtime-manager.ts`](apps/work/src/main/runtime/runtime-manager.ts)：默认 Adapter、singleton、test injection。
- [`apps/work/src/main/runtime/legacy-local-runtime-adapter.ts`](apps/work/src/main/runtime/legacy-local-runtime-adapter.ts)：完整 probe/ensureReady/restart 行为。
- [`apps/work/src/main/hermes/control-owner.ts`](apps/work/src/main/hermes/control-owner.ts)：lifecycle owner 解析与 managed message。
- [`apps/work/src/main/ipc/register.ts`](apps/work/src/main/ipc/register.ts)：Runtime IPC、Chat readiness 与 lifecycle handlers。
- [`apps/work/src/main/app/start.ts`](apps/work/src/main/app/start.ts)：Main Process dependency graph 入口。

按触发读取：

- Adapter 隔离时读取 `availability-backend.ts`、`runtime-service-adapter.ts` 及直接 imports/tests，不扫描 references 或构建输出。
- UI 状态时读取 RuntimeProvider、Waiting/Connection Error 页面和 runtime-errors 映射的直接调用方。
- Build identity 时读取 `electron-builder.yml`、`electron.vite.config.*`、`scripts/build-work-release.ps1`、`validate-work-release.ps1` 与 release guard helper。
- 测试时读取现有 `runtime-adapter.test.ts`、enterprise OPSI/Salt tests、release builder/PowerShell integration tests。

禁止预加载：

- `apps/work/references`、历史 PRD、无关 renderer 模块、dist/out/build artifacts、Runtime 数据、归档 evidence。

## 当前事实与根因锚点

- `RuntimeManager` 当前已经默认 `new LegacyLocalRuntimeAdapter()`；本计划以冻结和防回归为主，不重复重写。
- `HermesAvailabilityBackend` 仍由 `src/main/hermes/index.ts` 导出，并在 enterprise OPSI/Salt tests 中直接实例化；测试用途与生产 dependency graph 必须区分。
- `RuntimeServiceAdapter` 仍保留 Runtime Service fallback；允许源码存在，但不得被生产 Main/IPC/Chat/Startup 导入。
- 当前 `check-no-work-gateway-spawn.mjs` 反而要求 local `start-gateway` 调 `RuntimeManagementBackend().startGateway()`，与“Work 不拥有 Gateway lifecycle”冲突，是本计划必须替换的直接根因锚点。
- 当前 Release metadata 已记录 `gitCommit`，但没有可随最终 app read-back 的 `runtimeAdapter/runtimeContract` identity。

## 最小方案判定

- Adapter：保留现有 interface 和 singleton；删除/限制生产 mutation，不引入第二个 factory、registry 或 owner-based router。
- Lifecycle：复用现有 managed error contract，关闭/拒绝旧启动入口，不增加 OPSI RPC client。
- Static Gate：扩展/替换现有 Work guard 并使用 AST/受控 source scan；不以易误报的全仓裸字符串扫描 references/tests。
- Build identity：生成一个 schema v1 JSON，由 release build 单一入口写入并由 electron-builder 打包；不新增第二套 release manifest。
- Logging：复用现有 logger，按状态变化输出一个结构化事件；不新建遥测服务。

## Todo — Freeze Runtime Adapter

### 结果

- 保留 `RuntimeManager(adapter?)` 默认 `LegacyLocalRuntimeAdapter`，增加可直接证明默认实例类型/行为的测试。
- 优先移除 `setAdapter()`；若仍被测试依赖，改为明确 `@internal test-only` 并禁止生产调用。
- 新 static guard 只扫描 production sources，拒绝 `new RuntimeServiceAdapter`、`new HermesAvailabilityBackend` 和 `.setAdapter(` 进入 Main/IPC/Startup/Chat local readiness。
- 测试目录可以显式构造历史 Backend 做单元隔离测试，但不得成为生产路由的证明。

### 实施锚点

- 主锚点：[`apps/work/src/main/runtime/runtime-manager.ts`](apps/work/src/main/runtime/runtime-manager.ts)。
- 候选触碰：`apps/work/tests/runtime-adapter.test.ts`、新增或扩展 `apps/work/scripts/check-runtime-adapter-contract.mjs`、`apps/work/package.json` guard chain。

### 变更预算与验证

- 新 guard 文件最多 1；新增 dependency/API/registry 0；优先扩展现有 test/guard。
- 最小验证：在 `apps/work` 运行 `npm test -- runtime-adapter.test.ts`、新 static guard、`npm run typecheck:node`。
- 停止条件：[ ] 默认 Adapter 唯一且生产不可变；测试注入仍可用；production source 的其他 Backend 构造 fail closed。

## Todo — Decouple OPSI Owner & Lifecycle

### 结果

- `owner=opsi` 只返回 lifecycle denied/managed messaging；RuntimeManager 构造和 adapter identity 不读取 owner。
- local `start-gateway`、`stop-gateway`、`restart-gateway`、install/update/repair handlers 不调用 RuntimeManagementBackend、Runtime Service 或本地 process spawn。
- 替换 `check-no-work-gateway-spawn.mjs` 中“必须调用 RuntimeManagementBackend.startGateway”的旧断言为“必须拒绝 local lifecycle”的行为/static Gate。
- `LegacyLocalRuntimeAdapter.ensureReady()` 保持 probe-only，`restart()` 返回 `MANAGED_RUNTIME_RESTART_REQUIRED` 或既有等价 managed error。

### 实施锚点

- 主锚点：[`apps/work/src/main/hermes/control-owner.ts`](apps/work/src/main/hermes/control-owner.ts) 与 [`apps/work/src/main/ipc/register.ts`](apps/work/src/main/ipc/register.ts)。
- 候选触碰：`legacy-local-runtime-adapter.ts`、`check-no-work-gateway-spawn.mjs`、`enterprise-opsi-mode.test.ts`。

### 变更预算与验证

- 新 OPSI client/service 0；不改 Gateway transport；只收敛现有 handlers/guards。
- 最小验证：`npm test -- enterprise-opsi-mode.test.ts runtime-adapter.test.ts` 与 `npm run guard`。
- 停止条件：[ ] owner 切换不改变 adapter；OPSI 模式 lifecycle 全拒绝；probe/READY/Chat 能继续工作。

## Todo — Unify IPC, Startup & Readiness

### 结果

- `runtime-probe-local`、`runtime-get-status`、`runtime-ensure-ready` 和本地 Chat send 前置检查统一调用 `getRuntimeManager()`。
- `startMainProcess()` 不构造/注入其他 Backend，不按 owner 切换 adapter。
- RuntimeProvider/Waiting UI 的 Retry 只 probe；Restart 呈现 enterprise-managed，不触发生命周期。
- 状态映射固定为 `runtime_missing/runtime_invalid/gateway_unreachable/gateway_auth_failed/ready`；CLI missing 即使 Gateway healthy 也保持 invalid。
- Remote/SSH bypass 保持现状，本计划不将其错误纳入 local gate。

### 实施锚点

- 主锚点：[`apps/work/src/main/ipc/register.ts`](apps/work/src/main/ipc/register.ts) 的 Runtime/Chat handlers。
- 候选触碰：[`apps/work/src/main/app/start.ts`](apps/work/src/main/app/start.ts)、Renderer RuntimeProvider/Waiting UI、`runtime-errors.ts`。

### 变更预算与验证

- 不重构 Chat transport；候选生产文件限定于直接调用链。
- 最小验证：相关 IPC/RuntimeProvider tests、`npm run typecheck`、`npm run guard`。
- 停止条件：[ ] 每个 local readiness consumer 只有 RuntimeManager 路径；完整状态机测试通过；Retry/Restart 行为符合 owner contract。

## Todo — Packaged Build Identity & Diagnostics

### 结果

- Build 单一入口生成 schema `smc.work.build.v1` 的 `work-build-info.json`：version、full commit、branch、UTC buildTime、`legacy-local`、`managed-local-v1`。
- electron-builder 明确把 identity 文件纳入最终 app resources/app.asar；validate 脚本从最终 artifact/unpacked app read-back 并与 release provenance、package version 比较。
- Main startup 加载 identity 并输出结构化 version/commit/adapter/contract/owner；正式 release 对缺失、invalid、dirty/unknown commit fail closed。
- RuntimeManager 只在 probe 状态/关键字段变化时输出 `hermes_runtime_probe`，字段覆盖 Home、CLI、endpoint、health/auth、adapter；敏感值和响应体禁止进入日志。

### 实施锚点

- 主锚点：[`apps/work/scripts/build-work-release.ps1`](apps/work/scripts/build-work-release.ps1) 与 [`apps/work/electron-builder.yml`](apps/work/electron-builder.yml)。
- 候选触碰：`scripts/validate-work-release.ps1`、`scripts/lib/work-release-guard.mjs`、Main build-info loader/startup logger、RuntimeManager logger、release tests。

### 变更预算与验证

- 新生产 identity loader/constant 文件最多 1，新生成 JSON 1；不新增 release manifest 或 telemetry dependency。
- 最小验证：release script tests、builder config tests、PowerShell integration test、`build:unpack` 后 artifact read-back。
- 停止条件：[ ] 最终 artifact identity 可读且与 provenance 一致；启动/probe 日志可诊断 adapter；secret-redaction tests 通过。

## Todo — Automated Regression Gates

### 结果

- 完整 readiness matrix：Home missing、CLI missing、Gateway down、Auth failure、Full Ready。
- Adapter regression：default=LegacyLocal；生产 Main bundle 无其他 Backend local route。
- OPSI owner regression：probe/READY/Chat allowed，install/spawn/stop/restart/upgrade denied，owner change 不替换 adapter。
- IPC/Startup regression：所有 local readiness 只经过 singleton；本地 Chat 发送前 `ensureReady()`。
- Packaged identity regression：最终 unpacked/app.asar 包含合法 identity，错误文案与该 commit 的 runtime-errors/backend 一致。
- 日志测试证明 API key、Bearer、`.env`、Provider credentials 不出现。

### 实施锚点

- 候选测试：`runtime-adapter.test.ts`、`enterprise-opsi-mode.test.ts`、IPC tests、release-builder-config/work-release scripts tests。
- CI 锚点：`apps/work/package.json` 的 `guard/test/typecheck/build` 和现有 Work release workflow。

### 变更预算与验证

- 优先扩展现有测试文件；新增测试文件仅在 build identity/packaged artifact 没有合适归属时允许。
- 最小验证：`npm test`、`npm run guard`、`npm run typecheck`、`npm run build:unpack`、`npm run release:validate` 的非发布 read-back 路径。
- `lat.md/runtime-connection.md` 更新 Adapter freeze、owner/lifecycle 分离、artifact identity；随后在 `apps/work` 执行 `npx lat check`。
- 停止条件：[ ] AC-21201–21212 均映射到自动化或明确 manual gate；No-Go fail closed；Salt/Runtime/OPSI API contracts 无改动。

## Manual Windows Packaged Proof

### 人工 Runbook

1. 从 clean commit 构建最终 Windows Work 安装包，记录 artifact SHA256 和 release provenance。
2. 在 OPSI Managed Windows 10/11 Endpoint 安装；读取安装目录中的 `work-build-info.json`，确认 version/commit/adapter/contract。
3. 启动 Work，核对 startup identity：`runtimeAdapter=legacy-local`、`controlOwner=opsi`，并确认只存在 OPSI/Scheduled Task 拥有的 Gateway 进程。
4. 依次验证 Full Ready、CLI Missing、Gateway Down、Auth Failed、OPSI Restart denied 五个 Case；Retry 只能重新 probe。
5. 恢复 Runtime 后达到 READY，并完成至少一次真实 Chat；收集脱敏 startup/probe/chat evidence。
6. 回滚上一稳定 Work 包，确认 Hermes Home、Gateway Task、config/profiles/sessions 与 OPSI state 未被改动。

### Cursor 约束

- 不自动安装/卸载真实客户端，不操作 OPSI Endpoint/Depot，不使用 Production signing key，不代替操作员发送真实业务 Chat。
- 不把 unit/dev/unpacked/smoke/fixture 结果写成 packaged Live Evidence，不自动完成 manual todo，不签署 GO。

### 停止条件

- [ ] Windows packaged identity、READY/失败矩阵、无第二 Gateway 进程和真实 Chat 证据由 Work Owner、Endpoint Ops、Release Owner 签署。

## 实施顺序与合并门禁

1. 先冻结 RuntimeManager adapter 与 test injection；未冻结前不改 UI 文案。
2. 再解耦 owner/lifecycle，并替换冲突的旧 guard；生命周期 Gate 通过后再审计 IPC/Startup。
3. 统一所有 readiness consumers 和状态映射。
4. 加入 build identity、startup/probe diagnostics 与 artifact read-back。
5. 跑完整 tests/guard/typecheck/unpacked validation 和 `lat check`；自动化通过后才交给人工 Windows packaged proof。
6. Manual todo 必须保持 pending，直到三方签署。

## 跳过 / 何时再加

- 历史 Adapter 文件物理删除、Runtime Service 全树 decommission、gateway-ports 清理可在 production dependency graph 稳定后另建计划。
- Remote/SSH transport、Credential Manager/DPAPI、Hermes Version Store 和 Chat Transport 重构不属于本版。
- OPSI MSI、Hermes Runtime 打包和 Gateway protocol 变更由各自 PRD 管理，不在 Work v2.1.2 中交叉实施。
