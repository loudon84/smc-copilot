下面继续定义 `smc-copilot-serve` 的**下一阶段功能规划**。这一阶段不再停留在“本地服务 + 多 Profile 管理”，而是进入：

> **本地 Agent 执行中枢 + 团队任务协作 + 安全审批 + 桌面产品化运维**

基于前置架构文档中已经确定的模块边界：`HermesLocalService`、`多 Profile Hermes Gateway Supervisor`、`Team Task Runtime`、`任务监听服务`、`人工审批闭环`、`Workspace 安全策略`、`ai-os-full / Team Task Hub 集成方案`。

---

# 1. 下一阶段版本定义

建议下一阶段定义为：

```txt
smc-copilot-serve v1.2
目标：从“本地 Hermes 管理服务”升级为“团队协作型 Agent Runtime 服务”
```

核心目标：

```txt
1. 接收 ai-os-full / Team Task Hub 分派任务
2. 将任务绑定到本地 Hermes Profile 执行
3. 支持人工审批、任务状态同步、执行日志回传
4. 给 Electron Desktop 提供任务工作台 API
5. 为后续多 Agent 协作、人机协作、团队作战打基础
```

---

# 2. 功能模块总览

```txt
smc-copilot-serve v1.2
├─ Team Task Listener          # 团队任务监听
├─ Local Task Runtime          # 本地任务运行时
├─ Profile Task Binding        # 任务与 Hermes Profile 绑定
├─ Approval Runtime            # 人工审批闭环
├─ Workspace Guard             # 本地项目安全边界
├─ Run Event Collector         # Hermes 执行事件采集
├─ Task Sync Service           # 任务状态回传 ai-os-full
├─ Desktop Task API            # Electron 任务工作台 API
└─ Audit Log                   # 本地审计日志
```

---

# 3. P0 功能：Team Task Listener

## 3.1 功能目标

让 `smc-copilot-serve` 能从 `ai-os-full / Team Task Hub` 拉取分派给当前用户、本机设备、本地 Agent 的任务。

第一阶段建议采用 **Polling**，不要一开始做 WebSocket / MQ。

```txt
smc-copilot-serve
  └─ 每 5~15 秒轮询 Team Task Hub
       └─ 拉取 assigned 状态任务
            └─ 写入本地 SQLite
                 └─ 展示到 Desktop Task Panel
```

## 3.2 新增配置

```env
AIOS_TEAM_HUB_BASE_URL=http://127.0.0.1:9000
AIOS_TEAM_HUB_TOKEN=replace_me
AIOS_DEVICE_ID=desktop-loudon-001
AIOS_AGENT_ID=hermes-local-agent-001
AIOS_TASK_POLL_INTERVAL_SECONDS=10
```

## 3.3 新增数据表

```sql
CREATE TABLE team_task_bindings (
  id TEXT PRIMARY KEY,
  remote_task_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  local_task_id TEXT NOT NULL,
  source_agent_id TEXT,
  target_agent_id TEXT,
  device_id TEXT,
  sync_status TEXT NOT NULL,
  last_sync_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 3.4 新增接口

```txt
POST /api/v1/team-tasks/pull
GET  /api/v1/team-tasks
GET  /api/v1/team-tasks/{id}
POST /api/v1/team-tasks/{id}/claim
POST /api/v1/team-tasks/{id}/sync
```

## 3.5 验收标准

```txt
1. ai-os-full 创建一条分派任务
2. smc-copilot-serve 能自动拉取
3. 本地 SQLite 能生成 local_task
4. Electron 页面能看到该任务
5. 重复拉取不会重复创建任务
```

---

# 4. P0 功能：Local Task Runtime

## 4.1 功能目标

把远程任务转成本地可执行任务，并维护完整生命周期。

任务状态建议统一：

```txt
REMOTE_ASSIGNED      # 远程已分派
LOCAL_CREATED        # 本地已创建
WAITING_APPROVAL     # 等待审批
APPROVED             # 已审批
RUNNING              # 执行中
NEED_HUMAN_INPUT     # 等待人工输入
COMPLETED            # 完成
FAILED               # 失败
CANCELLED            # 取消
SYNCED               # 已同步远端
```

## 4.2 本地任务表

```sql
CREATE TABLE local_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL,
  source TEXT NOT NULL,
  remote_task_id TEXT,
  assignment_id TEXT,
  target_profile_id TEXT,
  workspace_id TEXT,
  status TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  payload_json TEXT,
  result_json TEXT,
  error_message TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  started_at DATETIME,
  finished_at DATETIME
);
```

## 4.3 任务类型

```txt
coding_task          # 代码开发任务
review_task          # 代码审查任务
doc_task             # 文档生成任务
research_task        # 资料分析任务
writer_task          # 生文任务
ops_task             # 运维执行任务
profile_task         # Hermes Profile 配置任务
```

## 4.4 服务文件

```txt
src/copilot_serve/services/task_runtime.py
src/copilot_serve/services/task_state_machine.py
src/copilot_serve/db/models/task.py
src/copilot_serve/api/v1/tasks.py
```

## 4.5 验收标准

```txt
1. 任务状态流转不能跳状态
2. 失败任务必须记录 error_message
3. 已完成任务必须记录 result_json
4. 任务执行过程必须能被 Electron 查询
```

---

# 5. P0 功能：Profile Task Binding

## 5.1 功能目标

不同任务类型自动绑定不同 Hermes Profile。

建议规则：

| 任务类型          | 默认 Profile |
| ------------- | ---------- |
| coding_task   | coding     |
| review_task   | coding     |
| doc_task      | writer     |
| research_task | research   |
| ops_task      | default    |
| finance_task  | finance    |
| sales_task    | sales      |

## 5.2 配置示例

```yaml
task_routing:
  coding_task:
    profile: coding
    require_approval: true
  review_task:
    profile: coding
    require_approval: false
  doc_task:
    profile: writer
    require_approval: false
  research_task:
    profile: research
    require_approval: false
  ops_task:
    profile: default
    require_approval: true
