# Endpoint Sync

v1.5 把本机 Runtime 升级为企业 Work Copilot 可信执行节点：Endpoint 身份、双向 Sync、Desired State、Remote Task v2、Experience/StaffDeck。中心无可联调 API 时默认 [[src/integrations/service_center/client.py#StubServiceCenterClient]]。

相关：[[task-runtime#任务运行时]]、[[data-model#数据模型#Endpoint Sync 表]]、[[tests#Endpoint Sync]]、[[architecture#生命周期与后台循环]]。

## Service Center Client

本机只实现出站 Client（PRD §19），不托管 Service Center 服务端。

[[src/integrations/service_center/protocol.py#ServiceCenterClient]] 定义 enroll/token/heartbeat/changes/acks/tasks/artifacts/experience 契约。[[src/integrations/service_center/client.py#create_service_center_client]] 在 `AIOS_SERVICE_CENTER_USE_STUB=true`（默认）返回 Stub；Http 客户端强制 HTTPS + 域名 allowlist。设备密钥：[[src/integrations/service_center/auth.py#generate_device_keypair]] / [[src/integrations/service_center/auth.py#DeviceKeyStore]]（DPAPI/`SecretStore`）。制品上传见 [[src/integrations/service_center/artifact_client.py#StubArtifactUploadClient]]。

## Enrollment

[[src/services/endpoint_enrollment_service.py#EndpointEnrollmentService]] 编排 start→完整密钥落盘→complete（中心注册）→revoke。

吊销只停 sync/tasks，本地 Chat/Instance 继续。库存由 [[src/services/endpoint_inventory_service.py#EndpointInventoryService]] 生成，禁止上传真实路径、MAC、磁盘序列号。本地 API：`/api/v1/endpoint/*`（[[src/api/v1/endpoint.py]]）。

## Sync Foundation

信封协议 [[src/runtime/sync_protocol.py#build_envelope]] / [[src/runtime/sync_protocol.py#verify_envelope]]；Outbox 退避 [[src/runtime/delivery_backoff.py#compute_backoff_seconds]]。

[[src/services/runtime_sync_service.py#RuntimeSyncService]]：pull changes → 验签/sequence/replay → inbox → dispatch → cursor → 写 [[src/db/models/endpoint_sync.py#SyncAckOutbox]]（禁止 sync 内直接 `acks`）；出站 flush [[src/db/models/endpoint_sync.py#DeliveryOutbox]] 按 Center 逐事件 ACK。本地 API：`/api/v1/sync/*`（[[src/api/v1/sync.py]]）。旧 `sync_outbox` 在迁移 `008_v15_endpoint_sync` 拷贝到 `delivery_outbox`。

## Reliable Sync

v1.6 FR-201–206：commit-before-ACK、sequence 连续性、replay nonce、poison 隔离、逐事件 events_batch 确认。见 [[src/services/runtime_sync_service.py#RuntimeSyncService]]、`sync_ack_outbox`/`sync_replay_nonces`/`sync_poison_messages`；ACK 由 [[src/workers/ack_delivery_worker.py#AckDeliveryWorker]] 发送。

## Desired State

[[src/runtime/desired_state_reconciler.py#build_reconciliation_plan]] 产出 install/upgrade/remove；[[src/services/desired_state_service.py#DesiredStateService]] 入站 revision 并 apply；[[src/services/resource_sync_service.py#ResourceSyncService]] 经 [[src/runtime/resources/base.py#ResourceAdapter]] 落盘安装态、冲突与 artifact-cache。Profile Bundle 结构见 [[src/runtime/resource_bundle.py#parse_profile_bundle]]。Secret 只同步 `requiredSecretNames`，值永不入中心。Revision 级事务回滚见 [[src/services/desired_state_service.py#DesiredStateService#apply_revision]]；探针 API `/api/v1/resources/*`（[[src/api/v1/resources.py]]）。

## Remote Task v2

[[src/services/remote_task_service.py#RemoteTaskService]] 按 `assignmentId+assignmentVersion` 幂等入站；claim/lease 后创建 [[endpoint-sync#Work Task Execution]] 并调度真实 Hermes 执行；事件与结果经 [[src/runtime/experience_redactor.py#redact_payload]] 脱敏后交付。交付辅助：[[src/services/task_delivery_service.py#TaskDeliveryService]]、[[src/services/artifact_delivery_service.py#ArtifactDeliveryService]]。本地 API：`/api/v1/remote-tasks/*`（[[src/api/v1/remote_tasks.py]]）。旧 Team Hub 降为兼容 Adapter（[[src/integrations/team_hub/client.py#HttpTeamHubClient]] Deprecated）。

## Work Task Execution

v1.6 FR-401–507：[[src/db/models/work_tasks.py#WorkTask]] / [[src/db/models/work_tasks.py#TaskRun]] / [[src/db/models/work_tasks.py#TaskRunEvent]]（`UNIQUE(run_id, sequence)`）表；[[src/runtime/tasks/hermes_adapter.py#HermesRuntimeAdapter]] 包装 Gateway Chat SSE；[[src/runtime/tasks/executor.py#TaskExecutor]] 编排 claim→run→事件持久化→完成；[[src/runtime/tasks/event_store.py#TaskEventStore]] 先写库再 Outbox；[[src/runtime/tasks/scheduler.py#TaskExecutionScheduler]] 并发（Endpoint=2、Instance=1）；[[src/runtime/tasks/lease_manager.py#LeaseManager]] 续租；[[src/runtime/tasks/recovery.py#TaskRecovery]] 启动恢复。API：`/api/v1/work-tasks/*`（[[src/api/v1/work_tasks.py]]），SSE `Last-Event-ID` 按 sequence 从 DB 补发。

### Hermes Runtime Adapter

[[src/runtime/tasks/hermes_adapter.py#HermesRuntimeAdapter]]：`ensure_instance`/`stream_run`/`cancel_run` 包装 Hermes Gateway 与 Chat SSE。

### Work Task Service

[[src/services/work_task_service.py#WorkTaskService]] 从 Remote Assignment 创建 WorkTask、claim lease 并调度 [[src/runtime/tasks/executor.py#TaskExecutor]]。

### Task Recovery

[[src/runtime/tasks/recovery.py#TaskRecovery]] 启动时扫描 in-flight 任务：Gateway 失联标 `orphaned`，Lease 失效标 `expired`，健康则重新入队。

## Experience

[[src/services/experience_capture_service.py#ExperienceCaptureService]] 采集脱敏证据；[[src/services/experience_auto_capture.py#ExperienceAutoCapture]] 从真实任务事件自动生成 Evidence（FR-1001），含 Provenance 与 [[src/runtime/experience_fingerprint.py#evidence_fingerprint]] 去重；质量分达阈值才建议 Candidate，**禁止自动提交 StaffDeck**。[[src/services/experience_candidate_service.py#ExperienceCandidateService]] 本地审核，运行时最高 `submitted`；[[src/services/staffdeck_bridge_service.py#StaffDeckBridgeService]] 经 Center 提交并同步 review。本地 API：`/api/v1/experience/*`（[[src/api/v1/experience.py]]）。

## Workers

经 [[src/workers/supervisor.py#WorkerSupervisor]] 注册 EndpointHeartbeat、DesiredState、Assignment、DeliveryOutbox 等；Assignment 须注入 `GatewaySupervisor`。

Team Hub listener/outbox 仅在显式配置 `AIOS_TEAM_HUB_BASE_URL` 时启动。`app.state._disable_workers` 关闭全部循环。

## Capability

API Version `1.3`。[[src/core/capabilities.py#DEFAULT_FEATURES]] 增补 v1.6：`deployment.production-mode`、`service-center.*`、`sync.ack-outbox`、`resources.real-apply`、`tasks.hermes-execution`、`workers.supervisor`、`experience.auto-evidence` 等（Desktop 经 `/runtime/capabilities` 协商）。
