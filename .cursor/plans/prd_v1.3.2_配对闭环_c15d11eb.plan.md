---
name: PRD v1.3.2 配对闭环
overview: 按 PRD v1.3.2 hotfix 修复 desktop 启动配对闭环：新增 Main 侧 pairAndConnect 原子事务（start→confirm→saveToken→handshake→Ready），把 PairingRequired 从 RuntimeRecovery 中拆出为独立 Pairing 屏，配对成功后经 startup gate 自动进入 Main；并覆盖 Token 持久化/吊销/过期/并发 + E2E 与 Guard。先单独提交现有修复，再把 v1.3.2 作为新 commit（不 push）。
todos:
  - id: commit-existing
    content: 提交现有未提交修复（v1.3.1 review fixes + 端口 + ProcessLock + dev migrate）
    status: completed
  - id: p1-transaction
    content: "Phase 1: RuntimePairAndConnectResult 契约 + Main pairAndConnect 事务 + IPC + Preload + 并发去重"
    status: completed
  - id: p2-pairing-ui
    content: "Phase 2: 独立 RuntimePairing 屏；PairingRequired 从 Recovery 拆出；startup 契约/路由加 runtime-pairing"
    status: completed
  - id: p3-token-lifecycle
    content: "Phase 3: 持久化级别标记 + DEVICE_REVOKED 清 token + 过期 pair-again + hydrate 顺序测试"
    status: completed
  - id: p4-startup-integration
    content: "Phase 4: 配对成功 recheck→Ready→main 自动跳转"
    status: completed
  - id: p5-tests-guard
    content: "Phase 5: pairing-manager 单测 + startup-decision 更新 + pairing-boundary guard + e2e 断言 + 文档/lat"
    status: completed
  - id: verify
    content: npm test + typecheck + guard + lat check 全过
    status: completed
  - id: commit-v132
    content: 提交 v1.3.2 为单独 commit（不 push）
    status: completed
isProject: false
---

# PRD v1.3.2 Hotfix — Desktop 配对闭环修复计划

## 现状（已探索确认）
- 无 `pairAndConnect`；Renderer 在 [RuntimeRecoveryActions.tsx](apps/desktop/src/renderer/src/screens/RuntimeRecovery/RuntimeRecoveryActions.tsx) 里两步调 `startPairing`/`confirmPairing`
- [startup-decision.ts](apps/desktop/src/main/startup/startup-decision.ts) 把 `PairingRequired` 映射到 `runtime-recovery`（PRD 禁止）
- Main 已有 [runtime-pairing-manager.ts](apps/desktop/src/main/copilot-runtime-client/runtime-pairing-manager.ts)（challenge 存 Main 内存）、[runtime-auth-store.ts](apps/desktop/src/main/copilot-runtime-client/runtime-auth-store.ts)（keytar→safeStorage→memory）、[runtime-connection-manager.ts](apps/desktop/src/main/copilot-runtime-client/runtime-connection-manager.ts)（`runRuntimeHandshake`）
- 终端确认 Runtime handshake 200，仅剩 `PAIRING_REQUIRED`

## Phase 1 — PairAndConnect 事务（Main + Contract + IPC + Preload）
- Contract：`RuntimePairAndConnectResult { ok, state, deviceId, error{code,message,retryable} }`，加入 [runtime-state-contract.ts](apps/desktop/src/shared/copilot-runtime/runtime-state-contract.ts) / shared 导出；不含 challenge/deviceToken
- Main：`pairAndConnect()` in [runtime-pairing-manager.ts](apps/desktop/src/main/copilot-runtime-client/runtime-pairing-manager.ts)：state 非 PairingRequired/Ready → `PAIRING_NOT_ALLOWED`；并发用 module 级 `inFlight` Promise 去重；confirm 失败分清 expired（`PAIRING_EXPIRED`, retryable）/其它
- IPC：[copilot-runtime-ipc.ts](apps/desktop/src/main/copilot-runtime-client/copilot-runtime-ipc.ts) 注册 `copilot-runtime:pair-and-connect`
- Preload：[copilot-runtime-api.ts](apps/desktop/src/preload/copilot-runtime-api.ts) + `index.d.ts` 暴露 `pairAndConnect()`
- 日志：仅 `[copilot-runtime] pairing start/confirmed/token persisted/ready`，不记录 secret

## Phase 2 — Pairing UI 独立拆分
- 新屏 [screens/RuntimePairing/RuntimePairingScreen.tsx](apps/desktop/src/renderer/src/screens/RuntimePairing/RuntimePairingScreen.tsx)：非红色错误视觉；标题 "Connect this Desktop"；只保留 `Pair & Continue`（失败时才出现 Retry）；状态机 idle/pairing/connecting/failed；不触碰 challenge/token
- `PairingRequired` 从 [RuntimeRecoveryScreen](apps/desktop/src/renderer/src/screens/RuntimeRecovery/) 移除（删 Start/Confirm Pairing 按钮）；Recovery 仅处理 Missing/Starting/Degraded/Incompatible
- startup 契约：[startup-contract.ts](apps/desktop/src/shared/startup/startup-contract.ts) `StartupScreen` 增加 `"runtime-pairing"`；[startup-decision.ts](apps/desktop/src/main/startup/startup-decision.ts) `PairingRequired → runtime-pairing`；[useStartupGate.ts](apps/desktop/src/renderer/src/hooks/useStartupGate.ts) + [App.tsx](apps/desktop/src/renderer/src/App.tsx) 路由新增该屏

## Phase 3 — Token 生命周期
- [runtime-auth-store.ts](apps/desktop/src/main/copilot-runtime-client/runtime-auth-store.ts)：`saveDeviceToken` 返回持久化级别 `secure | memory-only`；memory-only 时结果带 `DEVICE_TOKEN_NOT_PERSISTED` 告警（Diagnostics 展示）
- 明确鉴权错误（`DEVICE_REVOKED` / `INVALID_DEVICE_TOKEN`）时 `clearDeviceToken()` → PairingRequired；网络类 401 不盲删
- challenge 过期：confirm 报 expired → 清 pendingChallenge → UI "Pair Again"
- hydrate→handshake 顺序已有；加测试固定

## Phase 4 — Startup 集成
- 配对成功（`state=Ready`）后 Renderer 触发 `recheck()`（startup gate 为唯一 Router，禁止直接 `setScreen("main")`）→ `resolveStartupDecision` → `Ready → main`

## Phase 5 — 测试 / Guard / 文档
- 单测：`tests/runtime-pairing-manager.test.ts`（fresh→PairingRequired、事务成功→Ready、start 失败、confirm 失败不落 token、expired→pair-again、并发三次仅一个 pairing/device）；`startup-decision.test.ts` 更新 PairingRequired→runtime-pairing；e2e 断言 preload 含 `pairAndConnect`
- Guard：`tools/agent-context/check-pairing-boundary.mjs`（Renderer 禁止 `/pairings/start`、`confirm`、`challenge`、`deviceToken` 直连），接入 `npm run guard`
- 文档：`docs/API_CONTRACTS.md` 增加 pair-and-connect IPC；`lat.md/` 同步；`lat check` 通过

## 边界
- 不改 Hermes 安装/Gateway/Chat/Task/MCP/Profile/Runtime 安装更新
- 不改 Runtime API；不新增 dev 自动 bypass（`COPILOT_E2E_AUTO_PAIR` 仅 e2e）

## 提交策略
1. 先提交现有修复（v1.3.1 review fixes + BrowserToolServer 18765 + ProcessLock/lifecycle + dev:migrate）为一个 commit
2. v1.3.2 全部改动作为第二个 commit；均不 push