# 数据模型

使用 SQLAlchemy 2.x async + SQLite（aiosqlite），生产仅经 Alembic 迁移建表。模型含 Runtime Core、v1.2 Profile/任务表，以及 v1.5 Endpoint Sync 表（见 [[data-model#数据模型#Endpoint Sync 表]]）。

连接层 [[src/db/session.py#create_engine]] 对每个 SQLite 连接启用 `foreign_keys=ON`、`journal_mode=WAL`、`synchronous=NORMAL`、`busy_timeout=10000`（连接参数 `timeout=30`），避免多 Worker 并发写时出现 `database is locked` 500。

相关：[[runtime-service#版本管理]]、[[profiles-instances#Profile 与 Instance]]、[[task-runtime#任务运行时]]。

## Runtime 表

`db/models/runtime.py` 定义：[[src/db/models/runtime.py#RuntimeVersion]]、[[src/db/models/runtime.py#RuntimeJob]]、[[src/db/models/runtime.py#RuntimeJobEvent]]、[[src/db/models/runtime.py#HermesInstance]]、[[src/db/models/runtime.py#ConfigSnapshot]]、[[src/db/models/runtime.py#DevicePairing]]、[[src/db/models/runtime.py#BootstrapSession]]、[[src/db/models/runtime.py#Device]]、[[src/db/models/runtime.py#SecretReference]]、[[src/db/models/runtime.py#McpServer]]、[[src/db/models/runtime.py#McpSecretRef]]、[[src/db/models/runtime.py#McpTestResult]]、[[src/db/models/runtime.py#RuntimeAuditLog]]。

`RuntimeJobEvent` 用递增 `sequence` 保 SSE 顺序；`SecretReference` 仅存存储引用（provider + key），不存明文；`McpSecretRef` 关联 MCP 与 Secret 引用；`RuntimeAuditLog` 独立于任务模块 `AuditLog`。仓储见 [[src/db/repositories/runtime_repo.py#RuntimeVersionRepository]] / [[src/db/repositories/runtime_repo.py#RuntimeJobRepository]] / [[src/db/repositories/mcp_repo.py#McpServerRepository]]。

## Profile 与任务表

Profile 与任务相关表及枚举。

`db/models/profile.py` [[src/db/models/profile.py#Profile]]；`db/models/local_task.py` [[src/db/models/local_task.py#LocalTask]]；任务相关表（`task_events`、`approvals`、`team_task_bindings`、`sync_outbox`、`workspaces`、`chat_attachments`、`profile_chat_settings`、`profile_role_specs` 等）在 `db/models/task_related.py` 等处。仓储统一在 `db/repositories/v12_repos.py`。

枚举：[[src/core/enums.py#TaskStatus]]、[[src/core/enums.py#ApprovalStatus]]、[[src/core/enums.py#OutboxStatus]]、[[src/core/runtime_enums.py#RuntimeVersionStatus]]、[[src/core/runtime_enums.py#RuntimeJobStatus]]、[[src/core/runtime_enums.py#InstanceStatus]]、[[src/core/runtime_enums.py#DeviceStatus]]。

## 迁移链

迁移按 revision 顺序执行。本地 `dev` 目标会自动 `alembic upgrade head`；生产启动前亦需手动或安装流程执行迁移。

| Revision | 内容 |
|----------|------|
| `0001` | `profiles` |
| `0002` | 任务、审批、工作空间、审计等 v1.2 表 |
| `001_role_spec` | Profile 展示字段 + `profile_role_specs` |
| `002_team_v18_chat` | `profile_chat_settings`、`chat_attachments` |
| `003_fix_default_profile_path` | 修正默认 `profile_path`（与 `003_runtime_core` 同父，曾成孤立分支） |
| `003_runtime_core` | Runtime 表（versions/jobs/instances/devices 等）+ profiles→instances 数据迁移 |
| `004_v14_instance_chat` | `profile_chat_settings`/`chat_attachments` 增加 `instance_id` |
| `005_v14_mcp_tables` | `mcp_servers`/`mcp_secret_refs`/`mcp_test_results` |
| `006_v14_bootstrap_sessions` | `bootstrap_sessions` 一次性安装令牌 |
| `007_v14_merge_heads` | 合并 bootstrap 与 artifact/service-update 两条分支，收敛为单一 head |
| `008_v15_endpoint_sync` | Endpoint Sync 全表 + pending `sync_outbox` → `delivery_outbox` 数据拷贝 |
| `009_v16_reliable_sync` | `sync_ack_outbox`、`sync_replay_nonces`、`sync_poison_messages` |
| `009_v16_resource_apply` | `resource_apply_runs`/`resource_apply_operations`/`resource_snapshots` |
| `010_v16_merge_heads` | 合并 reliable_sync 与 resource_apply 分支 |
| `011_v16_work_tasks` | `work_tasks`/`task_runs`/`task_run_events` 等；未完成 assignment 迁移为 `migration_pending_review` |
| `012_v16_artifact_workers` | artifact upload / worker state 表 |
| `013_v16_experience` | Experience evidence links / fingerprints |
| `014_merge_profile_path_v16` | 合并 `003_fix_default_profile_path` 与 `013_v16_experience`，恢复单一 head |
| `015_v11_chat_runtime` | Chat Runtime v2：`chat_runs`/`chat_turns`/`chat_events`/`chat_queue_entries`/`chat_interactions` |
| `016_v13_task_domain_sot` | v1.3 WorkTask 域字段扩展 + LocalTask → WorkTask 数据迁移 |
| `017_v13_task_execution_queue` | v1.3 持久化 `task_execution_queue` |
| `018_v13_task_phase456` | v1.3：`task_interactions`、`task_routing_rules`、team binding `work_task_id`（当前 head） |

本地 `nx run runtime:dev` / `npm run dev:runtime` 会先执行 `alembic upgrade head` 再启动 uvicorn。生产启动前亦需 `alembic upgrade head`（或 `nx run runtime:migrate`）。新增表必须配 Alembic 迁移。

## Chat Runtime 表

v1.1 durable chat 表，模型 [[src/db/models/chat_runtime.py#ChatRun]] / [[src/db/models/chat_runtime.py#ChatTurn]] / [[src/db/models/chat_runtime.py#ChatEvent]] / [[src/db/models/chat_runtime.py#ChatQueueEntry]] / [[src/db/models/chat_runtime.py#ChatInteraction]]；仓储 [[src/db/repositories/chat_run_repo.py#ChatRunRepository]]。

约束：`UNIQUE(client_run_id)`、`UNIQUE(run_id, client_turn_id)`、`UNIQUE(run_id, sequence)`、`UNIQUE(run_id, request_id)`。Event Store 为 SSE replay 的唯一事实源（见 [[chat-sessions#Chat Runtime v2]]）。

## Work Task 表

v1.6 真实任务执行表，模型 [[src/db/models/work_tasks.py#WorkTask]] 等，仓储 [[src/db/repositories/work_task_repo.py#WorkTaskRepository]]。

包含：`work_tasks`、`task_runs`、`task_run_events`（`UNIQUE(run_id, sequence)`）、`task_run_checkpoints`、`task_approvals`、`task_artifacts`、`task_resource_locks`；`remote_task_assignments.work_task_id`、`task_leases.work_task_id` 关联字段。

## Endpoint Sync 表

v1.5 新增终端身份与企业同步表，模型见 [[src/db/models/endpoint_sync.py#EndpointEnrollment]] 等，仓储 [[src/db/repositories/endpoint_sync_repo.py#EndpointSyncRepository]]。

包含：`endpoint_enrollments`、`endpoint_credentials`、`sync_channels`/`sync_cursors`/`sync_inbox`、`sync_ack_outbox`/`sync_replay_nonces`/`sync_poison_messages`、`delivery_outbox`、`desired_state_revisions`/`desired_state_resources`、`resource_installations`/`resource_conflicts`、`resource_apply_runs`/`resource_apply_operations`/`resource_snapshots`、`remote_task_assignments`/`task_leases`/`task_delivery_records`/`result_artifacts`、`endpoint_inventory_snapshots`、`experience_evidence`/`experience_candidates`/`experience_submission_records`、`experience_evidence_links`/`experience_fingerprints`、`artifact_upload_sessions`/`artifact_upload_parts`、`worker_states`/`worker_incidents`。旧 `sync_outbox` 表保留兼容；迁移时拷贝 pending 行到 `delivery_outbox`。

详见 [[endpoint-sync#Endpoint Sync]]。
