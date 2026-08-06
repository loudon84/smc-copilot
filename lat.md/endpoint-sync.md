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

[[src/services/runtime_sync_service.py#RuntimeSyncService]]：pull changes → inbox 按 `messageId` 去重 → 分发 desired_state / task_assignment / task_control → 推进 cursor → flush [[src/db/models/endpoint_sync.py#DeliveryOutbox]]。本地 API：`/api/v1/sync/*`（[[src/api/v1/sync.py]]）。旧 `sync_outbox` 在迁移 `008_v15_endpoint_sync` 拷贝到 `delivery_outbox`。

## Desired State

[[src/runtime/desired_state_reconciler.py#build_reconciliation_plan]] 产出 install/upgrade/remove；[[src/services/desired_state_service.py#DesiredStateService]] 入站 revision 并 apply；[[src/services/resource_sync_service.py#ResourceSyncService]] 落盘安装态、冲突与 artifact-cache。Profile Bundle 结构见 [[src/runtime/resource_bundle.py#parse_profile_bundle]]。Secret 只同步 `requiredSecretNames`，值永不入中心。

## Remote Task v2

[[src/services/remote_task_service.py#RemoteTaskService]] 按 `assignmentId+assignmentVersion` 幂等入站；claim/lease 后走 Instance 控制面路径；事件与结果经 [[src/runtime/experience_redactor.py#redact_payload]] 脱敏后交付。交付辅助：[[src/services/task_delivery_service.py#TaskDeliveryService]]、[[src/services/artifact_delivery_service.py#ArtifactDeliveryService]]。本地 API：`/api/v1/remote-tasks/*`（[[src/api/v1/remote_tasks.py]]）。旧 Team Hub 降为兼容 Adapter（[[src/integrations/team_hub/client.py#HttpTeamHubClient]] Deprecated）。

## Experience

[[src/services/experience_capture_service.py#ExperienceCaptureService]] 采集脱敏证据；[[src/services/experience_candidate_service.py#ExperienceCandidateService]] 本地审核，运行时最高 `submitted`；[[src/services/staffdeck_bridge_service.py#StaffDeckBridgeService]] 经 Center 提交并同步 review。禁止 Runtime 自标 `accepted`/`published`。本地 API：`/api/v1/experience/*`（[[src/api/v1/experience.py]]）。

## Workers

后台循环：[[src/workers/endpoint_heartbeat_worker.py#EndpointHeartbeatWorker]]、[[src/workers/desired_state_worker.py#DesiredStateWorker]]、[[src/workers/assignment_worker.py#AssignmentWorker]]、[[src/workers/delivery_outbox_worker.py#DeliveryOutboxWorker]]、[[src/workers/staffdeck_review_worker.py#StaffDeckReviewWorker]]，在 [[src/core/lifecycle.py#lifespan]] 与 v1.2 workers 一并启动；`app.state._disable_workers` 关闭全部循环。配置项见 `AIOS_ENDPOINT_HEARTBEAT_INTERVAL_SECONDS` / `AIOS_SYNC_POLL_INTERVAL_SECONDS` / `AIOS_DELIVERY_OUTBOX_*`。

## Capability

API Version `1.2`。[[src/core/capabilities.py#DEFAULT_FEATURES]] 增补 `endpoint.*`、`sync.*`、`tasks.remote.v2`、`experience.*`、`runtime.release.production`、`runtime.maintenance.apply`、`installer.windows.production` 等（Desktop 经 `/runtime/capabilities` 协商）。
