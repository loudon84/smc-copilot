# Implementation Plan: apps/work「召唤专家」v3.0

## Approved PRD

[docs/work/PRD-WORK-v3.0-expert-execution.md](../../docs/work/PRD-WORK-v3.0-expert-execution.md)（status: APPROVED，USER_OVERRIDE；外部合同 v1.0.1 tag lock 与 20-run load gate 由用户在线下解决，本计划以 v1.0.1 已发布产物为合同事实源）。

## Overview

在 `apps/work` 中实现 Explicit Expert 能力：Renderer 通过 `toolbarExtras` 选择 Expert/Skill，`Chat.tsx` 提交链生成不可变 `ExpertRequest` 快照；Main 侧新增唯一 Gateway client（User JWT）与唯一 Run service（SSE + 受限 status-poll fallback + cancel/retry）；事件经窄 IPC/Preload 投影到 Renderer store；restart projection 扩展既有 continuation store；artifact 由 Main 受控下载并复用 File Platform 入库。HermesTask 远端是唯一事实源，本地只保存最小 UI projection。

## Architecture Decisions

- **单一 owner**：Catalog/Skill HTTP 与 TTL 缓存并入 `expert-gateway-client.ts`，不建独立 `ExpertCatalogService`；SSE 生命周期归 `expert-run-service.ts`，framing 复用 `run-stream.ts`，不建第三套 parser；Renderer store 仅投影，不建 `ExpertRunStore` 事实源。
- **NoDeskClaw base URL 复用 auth 配置**：Portal/NoDeskClaw backend URL 来自 `auth-endpoint-config-store.ts`（与 Hermes `getApiUrl` 是两套配置，不得混用）；JWT 只经 `token-store.ts` 在 Main 读取，Renderer 不接触 token 与 URL。
- **SSE id 最小泛化**：`parseRunSseBlock` 目前只解析 `event:`/`data:`；为支持 `Last-Event-ID` 重连，在同函数内增加 `id:` 行解析（可选字段，现有调用方行为不变）。
- **状态机**：`queued → starting → running → terminal(succeeded|failed|cancelled|expired|unauthorized)`；Slash 判定始终先于 Expert 路由；`runtimeProgress=false`，UI 只显示最低阶段状态。
- **受限 fallback**：status polling 是有期限 compat（consumer: `expert-run-service.ts`；removal: v3.2 最早），不是第二协议 owner。

## Change Matrix

