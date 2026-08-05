# 审批与工作空间

风险操作（任务执行、命令运行、路径写入）经审批门控与工作空间路径/命令策略拦截。审批与 Workspace Guard 是本地执行安全的两道闸门（见 [[design-decisions#风险操作门控]]）。

相关：[[task-runtime#任务路由]]、[[data-model#Profile 与任务表]]、[[tests#任务与审批]]。

## 审批运行时

[[src/services/approval_service.py#ApprovalService]] `request_approval` 创建 `Approval`（pending）并写 `approval_requested` 事件/审计。`approve` 置 `approved`，若任务在 `waiting_approval` 则迁移 `approved` 并入 Outbox。`reject` 置 `rejected`，按 `AIOS_TASK_REJECT_SETS_CANCELLED` 迁移到 `cancelled` 或 `failed`。状态见 [[src/core/enums.py#ApprovalStatus]]。

`execute_run` 在执行前调 `any_pending_for_task` 阻止未决审批的任务运行。审批与任务状态迁移都经 [[task-runtime#任务状态机]] 校验。

## Workspace Guard

[[src/services/workspace_guard.py#WorkspaceGuard]] `validate_path_with_policy` 先用 `Path.resolve` + `relative_to` 防止路径逃逸 workspace root，再按 `policy_json` 的 `paths.allow/deny`（fnmatch）放行/拒绝。`classify_command` 按 `commands.deny/require_approval/allow` 将命令归类为 `deny`/`require_approval`/`allow`。

`TaskRuntimeService._ensure_workspace_allowed` 在执行前对启用的工作空间校验任务 payload 中的相对路径。路径逃逸抛 `PolicyError`。

## 可执行策略

[[src/runtime/executable_policy.py#ExecutablePolicy]] `validate_command` 用于 MCP stdio 与进程命令：禁止 shell 元字符（`;|&\`回车换行`）、禁止 shell 入口（cmd/powershell/pwsh/bash/sh 等）、禁止 `/c`/`-Command`/`-EncodedCommand` 等危险参数。这是 PRD §7.10 的执行策略闸门，防止命令注入。
