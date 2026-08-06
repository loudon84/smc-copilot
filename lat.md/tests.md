# 测试规范

`pytest` / `pytest-asyncio`，测试在 `conftest` 用 `init_db(create_all)` 建表并经 `app.state._test_*` 注入桩件、禁用 Gateway 自启与后台 worker。本节描述关键测试覆盖与 v1.3.1 hotfix 回归基线。具体用例见 `tests/`。

相关：[[architecture#生命周期与后台循环]]、[[tests#Runtime 核心]]。

## Runtime 核心

`tests/test_runtime_core.py` 覆盖 Job 串行化、写锁、`recover_incomplete_jobs`、版本激活；非可安装 Artifact 安装 Job 必须失败（无 Stub）。`tests/test_checksum.py`、`tests/test_snapshot_save_schema.py` 覆盖校验与 snapshot。对应 [[runtime-service#运行时 Job 队列]]。

## 真实安装

`tests/test_real_artifact_install.py` 验证无 wheel/pyproject 时报 `artifact_not_installable`、semver 取最高、源码中无 Stub writer。对应 [[runtime-service#安装 Job]]。

## Gateway 监管

覆盖启停、自启、关闭期孤儿清理、子进程 pid 跟踪与端口分配。

`tests/test_gateway_supervisor_boot.py`、`tests/test_gateway_autostart_lifespan.py` 验证 boot reconcile/自启。`tests/test_gateway_shutdown_orphans.py`、`tests/test_gateway_subprocess_windows.py`、`tests/test_gateway_process_pid.py`、`tests/test_port_allocator.py` 覆盖进程与端口。对应 [[gateway-supervisor#Gateway 监管]]。

## Instance Gateway

Instance 启停、CLI 合同、Profile 路径与 Gateway env 注入的回归测试。

`tests/test_instance_gateway_supervisor.py` 验证不调用 `start_profile` 与 health 字段。`tests/test_gateway_command_contract.py`、`tests/test_profile_paths.py`、`tests/test_gateway_secret_environment.py` 覆盖 CLI/路径/env。`tests/test_secret_isolation_and_reverify.py` 验证 naming Profile 不借用 default secrets，以及 `alreadyInstalled` 复验。见 [[gateway-supervisor#Hermes CLI 合同]]、[[profiles-instances#Profile 路径]]、[[runtime-service#配置与 Secret]]。

## Gateway Env

Gateway 子进程环境白名单继承与日志仅记录 key 名的回归测试（v1.4 FR-06）。

### Parent provider secrets not inherited

父进程 `base_env` 含 `DASHSCOPE_API_KEY` 等 provider 密钥时，命名 Profile 未在 `secrets` 中声明则子进程 env 不得包含这些变量；`API_SERVER_KEY` 仅来自 scoped secrets。

### Logs only env keys

`build_gateway_environment` 的 `gateway_env_built` 日志 kwargs 必须含 `envKeys` 且不得含密钥值或 `env`/`keys` 整表 dict。

## 任务与审批

`tests/test_v12_integration.py` 覆盖本地/Team Hub 任务 ingest、路由、审批门控、执行与 Outbox 同步的端到端流转。`tests/test_permission_service.py` 验证审批与权限。`tests/api/test_task_events_stream.py`、`tests/api/test_task_workbench_stream.py` 验证任务 SSE。对应 [[task-runtime#任务运行时]] 与 [[approval-workspace#审批与工作空间]]。

## 鉴权与配对

`tests/api/test_desktop_token.py` 覆盖 `verify_desktop_token` 白名单、Bearer device token 与遗留 header 兼容。对应 [[auth-pairing#本地鉴权与设备配对]]。

## Gateway Auth

`tests/test_gateway_client_auth.py` 验证 Runtime→Hermes 内部 Bearer 鉴权（v1.4 FR-01）。API_SERVER_KEY 不得落日志。

### Client adds Bearer token

`HermesGatewayClient` 在设置 `api_key` 时，对 `/v1/models` 等请求发送 `Authorization: Bearer <key>`。

### Chat stream adds Bearer token

Chat SSE 路径通过 Credential Broker 解析 key 并加入 Authorization header。

### Client omits auth when no key

未配置 `api_key` 时不发送 Authorization header（兼容 mock / 未启用鉴权的过渡态）。

## Workspace Chat

`tests/api/test_workspace_attachments.py` 覆盖附件上传/删除/作用域与上下文注入。对应 [[chat-sessions#Workspace Chat]]。

## Instance Chat

`tests/test_instance_chat_resolver.py` 验证 Instance Chat 仅读 `HermesInstance` 状态、不依赖 `profiles.status` 或 `ProfileRefResolver`。对应 [[chat-sessions#Instance Chat]]。

### Does not read profiles status

当 Profile `status=stopped` 而 Instance `status=running` 时，`InstanceChatService.list_models` 仍按 Instance 状态调用 Gateway；静态检查确保 `instance_ref_resolver` / `instance_chat_service` 不引用 `ProfileRefResolver` 或 `GatewayStatus`。

## 角色库

`tests/test_role_compiler.py` 验证 `SOUL.md`/`MEMORY.md`/manifest 生成与端口不写入 SOUL。`tests/test_role_library_service.py`、`tests/test_role_library_import.py`、`tests/test_role_library_preset_resolve.py` 验证角色库同步与预设导入。对应 [[profiles-instances#角色编译]]。

## MCP Compile

`tests/test_mcp_compile.py` 验证 [[runtime-service#MCP 配置编译]]：`McpConfigCompiler` 将启用中的 MCP 记录写入 Profile `config.yaml` 的 `mcp.servers` 段并保留既有配置。

### Writes Hermes config

Mock `HermesConfigAdapter` 后断言编译结果在 config dict 中包含 `mcp.servers.<name>`（stdio 含 `command`/`args`），且未覆盖其它顶层键。

## 部署与端口

`tests/test_profile_port_update.py`、`tests/api/test_profile_events.py` 覆盖 Profile 端口与事件。`tests/test_windows_bootstrap_contract.py` 验证 `.cmd` Bypass、provision 中 UserDaemon 在 smoke 之后、PythonPath/precheck/smoke 契约。对应 [[deployment#Windows Provision]]。

## Transactional update

v1.4 事务化 Hermes 更新/回滚、pinned 版本清理与 Job 取消的单元测试。

### Rebinds instances on success

`test_update_rebinds_instances` 验证 update Job 在 mock 安装成功后按 Instance 重绑 `runtime_version_id`、重启 Gateway 并激活新版本。

### Restores binding on failure

`test_update_failure_restores_instance_binding` 验证探活失败时恢复 Instance 绑定与 active 版本。

### Rejects pinned delete

`test_cleanup_rejects_pinned_version` 验证 active/被 Instance 引用的版本 DELETE 返回 `runtime_version_pinned`。

### Terminates pip subprocess

`test_job_cancel_terminates_pip` 验证取消 token 在 pip 安装期间触发 `kill()`。

## Bootstrap 配置校验

`tests/test_bootstrap_service.py` 验证 Bootstrap JSON 拒绝 Provider API Key、允许 manifest URL。对应 [[auth-pairing#Bootstrap 一次性令牌]]。

### 拒绝嵌套 Provider Key

嵌套在 `defaultInstance` 等对象内的 `providerApiKey` 等字段必须被 `find_forbidden_provider_keys` 检出。

### 允许 manifest URL

`runtimeManifestUrl` 与 `hermesManifestUrl` 为合法字段，不得误判为密钥。

## Artifact Security

`tests/test_v14_security_readiness.py` 覆盖 Manifest 签名结构校验与 Archive 路径穿越拒绝（FR-23/24）。

### Rejects path traversal

含 `../` 成员的 ZIP 在 `ArchivePolicy.safe_extract_archive` 时返回 `policy_denied`。

### Signature structure

无 `payload`/`keyId`/`signature` 的 Manifest 被 `ArtifactSignatureVerifier.validate_structure` 拒绝。

## Backup

安全备份默认排除明文 Secret（FR-26）。

### Excludes plaintext env

默认备份 ZIP 不得包含 `.env`；`manifest.json` 的 `excluded` 列出 `.env` 等条目，Secret 仅元数据。

## Runtime Readiness

Runtime 状态机含 `starting`/`ready`/`degraded`/`maintenance`/`failed`（FR-27）。

### Degraded status

当某检查项为 `failed` 或 `degraded`（如 defaultInstance）但数据库仍可用时，聚合状态为 `degraded`。

## Runtime Service Update

Runtime maintenance / service bundle apply（v1.5 FR-03）。

### Maintenance apply replaces bundle

`apply_maintenance` 解压制品、替换安装目录并返回 applied 步骤。

## Endpoint Sync

v1.5 Endpoint 身份、Sync、Desired State、Remote Task v2、Experience 的 Stub 驱动测试，见 [[endpoint-sync#Endpoint Sync]]。

### Enrollment start and complete

验证 enrollment start 生成公钥并 pending，complete 后 credential 激活且 syncEnabled。

### Enrollment revoke keeps local usable

吊销后 syncEnabled=false，本地 status 为 revoked。

### Device key sign verify

Ed25519 签名可验证，篡改消息后失败。

### Inventory endpoint

库存 API 不含 MAC 等禁止字段。

### Envelope build and verify

消息信封签名可验证，篡改 payload 后失败。

### Payload hash stable

同内容不同键序的 payload_hash 一致。

### Backoff and dead letter

指数退避递增；达到 max retries 进入 dead letter。

### Sync now pulls desired state

sync/now 拉 desired_state 入 inbox，二次拉取不再重复计数。

### Reconciliation plan install upgrade remove

对比 desired/installed 产出 install/upgrade/remove 且 profile 需重启。

### Desired state apply via sync

Stub 下发 revision 后 apply 写入 resource_installations。

### Desired state checksum failure

坏 checksum 资源 apply 抛 ConflictError。

### Remote task ingest idempotent

同 assignmentId+version 重复下发只保留一条。

### Remote task accept claim deliver

accept 后 claim/complete，状态 delivered 且有事件。

### Remote task cancel

中心 cancel 控制消息后本地 assignment 为 cancelled。

### Experience redaction

脱敏移除 apiKey/prompt 并对本机路径打标。

### Evidence and candidate submit

证据脱敏入库；candidate 经用户审核路径提交后 status=submitted，不可改 published。

## Remote Tasks

Remote Task v2 补充用例（若与 Endpoint Sync 重叠则以 Stub Center 为准）。

### Assignment idempotent ingest

重复 assignment 版本不创建第二条本地记录。

### Reject assignment

本地 reject 后状态为 rejected。

## 验收

`tests/test_v1_acceptance.py` 是 v1.3 验收用例集；v1.3.1 另以真实 Hermes/Gateway smoke（`scripts/runtime-smoke-test-windows.ps1 -RequireHermes`）为准。v1.4 另有 gated E2E（见 `tests/test_windows_e2e_gated.py`，需真实 Artifact）。

### Gated Windows Hermes E2E

门控 Hermes 安装与 Gateway 健康 smoke（需真实制品与环境变量）。

### Gated Windows Installer E2E

门控 MSI/Burn 安装器静默安装与卸载验收。
