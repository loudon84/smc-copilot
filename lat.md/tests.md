# 测试规范

`pytest` / `pytest-asyncio`，测试在 `conftest` 用 `init_db(create_all)` 建表并经 `app.state._test_*` 注入桩件、禁用 Gateway 自启与后台 worker。本节描述关键测试覆盖区域与意图，作为回归基线。具体用例见 `tests/`。

相关：[[architecture#生命周期与后台循环]]、[[tests#Runtime 核心]]。

## Runtime 核心

`tests/test_runtime_core.py` 覆盖 Runtime Job 队列串行化、写 Job 互斥、`recover_incomplete_jobs` 重启恢复、版本激活唯一性。`tests/test_checksum.py` 校验 SHA256 校验器。`tests/test_snapshot_save_schema.py` 校验 ConfigSnapshot 落盘 schema。对应 [[runtime-service#运行时 Job 队列]] 与 [[runtime-service#Job 恢复]]。

## Gateway 监管

覆盖启停、自启、关闭期孤儿清理、子进程 pid 跟踪与端口分配。

`tests/test_gateway_supervisor_boot.py`、`tests/test_gateway_autostart_lifespan.py` 验证 `reconcile_on_boot` 与自启在 lifespan 中的行为。`tests/test_gateway_shutdown_orphans.py` 验证关闭期停 Gateway 与孤儿清理。`tests/test_gateway_subprocess_windows.py`、`tests/test_gateway_process_pid.py` 验证子进程启停与 pid 跟踪。`tests/test_port_allocator.py` 验证端口分配与冲突。对应 [[gateway-supervisor#Gateway 监管]]。

## 任务与审批

`tests/test_v12_integration.py` 覆盖本地/Team Hub 任务 ingest、路由、审批门控、执行与 Outbox 同步的端到端流转。`tests/test_permission_service.py` 验证审批与权限。`tests/api/test_task_events_stream.py`、`tests/api/test_task_workbench_stream.py` 验证任务 SSE。对应 [[task-runtime#任务运行时]] 与 [[approval-workspace#审批与工作空间]]。

## 鉴权与配对

`tests/api/test_desktop_token.py` 覆盖 `verify_desktop_token` 白名单、Bearer device token 与遗留 header 兼容。对应 [[auth-pairing#本地鉴权与设备配对]]。

## Workspace Chat

`tests/api/test_workspace_attachments.py` 覆盖附件上传/删除/作用域与上下文注入。对应 [[chat-sessions#Workspace Chat]]。

## 角色库

`tests/test_role_compiler.py` 验证 `SOUL.md`/`MEMORY.md`/manifest 生成与端口不写入 SOUL。`tests/test_role_library_service.py`、`tests/test_role_library_import.py`、`tests/test_role_library_preset_resolve.py` 验证角色库同步与预设导入。对应 [[profiles-instances#角色编译]]。

## 部署与端口

`tests/test_profile_port_update.py` 验证 Profile 改端口时的重新分配与配置同步。`tests/api/test_profile_events.py` 验证 Profile 事件审计。对应 [[deployment#部署形态]] 与 [[profiles-instances#Profile 服务]]。

## 验收

`tests/test_v1_acceptance.py` 是 v1.3 验收用例集，对齐 `docs/runtime-acceptance-v1.3.md`。
