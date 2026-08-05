# 任务运行时

任务来自本地或 Team Hub，经状态机流转、路由绑定 Profile、审批门控后在目标 Gateway 上执行 Hermes Run，并通过 Sync Outbox 回写远端。所有状态迁移受状态机约束，事件以 SSE 暴露。任务模型见 [[src/db/models/local_task.py#LocalTask]]。

相关：[[approval-workspace#审批与工作空间]]、[[gateway-supervisor#Gateway 监管]]、[[data-model#Profile 与任务表]]。

## 任务状态机

[[src/services/task_state_machine.py#assert_transition_allowed]] 强制迁移合法性：`remote_assigned → local_created → (waiting_approval|approved) → running → (completed|failed|cancelled|need_human_input)`，终态经 `synced` 收口。非法迁移抛 `StateMachineError`。状态枚举见 [[src/core/enums.py#TaskStatus]]。

## 任务路由

[[src/services/task_runtime.py#TaskRuntimeService]] `apply_routing` 按 `task_type` 在 [[src/services/task_routing_registry.py#TaskRoutingRegistry]] 查规则，选 `profile_type` 对应 Profile 绑定；`require_approval=true` 则迁移到 `waiting_approval` 并请求审批，否则直接 `approved`。无规则时回退 default Profile 且不需审批。路由配置可由 `TASK_ROUTING_JSON` 环境变量或 `/api/v1/task-routing` 提供。

## Team Hub 集成

[[src/integrations/team_hub/client.py#TeamHubClient]] 为 Protocol，`StubTeamHubClient`（默认）与 `HttpTeamHubClient`（占位 REST）两实现。`ingest_assignment` 先查 `TeamTaskBinding` 去重，再 `claim_assignment`，创建 `LocalTask` + binding，记事件/审计/Outbox，然后路由。Hub 选择在 [[src/core/lifecycle.py#lifespan]] `_hub_factory`：无 base_url 或 `AIOS_TEAM_HUB_USE_STUB` 用 Stub。

## Sync Outbox

[[src/services/task_sync_service.py#TaskSyncService]] `enqueue` 将事件写入 `sync_outbox`。[[src/workers/v12_workers.py#SyncOutboxWorker]] 周期推送 pending 行到 Hub，成功置 `sent` 并在 `task_completed` 时将任务迁移到 `synced`；失败累计 `retry_count`，超 `AIOS_SYNC_OUTBOX_MAX_RETRIES` 置 `failed`。状态见 [[src/core/enums.py#OutboxStatus]]。

## 执行与取消

`execute_run` 校验 approved 且无 pending 审批、Workspace Guard 放行、目标 Gateway 就绪，再迁移到 `running` 并经 [[src/integrations/hermes/client.py#HermesGatewayClient]] `create_run` 创建 Run；同步完成的任务立即迁移终态，否则留 `running` 等待事件采集。`cancel_task` 对运行中任务调 `cancel_run`（忽略 404）后迁移 `cancelled`。

## 后台 Worker

[[src/workers/v12_workers.py#TaskListenerWorker]] 轮询 Hub 拉取并 ingest assignment；`RunEventWorker` 轮询运行中任务的 Run 状态与事件（用 SHA256 指纹去重，上限 2000），完成/失败时迁移状态并写 Outbox。三者均 `run_forever` 循环、捕获 `CancelledError` 重抛、其它异常仅记日志，在 [[src/core/lifecycle.py#lifespan]] 关闭期统一 cancel（见 [[architecture#生命周期与后台循环]]）。
