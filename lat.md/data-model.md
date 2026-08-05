# 数据模型

使用 SQLAlchemy 2.x async + SQLite（aiosqlite），生产仅经 Alembic 迁移建表，应用启动不 `create_all`（测试在 `conftest` 用 `init_db`）。模型分两组：Runtime Core 表与 v1.2 Profile/任务表。

相关：[[runtime-service#版本管理]]、[[profiles-instances#Profile 与 Instance]]、[[task-runtime#任务运行时]]。

## Runtime 表

`db/models/runtime.py` 定义：[[src/db/models/runtime.py#RuntimeVersion]]、[[src/db/models/runtime.py#RuntimeJob]]、[[src/db/models/runtime.py#RuntimeJobEvent]]、[[src/db/models/runtime.py#HermesInstance]]、[[src/db/models/runtime.py#ConfigSnapshot]]、[[src/db/models/runtime.py#DevicePairing]]、[[src/db/models/runtime.py#Device]]、[[src/db/models/runtime.py#SecretReference]]、[[src/db/models/runtime.py#RuntimeAuditLog]]。

`RuntimeJobEvent` 用递增 `sequence` 保 SSE 顺序；`SecretReference` 仅存存储引用（provider + key），不存明文；`RuntimeAuditLog` 独立于任务模块 `AuditLog`。仓储见 [[src/db/repositories/runtime_repo.py#RuntimeVersionRepository]] / [[src/db/repositories/runtime_repo.py#RuntimeJobRepository]]。

## Profile 与任务表

Profile 与任务相关表及枚举。

`db/models/profile.py` [[src/db/models/profile.py#Profile]]；`db/models/local_task.py` [[src/db/models/local_task.py#LocalTask]]；任务相关表（`task_events`、`approvals`、`team_task_bindings`、`sync_outbox`、`workspaces`、`chat_attachments`、`profile_chat_settings`、`profile_role_specs` 等）在 `db/models/task_related.py` 等处。仓储统一在 `db/repositories/v12_repos.py`。

枚举：[[src/core/enums.py#TaskStatus]]、[[src/core/enums.py#ApprovalStatus]]、[[src/core/enums.py#OutboxStatus]]、[[src/core/runtime_enums.py#RuntimeVersionStatus]]、[[src/core/runtime_enums.py#RuntimeJobStatus]]、[[src/core/runtime_enums.py#InstanceStatus]]、[[src/core/runtime_enums.py#DeviceStatus]]。

## 迁移链

迁移按 revision 顺序执行，生产启动前需 `alembic upgrade head`。

| Revision | 内容 |
|----------|------|
| `0001` | `profiles` |
| `0002` | 任务、审批、工作空间、审计等 v1.2 表 |
| `001_role_spec` | Profile 展示字段 + `profile_role_specs` |
| `002_team_v18_chat` | `profile_chat_settings`、`chat_attachments` |
| `003_runtime_core` | Runtime 表（versions/jobs/instances/devices 等）+ profiles→instances 数据迁移 |

生产启动前 `alembic upgrade head`。新增表必须配 Alembic 迁移。