```

## 5.3 新增接口

```txt
GET  /api/v1/task-routing
PATCH /api/v1/task-routing
POST /api/v1/tasks/{task_id}/bind-profile
```

## 5.4 验收标准

```txt
1. coding_task 默认进入 coding profile
2. writer_task 默认进入 writer profile
3. 用户可以手动改绑定 profile
4. 未启动 profile 时自动提示启动
5. 启动失败时任务不能进入 RUNNING
```

---

# 6. P0 功能：Approval Runtime

## 6.1 功能目标

对高风险动作进行人工审批。

第一阶段审批范围：

```txt
1. 执行 shell command
2. 修改项目代码文件
3. git commit
4. git push
5. docker compose up/down
6. 修改 Hermes profile 配置
7. 访问非默认 workspace
```

## 6.2 审批状态

```txt
PENDING
APPROVED
REJECTED
EXPIRED
CANCELLED
```

## 6.3 审批表

```sql
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_payload TEXT,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT,
  approved_by TEXT,
  reject_reason TEXT,
  created_at DATETIME NOT NULL,
  decided_at DATETIME,
  expired_at DATETIME
);
```

## 6.4 新增接口

```txt
GET  /api/v1/approvals
GET  /api/v1/approvals/{approval_id}
POST /api/v1/approvals/{approval_id}/approve
POST /api/v1/approvals/{approval_id}/reject
POST /api/v1/tasks/{task_id}/request-approval
```

## 6.5 Electron 页面能力

```txt
任务审批弹窗
├─ 任务标题
├─ 操作类型
├─ 风险等级
├─ 影响文件
├─ 即将执行的命令
├─ Agent 说明
├─ 批准按钮
└─ 拒绝按钮
```

## 6.6 验收标准

```txt
1. 高风险命令不会直接执行
2. 未审批任务不能进入 RUNNING
3. 拒绝后任务进入 FAILED 或 CANCELLED
4. 审批记录可查询
5. 审批动作写入 audit_logs
```

---

# 7. P0 功能：Workspace Guard

## 7.1 功能目标

限制 Agent 的执行边界，防止本地误删、越权写入、误操作系统目录。

## 7.2 Workspace 表

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  type TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  policy_json TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 7.3 Policy 示例

```yaml
workspace:
  name: smc-copilot-desktop
  root_path: D:/workspace/smc-copilot-desktop

paths:
  allow:
    - apps/
    - packages/
    - docs/
    - scripts/
  deny:
    - .env
    - .env.local
    - secrets/
    - .git/config
    - node_modules/

commands:
  allow:
    - git status
    - git diff
    - pnpm test
    - pnpm build
  require_approval:
    - git commit
    - git push
    - docker compose up
    - docker compose down
  deny:
    - rm -rf
    - del /s
    - format
    - shutdown