| File / Symbol | Action | Existing Owner | Target State |
|---|---|---|---|
| `ChatInput.tsx::toolbarExtras` | KEEP | `ChatInput.tsx` | 继续作为 WorkContext UI 插槽，不改 Composer 核心 |
| Dashboard/Hermes Chat transport | KEEP | `useDashboardChatTransport.ts` + `hermes.ts` | Expert 关闭或 local mode 行为不变 |
| Slash Router（`handleSubmitOrQueue` L901–935） | KEEP | `Chat.tsx` + slash modules | `/command` 优先于 Expert execution |
| `Chat.tsx` toolbar state（folder/model/reasoning/fast） | MODIFY | `Chat.tsx` | Expert mode 禁用但不删除；不得传给 Remote Expert |
| `Chat.tsx::QueuedMessage` + queue/drain/cancel | MODIFY | `Chat.tsx` | 队列 item 携带不可变 `ExpertRequest` 快照；queued/running 两类取消；retry 生成新 `clientRequestId` |
| `mcp-servers.ts` | KEEP | `mcp-servers.ts` | v3.0 不消费 Local Hermes capability token；不新增 binding writer/credential store/reload |
| `run-stream.ts::parseRunSseBlock` | MODIFY | `run-stream.ts` | 同函数增加 `id:` 行解析；Expert run service 复用，不复制 parser |
| `shared/session-continuation.ts` + `session-continuation-store.ts` | MODIFY | 同名文件 | 加入版本化 `expert-run` 联合成员（`schemaVersion: 1`）；normalize 白名单显式扩展；rehydrate 授权复核，服务端状态优先 |
| File Platform + `AgentOutputFileCard` | MODIFY | `agent-output-service.ts` 等 | 只接入 Main 受控下载（temp+原子提交、同源 JWT、限大小、保守 MIME）后的 artifact；不建平行 artifact store |
| `main/app/start.ts` | MODIFY | `start.ts` | 构造 Expert 单例 → 注册 Expert IPC；`before-quit` 按「停止新请求 → abort SSE/polling → 取消下载 → 清 cache → dispose」追加清理 |
| `auth-ipc.ts` logout | MODIFY | `auth-ipc.ts` | 追加调用 Expert Run owner 的同一幂等 dispose 路径 |
| `shared/expert.ts` | ADD | 无 | 跨 Main/Preload/Renderer 唯一 DTO owner，由 v1.0.1 合同产物派生 |
| `main/expert/expert-gateway-client.ts` | ADD | 无 | 受信 Main 网络 owner：Catalog/Skill + TTL 缓存、exact call（`X-Idempotency-Key`）、HermesTask status/snapshot/result/cancel、artifact 下载 |
| `main/expert/expert-run-service.ts` | ADD | 无 | 唯一 task lifecycle owner：状态机、SSE 重连（≤5 次，1/2/4/8/16s）、受限 polling fallback（15s，≤10min）、authoritative completion、cancel/retry |
| `main/expert/expert-ipc.ts` + `preload/expert-api.ts` | ADD | 无 | 窄接口，逐调用校验 sender/session/profile/DTO；挂载 `window.hermesAPI.expert` |
| `renderer/src/modules/expert/`（Selector/RunCard/Timeline/store + public entry） | ADD | 无 | 单一 feature boundary；store 只存 UI 状态 |
| `ExpertCatalogService` 独立实现 | REMOVE | 原稿拟新增、无生产 consumer | 不创建；能力并入 `expert-gateway-client.ts` |
| `ExpertMcpBindingService` / `LocalHermesMcpAdmin` | REMOVE | 原稿拟新增、无生产 consumer | 不创建；`mcp-servers.ts` 保持现有边界 |
| Local Hermes Expert MCP binding（v3.0 scope） | REMOVE | 合同无 Work consumer token lifecycle | 不实施；待未来版本化合同 + 独立 PRD |
| `ExpertSseService` 独立 parser owner | REMOVE | 原稿拟新增、无生产 consumer | 不创建；framing 复用 `run-stream.ts` |
| `ExpertRunStore` 事实源/持久化 owner | REMOVE | 原稿拟新增、无生产 consumer | 不创建；Renderer store 仅投影，持久化复用 continuation store |
| Runtime control-plane Expert API 扩展 | REMOVE | Frozen Runtime boundary | 不实施；禁止改动 `services/runtime` / `contracts/runtime-api` |

## New File Justification

- `shared/expert.ts`：现有 chat/MCP DTO 不表达 Expert、Skill、HermesTask 与 Expert event；跨进程信任边界需要唯一合同 owner。
- `main/expert/expert-gateway-client.ts`：`mcp-servers.ts` 管 Local Hermes MCP 配置，不负责 NoDeskClaw 用户级 Expert HTTP API；远端 URL/token 放入 Renderer 不安全。
- `main/expert/expert-run-service.ts`：现有 Hermes Chat transport 不表达独立 HermesTask 的 status/result/artifact/cancel/retry 生命周期；复用现有 SSE framing，不新建 parser。
- `main/expert/expert-ipc.ts` + `preload/expert-api.ts`：auth/files 已采用按 domain 注册 + bridge 的既有模式；Expert 需要同样的最小信任边界，不能把 Gateway client 暴露为任意 HTTP proxy。
- `renderer/src/modules/expert/`：renderer 现有唯一 feature module 是 auth，无 Expert UI owner；全部塞入 `Chat.tsx` 会扩大现有提交 owner。

不新增 Expert continuation store、artifact store、MCP admin、SSE parser 或 lifecycle wrapper。

## Task List

### Phase 1: 合同与 Main 网络核心

- [ ] Task 1: `shared/expert.ts` DTO（ExpertRequest 快照、Catalog/Skill、HermesTask status/result、SSE event、artifact descriptor、`error.data.errorCode`），字段以 v1.0.1 已发布 OpenAPI/SSE/MCP schema 为准。验证：`npm run test`（apps/work）通过 + 类型编译通过。
- [ ] Task 2: `main/expert/expert-gateway-client.ts`（base URL 复用 `auth-endpoint-config-store`，JWT 经 `token-store.getCachedAccessToken`；Catalog/Skill + TTL 缓存；`POST /api/v1/expert/mcp/{slug}` tools/call 读 `structuredContent`；HermesTask status/snapshot/result/cancel；artifact 同源下载 endpoint）。验证：新增就近单测覆盖 200/4xx、JSON-RPC 200-with-error、授权错误。
- [ ] Task 3: `run-stream.ts::parseRunSseBlock` 增加 `id:` 行解析（可选返回字段）。验证：`tests/run-stream.test.ts` 增加 id 断言，现有断言不变。

