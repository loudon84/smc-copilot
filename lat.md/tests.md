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

## 任务与审批

`tests/test_v12_integration.py` 覆盖本地/Team Hub 任务 ingest、路由、审批门控、执行与 Outbox 同步的端到端流转。`tests/test_permission_service.py` 验证审批与权限。`tests/api/test_task_events_stream.py`、`tests/api/test_task_workbench_stream.py` 验证任务 SSE。对应 [[task-runtime#任务运行时]] 与 [[approval-workspace#审批与工作空间]]。

## 鉴权与配对

`tests/api/test_desktop_token.py` 覆盖 `verify_desktop_token` 白名单、Bearer device token 与遗留 header 兼容。对应 [[auth-pairing#本地鉴权与设备配对]]。

## Workspace Chat

`tests/api/test_workspace_attachments.py` 覆盖附件上传/删除/作用域与上下文注入。对应 [[chat-sessions#Workspace Chat]]。

## 角色库

`tests/test_role_compiler.py` 验证 `SOUL.md`/`MEMORY.md`/manifest 生成与端口不写入 SOUL。`tests/test_role_library_service.py`、`tests/test_role_library_import.py`、`tests/test_role_library_preset_resolve.py` 验证角色库同步与预设导入。对应 [[profiles-instances#角色编译]]。

## 部署与端口

`tests/test_profile_port_update.py`、`tests/api/test_profile_events.py` 覆盖 Profile 端口与事件。`tests/test_windows_bootstrap_contract.py` 验证 `.cmd` Bypass、provision 中 UserDaemon 在 smoke 之后、PythonPath/precheck/smoke 契约。对应 [[deployment#Windows Provision]]。

## 验收

`tests/test_v1_acceptance.py` 是 v1.3 验收用例集；v1.3.1 另以真实 Hermes/Gateway smoke（`scripts/runtime-smoke-test-windows.ps1 -RequireHermes`）为准。