```

## 7.4 新增接口

```txt
GET  /api/v1/workspaces
POST /api/v1/workspaces
GET  /api/v1/workspaces/{workspace_id}
PATCH /api/v1/workspaces/{workspace_id}
POST /api/v1/workspaces/{workspace_id}/validate-path
POST /api/v1/workspaces/{workspace_id}/validate-command
```

## 7.5 验收标准

```txt
1. Agent 不能写入 workspace 外部目录
2. Agent 不能读取 secrets / .env
3. 高风险命令进入审批流程
4. deny 命令直接阻断
5. 所有阻断行为写入 audit_logs
```

---

# 8. P1 功能：Run Event Collector

## 8.1 功能目标

把 Hermes Gateway 的 run events 转成本地任务事件，供 Electron 实时展示。

```txt
Hermes /v1/runs/{run_id}/events
        ↓
Run Event Collector
        ↓
local_task_events
        ↓
Electron Task Timeline
```

## 8.2 事件表

```sql
CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT,
  event_type TEXT NOT NULL,
  event_payload TEXT,
  message TEXT,
  created_at DATETIME NOT NULL
);
```

## 8.3 新增接口

```txt
GET /api/v1/tasks/{task_id}/events
GET /api/v1/tasks/{task_id}/events/stream
```

## 8.4 Electron 展示

```txt
Task Timeline
├─ 任务已创建
├─ 已绑定 coding profile
├─ 等待审批
├─ 审批通过
├─ Hermes run created
├─ Agent planning
├─ Tool call
├─ File changed
├─ Test running
├─ Completed
└─ Synced
```

---

# 9. P1 功能：Task Sync Service

## 9.1 功能目标

将本地任务状态同步回 `ai-os-full / Team Task Hub`。

同步内容：

```txt
1. 本地任务状态
2. Hermes run_id
3. 执行日志摘要
4. 审批结果
5. 任务产物
6. 错误信息
```

## 9.2 同步策略

```txt
任务创建后同步一次
任务状态变化后同步一次
任务完成后同步一次
任务失败后同步一次
服务重启后补偿同步
```

## 9.3 新增表

```sql
CREATE TABLE sync_outbox (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

采用 outbox 机制，避免网络失败导致状态丢失。

---

# 10. P1 功能：Desktop Task Workbench API

## 10.1 功能目标

给 Electron 提供任务工作台接口。

页面建议：

```txt
Task Workbench
├─ 左侧：任务列表
├─ 中间：任务详情 / Agent 执行过程
├─ 右侧：审批 / Workspace / Profile / 日志
└─ 底部：Hermes run events
```

## 10.2 API 聚合接口

```txt
GET /api/v1/desktop/task-workbench/summary
GET /api/v1/desktop/task-workbench/tasks
GET /api/v1/desktop/task-workbench/tasks/{task_id}
GET /api/v1/desktop/task-workbench/pending-approvals
GET /api/v1/desktop/task-workbench/runtime-status
```

## 10.3 summary 返回结构

```json
{
  "profiles": {
    "running": 3,
    "stopped": 1,
    "error": 0
  },
  "tasks": {
    "waiting_approval": 2,
    "running": 1,
    "failed": 0,
    "completed_today": 5
  },
  "approvals": {
    "pending": 2
  },
  "team_sync": {
    "online": true,
    "last_sync_at": "2026-05-20T10:00:00+08:00"
  }
}
```

---

# 11. P2 功能：Skill / Tool 管理

## 11.1 功能目标

后续让 Desktop 能管理 Hermes Skill / Tool，而不是只管理 Profile。

功能：

```txt
1. 查看当前 profile 已安装 skills
2. 查看当前 profile 可用 tools
3. 安装 skill
4. 禁用 skill
5. skill 与 profile 绑定
6. skill 执行权限配置
```

## 11.2 接口

```txt
GET  /api/v1/profiles/{profile_id}/skills
POST /api/v1/profiles/{profile_id}/skills/install
POST /api/v1/profiles/{profile_id}/skills/{skill_id}/enable
POST /api/v1/profiles/{profile_id}/skills/{skill_id}/disable

GET  /api/v1/profiles/{profile_id}/tools
PATCH /api/v1/profiles/{profile_id}/tools/{tool_id}/policy
```

这部分放 P2，不要影响 v1.2 主线。

---

# 12. P2 功能：本地运维与升级

## 12.1 功能目标

为 Windows 10 Home 一键部署做准备。

功能：

```txt
1. 检查 Python / uv / Git / Node / pnpm
2. 检查 Hermes Agent 安装状态
3. 检查 profile 配置完整性
4. 检查端口占用
5. 检查 smc-copilot-serve 服务状态
6. 检查 Electron 与 serve 版本兼容
7. 支持本地日志导出
```

## 12.2 接口

```txt
GET  /api/v1/doctor
POST /api/v1/doctor/run
GET  /api/v1/doctor/report
POST /api/v1/system/export-logs
GET  /api/v1/system/version
```

---

# 13. 下一阶段代码任务拆分

## Sprint 1：Task Runtime 基础

```txt
- 新增 local_tasks 表
- 新增 task_events 表
- 新增 TaskRuntimeService
- 新增 TaskStateMachine
- 新增 /api/v1/tasks
- Electron 可查看本地任务列表
```

## Sprint 2：Team Task Listener

```txt
- 新增 TeamHubClient
- 新增 task polling worker
- 新增 team_task_bindings 表
- 新增 /api/v1/team-tasks/pull
- 实现远程任务落本地
```

## Sprint 3：Profile Binding + Hermes Run

```txt
- 新增 task_routing 配置
- 实现任务自动绑定 profile
- 实现 task -> Hermes run
- 实现 run_id 与 task 绑定
- 实现基础 run events 采集
```

## Sprint 4：Approval Runtime

```txt
- 新增 approvals 表
- 新增 approval service
- 高风险任务进入 WAITING_APPROVAL
- Electron 显示审批列表
- 审批通过后继续执行
```

## Sprint 5：Workspace Guard

```txt
- 新增 workspaces 表
- 新增 command policy
- 新增 path policy
- 执行前 validate
- 阻断 / 审批 / 审计
```

## Sprint 6：Task Sync Service

```txt
- 新增 sync_outbox 表
- 状态变化写 outbox
- 后台 worker 同步 Team Hub
- 失败重试
- 服务重启补偿同步
```

---

# 14. v1.2 最小可交付版本

不建议 v1.2 做太大。最小可交付版本应包含：

```txt
必须完成：
1. 本地任务表 local_tasks
2. 任务事件表 task_events
3. Team Task polling
4. 远程任务落本地
5. 任务绑定 Hermes Profile
6. 创建 Hermes run
7. 采集 run events
8. 任务状态同步
9. 基础审批
10. Electron 任务工作台 API
```

暂缓：

```txt
1. WebSocket 任务推送
2. 多人实时协作编辑
3. 复杂 MQ
4. Skill Marketplace
5. 自动升级系统
6. 插件热加载
7. 多设备冲突调度
```

---

# 15. 下一阶段目录增量

基于上一版目录，v1.2 需要重点新增：

```txt
src/copilot_serve/
├─ api/v1/
│  ├─ tasks.py
│  ├─ team_tasks.py
│  ├─ approvals.py
│  ├─ workspaces.py
│  └─ desktop_workbench.py
│
├─ services/
│  ├─ task_runtime.py
│  ├─ task_state_machine.py
│  ├─ task_listener.py
│  ├─ task_sync_service.py
│  ├─ approval_service.py
│  ├─ workspace_guard.py
│  └─ run_event_collector.py
│
├─ integrations/
│  ├─ team_hub/
│  │  ├─ client.py
│  │  ├─ dto.py
│  │  └─ errors.py
│  └─ hermes/
│     ├─ run_client.py
│     └─ event_stream.py
│
├─ db/models/
│  ├─ task.py
│  ├─ task_event.py
│  ├─ team_task_binding.py
│  ├─ approval.py
│  ├─ workspace.py
│  └─ sync_outbox.py
│
└─ workers/
   ├─ task_listener_worker.py
   ├─ run_event_worker.py
   └─ sync_outbox_worker.py
```

---

# 16. 下一阶段最终验收场景

## 场景：同事 Agent 分派代码任务给我

```txt
1. 同事 Agent 在 ai-os-full 创建任务
2. Team Task Hub 分派给 loudon 的本地 Agent
3. smc-copilot-serve polling 到任务
4. 写入 local_tasks
5. Electron Task Workbench 显示新任务
6. 任务类型为 coding_task
7. 自动绑定 coding profile
8. 发现该任务需要改代码，进入 WAITING_APPROVAL
9. 用户审批通过
10. smc-copilot-serve 调用 Hermes coding profile 创建 run
11. Hermes 执行任务
12. run events 写入 task_events
13. Electron 实时显示执行过程
14. 任务完成
15. 状态同步回 ai-os-full
16. 审计日志保留完整执行链路
```

这就是下一阶段的主线功能。不要先扩展太多 UI，先把 **任务从远端进来、本地可控执行、审批可追溯、结果能回传** 这条链路打通。