### Checkpoint: Phase 1

- [ ] `npm run test` 全绿；DTO 与合同 schema 字段一一对应。

### Phase 2: Run 生命周期与进程边界

- [ ] Task 4: `main/expert/expert-run-service.ts`（状态机；SSE 按 event id 去重、乱序不覆盖高版本、terminal 不可回退；`Last-Event-ID` 重连 ≤5 次指数退避；失败后 15s polling ≤10min，超限报 `delivery-timeout`；cancel 用同一 `clientRequestId`/`taskId`，retry 生成新 `clientRequestId`）。验证：单测覆盖重复/乱序事件、重连预算、polling terminal、delivery timeout、completion race。
- [ ] Task 5: `main/expert/expert-ipc.ts` + `preload/expert-api.ts` + `preload/index.d.ts` 类型（`window.hermesAPI.expert`；每调用校验 sender/session/profile/DTO）。验证：IPC 测试覆盖非法 sender/DTO 拒绝。
- [ ] Task 6: `main/app/start.ts` 注册顺序 + `before-quit` dispose 链；`auth-ipc.ts` logout 走同一幂等 dispose。验证：生命周期测试覆盖注册顺序与 logout/quit 幂等 dispose。

### Checkpoint: Phase 2

- [ ] Main 侧闭环可经测试驱动跑通 exact call → SSE → result。

### Phase 3: Renderer 特性

- [ ] Task 7: `renderer/src/modules/expert/`（Selector、RunCard、Timeline、store.ts、public entry；只显示 `preparing/finalizing` 等最低阶段，不伪装工具级进度）。验证：组件测试 + store 投影测试。
- [ ] Task 8: `Chat.tsx` 集成（提交时生成不可变 `ExpertRequest` 快照；Slash 优先；queued 取消仅移除未发请求、starting/running 取消调远端；Expert mode 禁用 model/reasoning/fast/folder 控件且不传远端）。验证：状态机测试覆盖 Slash 优先、drain 后 mode/account/profile 改变、两类取消、重复 retry。

### Checkpoint: Phase 3

- [ ] 端到端：选择 Expert → 提交 → RunCard 状态推进 → 完成展示。

### Phase 4: 持久化与产物

- [ ] Task 9: continuation 扩展（`expert-run` 版本化成员；normalize 白名单显式加入；rehydrate 时 Main 重新校验 user/profile/session 授权，过期/撤销则删除 projection 并显示确定不可恢复状态）。验证：migration、断电恢复、登出、授权撤销、completion race 测试。
- [ ] Task 10: artifact 下载与入库（Main-only；只接受后端 `artifact_id`，同源 + User JWT；拒绝跨 origin/redirect 与 Renderer 传入 URL；限流式大小、保守 MIME/文件名；temp 写入 + 原子提交；失败/Logout 清理临时文件；经现有 File Platform 入库，`AgentOutputFileCard` 只展示已入库本地文件；无 hash/signature 时不声称完整性已校验）。验证：URL/redirect 拒绝、超限、部分下载清理、跨用户 403、Logout race 测试。

### Checkpoint: Complete

- [ ] `npm run test` 全绿；PRD Acceptance Criteria 中可由本仓库满足项逐条核对；Manual/load-gate 项保持未勾选并标注外部依赖。

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 外部 v1.0.1 tag/SHA 未锁定（USER_OVERRIDE 批准） | 合同字段漂移 | `shared/expert.ts` 字段严格按已发布 schema 产物；tag 到位后以独立任务 pin SHA256SUMS + contract test |
| `runtimeProgress=false` 下 UI 夸大进度 | 信任违规 | Timeline 只渲染最低阶段；polling fallback 不得伪装为过程进度 |
| 队列 drain 时 mode/account/profile 已改变 | 错误上下文执行 | `ExpertRequest` 不可变快照 + 执行前代际校验，失配则失败而非静默执行 |
| 未知 continuation kind 双向丢失 | projection 丢失 | normalize 白名单显式扩展 `expert-run`，不依赖未知字段透传 |

## Open Questions

- Expert Team actor metadata 是 P0 还是允许 P1 退化（待外部 schema 确认；本计划按 v1.0.1 现有字段实现）。
- v1.0.1 annotated tag 与 20-run load evidence 到位时间（外部 owner 交付，不阻塞本计划任务编排）。
