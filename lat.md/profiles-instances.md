# Profile 与 Instance

Profile 是 Hermes Gateway 的运行单元（名称、类型、端口、角色），Instance 是 v1.3 引入的统一抽象，将 Profile/Gateway/RuntimeVersion 绑定。Profile 类型见 [[src/core/constants.py#ProfileType]]，Gateway 状态见 [[src/core/constants.py#GatewayStatus]]。

相关：[[gateway-supervisor#Gateway 监管]]、[[runtime-service#版本管理]]、[[data-model#Profile 与任务表]]。

## Profile 服务

[[src/services/profile_service.py#ProfileService]] 做 Profile CRUD：创建时校验名称唯一、经 [[gateway-supervisor#端口分配]] 分配端口、`sync_profile_config` 写 Hermes 配置；更新改端口时重新分配并同步配置；`set_status` 维护 `status`/`gateway_pid`。Profile 模型见 [[src/db/models/profile.py#Profile]]。

## Instance

[[src/db/models/runtime.py#HermesInstance]] 绑定 `profile_name`、`runtime_version_id`、`gateway_port`、`status`、`pid`、`auto_start`。状态机见 [[src/core/runtime_enums.py#InstanceStatus]]。安装 Job 可顺带创建 default Instance（见 [[runtime-service#安装 Job]]）。GatewaySupervisor 解析可执行文件时优先读 Instance 绑定版本。

## 角色编译

[[src/integrations/hermes/role_compiler.py#compile_role_files]] 将角色 spec 编译为 Profile 目录下的 `SOUL.md`、`MEMORY.md`、`profile-role.json`，并复制角色源文件到 `skills/role-source/agency-agents-zh/`。`SOUL.md` 含身份、角色来源、工作边界（按 `role_key` 查 `DELEGATION_LINES`）、默认交付物，**不含端口号**（team_v1.4 约束）。

`hash_sources` 对源文件做 SHA256 作为 checksum。角色库同步与预设导入由 [[src/services/role_library_service.py#RoleLibraryService]] 编排，按 Profile 重编译。相关测试见 [[tests#角色库]]。

## 能力协商

[[src/core/capabilities.py#CapabilityRegistry]] 暴露 `apiVersion` 与 `features` 列表（`runtime.install`、`instances.multiple`、`chat.stream`、`mcp.crud`、`pairing.device` 等），供 Desktop 在 `/runtime/capabilities` 与 `/runtime/compatibility` 协商。状态聚合见 [[src/services/runtime_status_service.py#RuntimeStatusService]]。
