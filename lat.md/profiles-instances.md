# Profile 与 Instance

Profile 是 Hermes Gateway 运行单元；Instance 将 Profile/Gateway/RuntimeVersion 绑定。v1.3.1 起 Instance 启停不依赖 `profiles` 表行；默认 Profile 路径为 `HERMES_HOME`，命名 Profile 为 `profiles/<name>/`。

相关：[[gateway-supervisor#Gateway 监管]]、[[runtime-service#版本管理]]、[[data-model#Profile 与任务表]]。

## Profile 服务

[[src/services/profile_service.py#ProfileService]] 做 Profile CRUD：创建时校验名称唯一、经 [[gateway-supervisor#端口分配]] 分配端口、`sync_profile_config` 写 Hermes 配置；更新改端口时重新分配并同步配置；`set_status` 维护 `status`/`gateway_pid`。Profile 模型见 [[src/db/models/profile.py#Profile]]。旧 `/profiles` API 保留。

## Profile 路径

[[src/runtime/hermes_profile_paths.py#profile_home]]：`default`/空 → `settings.hermes_home_path`；命名 → `hermes_home/profiles/<name>/`。`profile_config_path` / `profile_env_path` 同步。`utils.paths` 与 Configuration/Gateway cwd 均委托该方法，禁止硬编码 `profiles/<name>` 给 default。

## Instance

[[src/db/models/runtime.py#HermesInstance]] 绑定 `profile_name`、`runtime_version_id`、`gateway_port`、`status`、`pid`、`auto_start`。状态机见 [[src/core/runtime_enums.py#InstanceStatus]]（含 `error`）。[[src/services/instance_service.py#InstanceService]] start/stop/restart 调用 Supervisor 的 Instance API，不调用 `start_profile`。安装 Job 可创建 default Instance。创建时确保 `API_SERVER_KEY`（见 [[runtime-service#配置与 Secret]]）。

## 角色编译

[[src/integrations/hermes/role_compiler.py#compile_role_files]] 将角色 spec 编译为 Profile 目录下的 `SOUL.md`、`MEMORY.md`、`profile-role.json`，并复制角色源文件到 `skills/role-source/agency-agents-zh/`。`SOUL.md` 含身份、角色来源、工作边界（按 `role_key` 查 `DELEGATION_LINES`）、默认交付物，**不含端口号**（team_v1.4 约束）。

`hash_sources` 对源文件做 SHA256 作为 checksum。角色库同步与预设导入由 [[src/services/role_library_service.py#RoleLibraryService]] 编排，按 Profile 重编译。相关测试见 [[tests#角色库]]。

## 能力协商

[[src/core/capabilities.py#CapabilityRegistry]] 暴露 `apiVersion` 与 `features` 列表（`runtime.install`、`instances.multiple`、`chat.stream`、`mcp.crud`、`pairing.device` 等），供 Desktop 在 `/runtime/capabilities` 与 `/runtime/compatibility` 协商。状态聚合见 [[src/services/runtime_status_service.py#RuntimeStatusService]]。
