# 任务运行时

任务来自本地、旧 Team Hub（兼容）或 v1.5 Remote Task Assignment v2（主路径）。**v1.3** 起 WorkTask 为执行 SOT：经 durable queue、[[src/runtime/execution/kernel.py#AgentExecutionKernel]] 与 21 类 durable events 驱动；LocalTask 保留于 `/api/v1/tasks`。远程任务企业协议见 [[endpoint-sync#Remote Task v2]]。

相关：[[approval-workspace#审批与工作空间]]、[[gateway-supervisor#Gateway 监管]]、[[data-model#Profile 与任务表]]、[[endpoint-sync#Endpoint Sync]]、[[tests#Work Task Runtime E2E]]。

## Work Task Runtime (v1.3)

[[src/services/work_task_service.py#WorkTaskService]] 负责 WorkTask CRUD、assign、start（入队 durable queue）、cancel、snapshot、approvals/artifacts。状态变更必须经 [[src/runtime/tasks/state_machine.py#transition]]。

## Durable Task Scheduler

[[src/runtime/tasks/task_worker.py#TaskWorker]] 原子 claim `task_execution_queue` 行、workspace 资源锁互斥、lease 续期。启动恢复见 [[src/runtime/tasks/task_recovery_service.py#TaskRecoveryService]]：queued 保留、running → interrupted（不重发 Hermes）。

## Agent Execution Kernel

[[src/runtime/execution/kernel.py#AgentExecutionKernel]] 是 runtime/tasks 下访问 Hermes 的唯一执行门面；测试注入 [[tests/support/scenario_hermes_adapter.py#ScenarioHermesRuntimeAdapter]]。禁止在 `runtime/tasks/**` 直接调用 `/v1/chat/completions`（CI：`check:no-task-direct-hermes`）。

## Task Events

21 种 durable 事件定义于 [[src/schemas/task_events.py#TASK_EVENT_TYPES]]，JSON Schema：`contracts/runtime-events/task-event.schema.json`（`runtimeEvents` 2.1.0）。持久化经 [[src/runtime/tasks/event_store.py#TaskEventStore]]。

## 任务状态机

[[src/services/task_state_machine.py#assert_transition_allowed]] 强制迁移合法性：`remote_assigned → local_created → (waiting_approval|approved) → running → (completed|failed|cancelled|need_human_input)`，终态经 `synced` 收口。非法迁移抛 `StateMachineError`。状态枚举见 [[src/core/enums.py#TaskStatus]]。

## 任务路由

[[src/services/task_runtime.py#TaskRuntimeService]] `apply_routing` 按 `task_type` 在 [[src/services/task_routing_registry.py#TaskRoutingRegistry]] 查规则，选 `profile_type` 对应 Profile 绑定；`require_approval=true` 则迁移到 `waiting_approval` 并请求审批，否则直接 `approved`。无规则时回退 default Profile 且不需审批。路由配置可由 `TASK_ROUTING_JSON` 环境变量或 `/api/v1/task-routing` 提供。

## Team Hub 集成

[[src/integrations/team_hub/client.py#TeamHubClient]] 为遗留 Protocol；`HttpTeamHubClient` 已标记 Deprecated。新远程任务走 Service Center + [[endpoint-sync#Remote Task v2]]。`StubTeamHubClient` 仍供旧 `/team-tasks` 与 v1.2 测试。`ingest_assignment` 先查 `TeamTaskBinding` 去重，再 claim 并创建 `LocalTask`。Hub 选择在 [[src/core/lifecycle.py#lifespan]] `_hub_factory`。

## Sync Outbox

v1.2 [[src/services/task_sync_service.py#TaskSyncService]] 仍写 `sync_outbox`，由 [[src/workers/v12_workers.py#SyncOutboxWorker]] 推 Team Hub。v1.5 企业交付改用 [[src/db/models/endpoint_sync.py#DeliveryOutbox]]（状态含 dead_letter），由 [[src/workers/delivery_outbox_worker.py#DeliveryOutboxWorker]] 批量推 Service Center；迁移时拷贝未发送 `sync_outbox` 行。状态见 [[src/core/enums.py#OutboxStatus]] / [[src/core/enums.py#DeliveryOutboxStatus]]。

## 执行与取消

`execute_run` 校验 approved 且无 pending 审批、Workspace Guard 放行、目标 Gateway 就绪，再迁移到 `running` 并经 [[src/integrations/hermes/client.py#HermesGatewayClient]] `create_run` 创建 Run；同步完成的任务立即迁移终态，否则留 `running` 等待事件采集。`cancel_task` 对运行中任务调 `cancel_run`（忽略 404）后迁移 `cancelled`。

## 后台 Worker

v1.2：[[src/workers/v12_workers.py#TaskListenerWorker]] / `RunEventWorker` / `SyncOutboxWorker`。v1.5 另启 Endpoint Sync workers（见 [[endpoint-sync#Workers]]）。均 `run_forever`、捕获 `CancelledError` 重抛，在 [[src/core/lifecycle.py#lifespan]] 关闭期统一 cancel。
