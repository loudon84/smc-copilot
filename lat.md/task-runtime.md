# 任务运行时

任务来自本地、旧 Team Hub（兼容）或 v1.5 Remote Task Assignment v2（主路径）。经状态机/审批/Workspace Guard 后在 Instance Gateway 执行，并通过 Outbox 回传。远程任务企业协议见 [[endpoint-sync#Remote Task v2]]。

相关：[[approval-workspace#审批与工作空间]]、[[gateway-supervisor#Gateway 监管]]、[[data-model#Profile 与任务表]]、[[endpoint-sync#Endpoint Sync]]。

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
