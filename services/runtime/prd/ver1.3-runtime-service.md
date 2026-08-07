# ai-os-serve Runtime Service 改造 PRD

版本：v1.3
项目：`ai-os-serve`
目标文件：`prd/ver1.3-runtime-service.md`
适用仓库：`https://github.com/loudon84/ai-os-serve`
关联项目：`copilot-desktop`、`hermes-agent`
状态：待实施

---

## 1. 项目背景

当前产品由以下三个部分组成：

```text
copilot-desktop
ai-os-serve
hermes-agent
```

现有职责存在重叠：

1. `copilot-desktop` 负责页面、对话、本地服务启动和部分 Hermes 配置。
2. `ai-os-serve` 负责 Profile、Gateway、模型与运行代理、任务、审批和 Workspace。
3. `hermes-agent` 负责模型调用、工具执行、Skill、MCP、Memory、Session 和 Gateway。

当前 `ai-os-serve` 已作为 Desktop 的本地控制面运行，默认提供：

```text
http://127.0.0.1:8765
```

当前项目已经具备：

* FastAPI 服务；
* SQLite 数据库；
* Alembic Migration；
* Hermes Profile 管理；
* Gateway 启动、停止和状态检查；
* Gateway 日志；
* Hermes models/runs 代理；
* Chat 和任务事件流；
* 审批；
* Workspace；
* Windows Service；
* Desktop Token 校验。

当前主要问题：

1. Desktop 仍负责启动和停止 `ai-os-serve`。
2. Desktop 生命周期与 Runtime 生命周期绑定。
3. Hermes Agent 仍被视为外部前置环境。
4. `ai-os-serve` 不负责 Hermes Agent 安装、更新和回滚。
5. Desktop 仍可能直接访问 Hermes 配置或执行 Hermes 命令。
6. Profile、Gateway、Runtime Version 尚未统一为 Instance。
7. MCP 缺少完整的管理接口。
8. Desktop Token 仍是静态共享 Token。
9. Windows Service 与 Desktop Spawn 可能发生端口冲突。
10. Runtime 程序文件与 Hermes 用户数据缺少明确隔离。

---

## 2. 产品定位

### 2.1 新定位

`ai-os-serve` 改造为本机常驻的 **Hermes Runtime Service**。

其职责是：

```text
Hermes Agent 安装
Hermes Agent 更新与回滚
Runtime 版本管理
Hermes Instance 管理
Gateway 进程监管
Profile 管理
端口分配
配置管理
MCP 管理
Chat 代理
Session 访问
日志与诊断
Desktop 设备配对
本地接口鉴权
后台服务生命周期
```

### 2.2 产品关系

```text
┌──────────────────────────────────────┐
│ copilot-desktop                      │
│                                      │
│ 用户登录                             │
│ Runtime 连接                         │
│ 对话                                 │
│ Session                              │
│ MCP 设置页面                         │
│ Desktop 设置                         │
└──────────────────┬───────────────────┘
                   │ REST / SSE
                   │ 127.0.0.1
                   ▼
┌──────────────────────────────────────┐
│ ai-os-serve                          │
│ Hermes Runtime Service               │
│                                      │
│ 安装 / 更新 / 回滚                   │
│ Instance / Gateway                   │
│ Config / MCP / Secret                │
│ Chat / Session Proxy                 │
│ Logs / Doctor / Backup               │
└──────────────────┬───────────────────┘
                   │ CLI / HTTP / SSE
                   ▼
┌──────────────────────────────────────┐
│ hermes-agent                         │
│                                      │
│ Agent Loop                           │
│ Models / Tools / Skills              │
│ MCP / Memory / Session               │
│ Gateway                              │
└──────────────────────────────────────┘
```

### 2.3 核心边界

`copilot-desktop` 不再负责：

* 安装 Python；
* 安装 Hermes Agent；
* 创建 Hermes venv；
* 启动 Hermes Gateway；
* 直接执行 Hermes CLI；
* 直接读取 `~/.hermes`；
* 直接修改 `config.yaml`；
* 直接修改 `.env`；
* 直接查询 Hermes SQLite；
* 保存 Provider Secret；
* 维护 SSH 远程命令镜像。

`ai-os-serve` 不负责：

* 对话页面渲染；
* Desktop 窗口生命周期；
* 企业用户界面；
* 模型推理逻辑；
* Hermes Agent 内部工具实现；
* Skill 内容生成；
* Memory 算法；
* 企业组织和权限中心。

`hermes-agent` 继续负责：

* 对话执行；
* 模型调用；
* Tool 调用；
* Skill；
* Plugin；
* MCP Tool 注册；
* Memory；
* Session 数据；
* Gateway 协议。

---

## 3. 完成目标

### 3.1 总目标

在现有 `ai-os-serve` 仓库中完成 Runtime Service 改造，使其成为 Desktop 与 Hermes Agent 之间唯一的本地服务边界。

### 3.2 交付目标

完成后必须支持：

1. 独立安装 `ai-os-serve`。
2. 独立安装 Hermes Agent。
3. 检测 Hermes Agent 是否已安装。
4. 查询 Hermes Agent 当前版本。
5. 安装指定 Hermes Agent 版本。
6. 更新 Hermes Agent。
7. 回滚 Hermes Agent。
8. 管理多个 Hermes Instance。
9. 管理每个 Instance 的 Gateway。
10. 管理每个 Instance 的 Profile 和端口。
11. 统一代理 Chat SSE。
12. 查询和管理 Session。
13. 管理 MCP Server。
14. 管理模型和 Provider 配置。
15. Provider Secret 不返回 Desktop Renderer。
16. 提供 Doctor、日志和运行状态。
17. Desktop 退出后 Runtime Service 继续运行。
18. Desktop 更新不影响 Hermes Agent。
19. Hermes Agent 更新不要求 Desktop 同步更新。
20. Windows 支持用户级后台运行。
21. 保留 Windows Service 企业部署方式。
22. API 通过 Capability 判断兼容性。

---

## 4. 非目标

v1.3 不包含：

* 重写 Hermes Agent；
* 修改 Hermes Agent Agent Loop；
* 自建模型网关；
* 自建模型推理服务；
* 企业多租户；
* 企业组织架构；
* 云端 Runtime 调度；
* Linux 系统级多用户共享 Runtime；
* macOS 正式安装包；
* Task Orchestrator 重构；
* Team Hub 正式接入；
* Skill 商店；
* Plugin 商店；
* 知识库管理；
* Desktop 页面开发。

现有 Task、Team Task、Workbench、Approval 模块继续保留，但不得成为 Runtime Core 的依赖。

---

## 5. 设计原则

### 5.1 Runtime 独立运行

Runtime Service 必须由操作系统启动，不由 Desktop Main Process作为默认方式启动。

```text
Desktop 启动
→ 连接 Runtime Service
→ 不创建 Runtime 子进程
```

```text
Desktop 退出
→ Runtime Service 保持运行
→ Hermes Gateway 按 Instance 策略保持运行
```

### 5.2 Runtime 与用户数据分离

程序文件、版本文件和用户数据必须分开。

```text
Runtime 程序
~/.hermes-runtime/

Hermes 用户数据
~/.hermes/
```

禁止将 Hermes 用户配置放入 Runtime 版本目录。

### 5.3 版本隔离

不同 Hermes Agent 版本必须安装到独立目录。

禁止原地覆盖当前版本。

### 5.4 API 优先

Desktop 所需能力必须通过 Runtime API 提供。

不得要求 Desktop 读取 Runtime 文件或 Hermes 文件。

### 5.5 能力协商

Desktop 必须通过 `/runtime/capabilities` 获取功能列表。

不得仅通过版本号判断接口是否存在。

### 5.6 失败可恢复

安装、更新、迁移和回滚必须使用 Job 模型。

失败后必须保留日志和错误码，不得留下半安装状态。

### 5.7 最小权限

Runtime 默认只监听：

```text
127.0.0.1
```

不得默认监听：

```text
0.0.0.0
```

---

## 6. 目标架构

```text
src/
├─ api/
│  └─ v1/
│     ├─ health.py
│     ├─ system.py
│     ├─ runtime.py
│     ├─ runtime_jobs.py
│     ├─ runtime_versions.py
│     ├─ instances.py
│     ├─ configurations.py
│     ├─ secrets.py
│     ├─ mcp_servers.py
│     ├─ chat.py
│     ├─ sessions.py
│     ├─ diagnostics.py
│     ├─ pairings.py
│     ├─ gateways.py
│     ├─ profiles.py
│     ├─ tasks.py
│     └─ approvals.py
│
├─ core/
│  ├─ config.py
│  ├─ lifecycle.py
│  ├─ errors.py
│  ├─ logging.py
│  ├─ capabilities.py
│  └─ security.py
│
├─ db/
│  ├─ models/
│  │  ├─ runtime_version.py
│  │  ├─ runtime_job.py
│  │  ├─ runtime_artifact.py
│  │  ├─ instance.py
│  │  ├─ device_pairing.py
│  │  ├─ secret_reference.py
│  │  ├─ config_snapshot.py
│  │  └─ audit_log.py
│  └─ repositories/
│
├─ integrations/
│  └─ hermes/
│     ├─ cli_adapter.py
│     ├─ gateway_adapter.py
│     ├─ profile_adapter.py
│     ├─ config_adapter.py
│     ├─ mcp_adapter.py
│     ├─ session_adapter.py
│     └─ version_adapter.py
│
├─ runtime/
│  ├─ gateway_process.py
│  ├─ process_supervisor.py
│  ├─ port_allocator.py
│  ├─ command_runner.py
│  ├─ artifact_downloader.py
│  ├─ checksum_verifier.py
│  ├─ version_layout.py
│  ├─ activation_manager.py
│  └─ environment_probe.py
│
├─ services/
│  ├─ gateway_supervisor.py
│  ├─ profile_service.py
│  ├─ instance_service.py
│  ├─ runtime_status_service.py
│  ├─ runtime_job_service.py
│  ├─ installation_service.py
│  ├─ update_service.py
│  ├─ rollback_service.py
│  ├─ doctor_service.py
│  ├─ backup_service.py
│  ├─ configuration_service.py
│  ├─ mcp_service.py
│  ├─ secret_service.py
│  ├─ pairing_service.py
│  ├─ chat_stream_service.py
│  └─ session_service.py
│
├─ local_service/
│  ├─ service_cli.py
│  ├─ service_runner.py
│  ├─ windows_service.py
│  ├─ windows_user_daemon.py
│  ├─ systemd_user_service.py
│  └─ launch_agent.py
│
├─ workers/
│  ├─ runtime_job_worker.py
│  ├─ gateway_health_worker.py
│  └─ cleanup_worker.py
│
├─ schemas/
└─ main.py
```

---

## 7. 模块划分

## 7.1 Runtime Status

职责：

* 返回 Runtime Service 状态；
* 返回 Hermes Agent 安装状态；
* 返回当前激活版本；
* 返回数据目录；
* 返回支持能力；
* 返回操作系统和架构。

接口：

```text
GET /api/v1/runtime/status
GET /api/v1/runtime/capabilities
GET /api/v1/runtime/compatibility
```

响应示例：

```json
{
  "serviceVersion": "1.3.0",
  "apiVersion": "1.0",
  "status": "ready",
  "hermesInstalled": true,
  "activeHermesVersion": "0.19.0",
  "platform": "windows",
  "architecture": "x86_64",
  "features": [
    "runtime.install",
    "runtime.update",
    "runtime.rollback",
    "runtime.doctor",
    "instances.multiple",
    "chat.stream",
    "sessions.read",
    "mcp.crud",
    "mcp.test"
  ]
}
```

---

## 7.2 Runtime Job

安装、更新、回滚、Doctor、Backup 和 Restore 必须通过 Job 执行。

Job 类型：

```text
install
update
rollback
doctor
backup
restore
config_migrate
runtime_cleanup
```

Job 状态：

```text
pending
running
succeeded
failed
cancelled
```

接口：

```text
POST /api/v1/runtime/jobs
GET  /api/v1/runtime/jobs
GET  /api/v1/runtime/jobs/{job_id}
GET  /api/v1/runtime/jobs/{job_id}/events
POST /api/v1/runtime/jobs/{job_id}/cancel
```

事件类型：

```text
job.started
job.phase_changed
job.progress
job.log
job.completed
job.failed
job.cancelled
```

Job 约束：

1. 同一时间只允许一个写 Runtime 的 Job。
2. Doctor 可以与只读操作并行。
3. Update 和 Rollback 必须加全局 Runtime Lock。
4. Job 事件必须持久化。
5. 服务重启后必须将未完成 Job 标记为 `failed` 或恢复执行。
6. Job 日志不得写入 Secret。

---

## 7.3 Hermes Agent 安装

### 7.3.1 安装入口

```text
POST /api/v1/runtime/install
```

请求：

```json
{
  "version": "latest",
  "channel": "stable",
  "force": false,
  "createDefaultInstance": true
}
```

返回：

```json
{
  "jobId": "uuid",
  "status": "pending"
}
```

### 7.3.2 安装流程

```text
创建 Job
→ 获取 Runtime Lock
→ 检测平台和架构
→ 检测磁盘空间
→ 检测网络
→ 获取版本 Manifest
→ 下载安装 Artifact
→ 校验 SHA-256
→ 解压到 staging
→ 创建隔离 Python 环境
→ 安装 Hermes Agent
→ 读取 Hermes 版本
→ 执行 hermes config migrate
→ 执行 hermes doctor
→ 写入 runtime_versions
→ 原子切换 active 版本
→ 创建默认 Instance
→ 启动默认 Gateway
→ 执行健康检查
→ 完成 Job
```

### 7.3.3 安装失败处理

失败时必须：

* 停止新版本产生的进程；
* 删除 staging；
* 不修改当前 active 版本；
* 保留 Job 日志；
* 写入标准错误码；
* 不删除用户数据；
* 不覆盖现有配置。

标准错误码：

```text
runtime_lock_conflict
unsupported_platform
unsupported_architecture
insufficient_disk_space
network_unavailable
manifest_invalid
artifact_download_failed
checksum_mismatch
python_runtime_failed
hermes_install_failed
config_migrate_failed
doctor_failed
activation_failed
gateway_health_failed
```

---

## 7.4 Hermes Agent 版本管理

接口：

```text
GET  /api/v1/runtime/versions
GET  /api/v1/runtime/versions/{version}
POST /api/v1/runtime/update
POST /api/v1/runtime/rollback
DELETE /api/v1/runtime/versions/{version}
```

版本状态：

```text
installed
active
inactive
invalid
pending_delete
```

更新流程：

```text
备份配置
→ 安装新版本到独立目录
→ 执行兼容性检查
→ 停止所有受影响 Gateway
→ 切换 active 版本
→ 执行配置迁移
→ 重启 Gateway
→ 执行健康检查
→ 成功则保留旧版本
→ 失败则恢复旧版本
```

删除约束：

1. 禁止删除 active 版本。
2. 至少保留一个可启动版本。
3. 最近一个旧版本默认保留。
4. 正在被 Instance 固定使用的版本不得删除。

---

## 7.5 Runtime 目录规范

Windows：

```text
%LOCALAPPDATA%\HermesRuntime\
├─ service\
├─ versions\
├─ downloads\
├─ staging\
├─ logs\
├─ backups\
├─ runtime.db
└─ active.json
```

Linux/macOS：

```text
~/.hermes-runtime/
├─ service/
├─ versions/
├─ downloads/
├─ staging/
├─ logs/
├─ backups/
├─ runtime.db
└─ active.json
```

Hermes 用户数据保持：

```text
~/.hermes/
├─ config.yaml
├─ .env
├─ state.db
├─ profiles/
├─ skills/
├─ memories/
└─ jobs.json
```

禁止行为：

* Runtime 更新删除 `~/.hermes`；
* Runtime 版本目录保存用户 Secret；
* Hermes Profile 写入 Runtime 程序目录；
* Desktop 直接依赖 Runtime 物理路径。

---

## 7.6 Instance 管理

### 7.6.1 定义

Instance 是 Runtime 对外的运行单元。

```text
Instance
= Hermes Profile
+ Gateway Process
+ Gateway Port
+ Runtime Version
+ Config Scope
+ Runtime Status
```

### 7.6.2 数据结构

```json
{
  "id": "uuid",
  "name": "default",
  "profileName": "default",
  "runtimeVersion": "0.19.0",
  "gatewayPort": 8642,
  "status": "running",
  "healthy": true,
  "autoStart": true,
  "pid": 12345
}
```

### 7.6.3 状态

```text
created
stopped
starting
running
degraded
stopping
restarting
failed
```

### 7.6.4 接口

```text
GET    /api/v1/instances
POST   /api/v1/instances
GET    /api/v1/instances/{instance_id}
PATCH  /api/v1/instances/{instance_id}
DELETE /api/v1/instances/{instance_id}

POST /api/v1/instances/{instance_id}/start
POST /api/v1/instances/{instance_id}/stop
POST /api/v1/instances/{instance_id}/restart

GET /api/v1/instances/{instance_id}/health
GET /api/v1/instances/{instance_id}/logs
GET /api/v1/instances/{instance_id}/events
```

### 7.6.5 兼容处理

现有 `/profiles` API 暂时保留。

内部实现改为：

```text
Profiles API
→ InstanceService
→ ProfileAdapter
```

禁止继续维护两套 Gateway 启停逻辑。

---

## 7.7 Gateway Supervisor

复用当前：

```text
src/runtime/gateway_process.py
src/runtime/port_allocator.py
src/services/gateway_supervisor.py
```

改造要求：

1. Gateway 启动路径来自 `RuntimeVersionRegistry`。
2. 不再使用自由 Shell 命令字符串。
3. 启动参数由代码拼装。
4. 每个 Instance 绑定一个 Runtime Version。
5. Gateway 日志路径由 Instance ID 隔离。
6. Gateway 崩溃时更新 Instance 状态。
7. 支持配置自动重启次数。
8. 支持启动超时。
9. 支持停止超时和强制终止。
10. 服务启动时执行进程 Reconcile。

启动命令必须按参数数组执行：

```python
[
    hermes_executable,
    "gateway",
    "run",
    "--profile",
    profile_name,
    "--port",
    str(gateway_port),
]
```

禁止：

```python
shell=True
```

禁止 API 接收任意 Gateway Command。

---

## 7.8 配置管理

接口：

```text
GET   /api/v1/instances/{instance_id}/configuration
PATCH /api/v1/instances/{instance_id}/configuration
POST  /api/v1/instances/{instance_id}/configuration/validate
POST  /api/v1/instances/{instance_id}/configuration/reload
```

配置分组：

```text
model
provider
auxiliary
compression
toolsets
gateway
memory
session
runtime
```

要求：

1. Runtime 通过 Hermes Config Adapter 读写配置。
2. API 不直接返回 `.env` 全文。
3. 修改前创建 Config Snapshot。
4. 修改后执行配置校验。
5. 需要重启的配置自动重启 Instance。
6. 支持热加载的配置不重启。
7. 更新失败时恢复 Snapshot。

---

## 7.9 Secret 管理

Secret 类型：

```text
provider_api_key
provider_token
mcp_secret
remote_runtime_token
```

接口：

```text
PUT    /api/v1/secrets/{scope}/{name}
DELETE /api/v1/secrets/{scope}/{name}
GET    /api/v1/secrets/{scope}
```

GET 只返回：

```json
{
  "name": "DASHSCOPE_API_KEY",
  "configured": true,
  "updatedAt": "2026-07-23T00:00:00Z"
}
```

禁止返回 Secret 明文。

Windows 默认使用：

```text
Windows Credential Manager
或 DPAPI CurrentUser
```

开发环境允许使用加密文件，但不得提交密钥。

---

## 7.10 MCP 管理

接口：

```text
GET    /api/v1/instances/{instance_id}/mcp/servers
POST   /api/v1/instances/{instance_id}/mcp/servers
GET    /api/v1/instances/{instance_id}/mcp/servers/{server_id}
PUT    /api/v1/instances/{instance_id}/mcp/servers/{server_id}
DELETE /api/v1/instances/{instance_id}/mcp/servers/{server_id}

POST /api/v1/instances/{instance_id}/mcp/servers/{server_id}/test
POST /api/v1/instances/{instance_id}/mcp/servers/{server_id}/enable
POST /api/v1/instances/{instance_id}/mcp/servers/{server_id}/disable
```

MCP 数据：

```json
{
  "id": "uuid",
  "name": "markitdown",
  "transport": "stdio",
  "command": "markitdown-mcp",
  "args": [],
  "url": null,
  "enabled": true,
  "secretConfigured": false,
  "status": "healthy",
  "lastTestAt": "2026-07-23T00:00:00Z",
  "lastError": null
}
```

支持 Transport：

```text
stdio
sse
streamable-http
```

安全要求：

1. `command` 必须是可执行文件路径或受信任命令名。
2. 禁止完整 Shell 字符串。
3. 禁止 `cmd /c`、`powershell -Command` 等通用执行入口。
4. MCP 测试必须有超时。
5. 测试进程结束后必须清理。
6. MCP Secret 通过 Secret Reference 保存。
7. MCP 配置变更必须写 Audit Log。

---

## 7.11 Chat 代理

现有 Chat 和 Hermes Runs 能力继续复用。

统一接口：

```text
POST /api/v1/instances/{instance_id}/chat/runs
GET  /api/v1/instances/{instance_id}/chat/runs/{run_id}
GET  /api/v1/instances/{instance_id}/chat/runs/{run_id}/events
POST /api/v1/instances/{instance_id}/chat/runs/{run_id}/cancel
```

统一 SSE 事件：

```text
message.started
message.delta
reasoning.delta
tool.started
tool.progress
tool.completed
approval.request
clarification.request
usage
message.completed
error
ping
```

兼容期保留现有事件：

```text
chat.chunk
chat.tool_progress
chat.usage
chat.done
chat.error
```

适配层负责将旧事件转换为新事件。

Desktop 不得直接连接 Hermes Gateway 端口。

---

## 7.12 Session

接口：

```text
GET    /api/v1/instances/{instance_id}/sessions
GET    /api/v1/instances/{instance_id}/sessions/{session_id}
PATCH  /api/v1/instances/{instance_id}/sessions/{session_id}
DELETE /api/v1/instances/{instance_id}/sessions/{session_id}
GET    /api/v1/instances/{instance_id}/sessions/search
```

Runtime 只通过 Hermes Session Adapter 访问 Session。

禁止 Runtime 自行维护第二套对话历史。

---

## 7.13 Doctor 与诊断

接口：

```text
POST /api/v1/runtime/doctor
GET  /api/v1/runtime/doctor/{job_id}
GET  /api/v1/diagnostics/summary
GET  /api/v1/diagnostics/logs
GET  /api/v1/diagnostics/environment
```

诊断项：

```text
Runtime Service 状态
数据库状态
Migration 状态
磁盘空间
Hermes Agent 版本
Hermes 可执行文件
Hermes Home
config.yaml
.env 存在性
Profile 数量
Gateway 端口
Gateway 健康
MCP 配置
Python Runtime
网络访问
权限
日志目录
```

诊断响应不得包含：

* API Key；
* Token；
* `.env` 内容；
* Authorization Header；
* 完整用户消息。

---

## 7.14 Backup 与 Restore

接口：

```text
POST /api/v1/runtime/backups
GET  /api/v1/runtime/backups
POST /api/v1/runtime/backups/{backup_id}/restore
DELETE /api/v1/runtime/backups/{backup_id}
```

备份范围：

```text
Hermes config
Hermes profiles
Hermes sessions
Hermes skills
Hermes memories
Runtime instance registry
Runtime config snapshots
```

默认不备份：

* Runtime 下载缓存；
* staging；
* 临时日志；
* 进程 PID；
* 未加密 Secret 明文。

---

## 8. 设备配对与接口鉴权

## 8.1 配对流程

```text
Desktop 发现 Runtime
→ POST /pairings/start
→ Runtime 创建一次性 challenge
→ Desktop 确认
→ POST /pairings/{id}/confirm
→ Runtime 签发 device token
→ Runtime 保存 token hash
→ Desktop Main 保存 token
```

接口：

```text
POST   /api/v1/pairings/start
POST   /api/v1/pairings/{pairing_id}/confirm
GET    /api/v1/devices
DELETE /api/v1/devices/{device_id}
```

## 8.2 Token 要求

1. `/health` 可免认证。
2. `/pairings/start` 仅限 loopback。
3. 其余接口默认需要认证。
4. Token 不进入 Desktop Renderer。
5. Runtime 数据库只保存 Token Hash。
6. Token 支持吊销。
7. Token 包含 Device ID。
8. 所有写操作记录 Device ID。

## 8.3 Header

建议统一为：

```text
Authorization: Bearer <device-token>
```

兼容期支持：

```text
X-Copilot-Desktop-Token
```

旧 Header 标记为 Deprecated。

---

## 9. 服务运行方式

## 9.1 Windows 普通用户

默认使用用户级后台进程：

```text
用户登录
→ 启动 Hermes Runtime Service
→ 绑定 127.0.0.1:8765
```

实现：

```text
windows_user_daemon.py
Task Scheduler 登录触发
或 Startup 注册
```

不要求管理员权限。

## 9.2 Windows 企业部署

保留：

```text
HermesLocalService
```

要求：

1. 明确服务账号。
2. 明确 Hermes Home 路径。
3. 不与用户级 Daemon 同时启动。
4. 安装脚本检测端口冲突。
5. Secret Store 与服务账号匹配。

## 9.3 开发环境

```bash
uv run uvicorn main:app \
  --app-dir src \
  --host 127.0.0.1 \
  --port 8765
```

## 9.4 Desktop 行为

Desktop 只负责：

```text
发现服务
连接服务
显示状态
提示安装
发起 Runtime Job
```

Desktop 不直接启动 Uvicorn。

开发模式允许通过显式配置启动测试实例，但不得作为生产默认行为。

---

## 10. 数据模型

## 10.1 runtime_versions

```text
id
version
channel
install_path
executable_path
python_path
checksum
status
metadata_json
installed_at
activated_at
created_at
updated_at
```

## 10.2 runtime_jobs

```text
id
job_type
status
phase
progress
request_json
result_json
error_code
error_message
created_by_device_id
created_at
started_at
completed_at
```

## 10.3 runtime_job_events

```text
id
job_id
sequence
event_type
level
message
payload_json
created_at
```

## 10.4 instances

```text
id
name
profile_name
runtime_version_id
gateway_port
status
healthy
auto_start
pid
last_error
created_at
updated_at
```

## 10.5 config_snapshots

```text
id
instance_id
reason
runtime_version
snapshot_path
checksum
created_at
```

## 10.6 device_pairings

```text
id
challenge_hash
status
expires_at
created_at
confirmed_at
```

## 10.7 devices

```text
id
name
token_hash
status
last_seen_at
created_at
revoked_at
```

## 10.8 secret_references

```text
id
scope_type
scope_id
secret_name
storage_provider
storage_key
created_at
updated_at
```

## 10.9 audit_logs

```text
id
device_id
action
resource_type
resource_id
result
metadata_json
created_at
```

---

## 11. Migration

新增 Alembic Migration：

```text
xxxx_add_runtime_versions.py
xxxx_add_runtime_jobs.py
xxxx_add_runtime_job_events.py
xxxx_add_instances.py
xxxx_add_config_snapshots.py
xxxx_add_devices_and_pairings.py
xxxx_add_secret_references.py
xxxx_add_audit_logs.py
```

Migration 要求：

1. 不删除现有 Profile 数据。
2. 将现有 Profile 转换为 Instance。
3. 保留原 Profile ID 映射。
4. 将现有 Gateway Port 迁移到 Instance。
5. 迁移失败时事务回滚。
6. Migration 必须有升级测试。
7. 不在应用启动时使用 `create_all`。

---

## 12. 现有代码处理清单

## 12.1 直接复用

```text
src/app.py
src/main.py
src/core/config.py
src/core/lifecycle.py
src/runtime/gateway_process.py
src/runtime/port_allocator.py
src/services/gateway_supervisor.py
src/services/profile_service.py
src/services/chat_stream_service.py
src/services/approval_service.py
src/local_service/windows_service.py
src/local_service/service_cli.py
数据库与 Alembic 基础
日志基础
SSE 基础
```

## 12.2 重构

| 当前模块                  | 改造                                |
| --------------------- | --------------------------------- |
| ProfileService        | 内部并入 InstanceService              |
| GatewaySupervisor     | 绑定 Runtime Version                |
| GatewayProcessManager | 使用固定 executable path              |
| Lifecycle             | 增加 Runtime Job 恢复                 |
| Desktop Token         | 改为 Device Pairing                 |
| Chat Stream           | 统一事件协议                            |
| API Error             | 增加 Runtime 错误码                    |
| Windows Service       | 增加用户级 Daemon                      |
| Config                | 拆分 Service Config 与 Hermes Config |
| Logs                  | 按 Service、Job、Instance 分目录        |

## 12.3 新增

```text
RuntimeVersionRegistry
InstallationService
UpdateService
RollbackService
RuntimeJobService
RuntimeJobWorker
EnvironmentProbe
ArtifactDownloader
ChecksumVerifier
ActivationManager
InstanceService
ConfigurationService
McpService
SecretService
PairingService
DoctorService
BackupService
CapabilityRegistry
```

## 12.4 暂时保留

```text
Tasks
Team Tasks
Task Routing
Workbench
Approvals
Workspaces
Team Hub Stub
```

要求：

```text
Runtime Core 不得 import Task 模块
Runtime Core 不得依赖 Team Hub
Runtime 安装不初始化 Team Hub
```

---

## 13. 配置项

新增 `.env.example`：

```dotenv
RUNTIME_HOST=127.0.0.1
RUNTIME_PORT=8765
RUNTIME_DATA_DIR=
RUNTIME_LOG_DIR=
RUNTIME_DOWNLOAD_DIR=
RUNTIME_STAGING_DIR=
RUNTIME_BACKUP_DIR=

HERMES_HOME=
HERMES_RUNTIME_CHANNEL=stable
HERMES_MANIFEST_URL=
HERMES_INSTALL_TIMEOUT_SECONDS=900
HERMES_DOCTOR_TIMEOUT_SECONDS=300
HERMES_GATEWAY_START_TIMEOUT_SECONDS=60
HERMES_GATEWAY_STOP_TIMEOUT_SECONDS=20

RUNTIME_REQUIRE_AUTH=true
RUNTIME_ALLOW_LEGACY_TOKEN=false
RUNTIME_LEGACY_TOKEN=

RUNTIME_MAX_OLD_VERSIONS=2
RUNTIME_JOB_LOG_RETENTION_DAYS=30
RUNTIME_GATEWAY_LOG_RETENTION_DAYS=14
```

配置规则：

1. Production 默认 `RUNTIME_REQUIRE_AUTH=true`。
2. `RUNTIME_HOST` 默认必须为 `127.0.0.1`。
3. 绑定其他地址必须显式开启。
4. Secret 不得写入普通配置日志。
5. 路径在启动时标准化为绝对路径。

---

## 14. API 错误格式

统一格式：

```json
{
  "error": {
    "code": "runtime_lock_conflict",
    "message": "Another runtime job is running",
    "details": {
      "jobId": "uuid"
    },
    "requestId": "uuid"
  }
}
```

禁止继续同时返回多种错误结构。

HTTP 映射：

| 错误类型                | HTTP |
| ------------------- | ---: |
| validation_error    |  400 |
| unauthorized        |  401 |
| forbidden           |  403 |
| not_found           |  404 |
| conflict            |  409 |
| invalid_state       |  409 |
| runtime_job_failed  |  422 |
| gateway_unavailable |  503 |
| hermes_client_error |  502 |
| internal_error      |  500 |

---

## 15. 日志规范

目录：

```text
logs/
├─ service/
│  └─ runtime-service.log
├─ jobs/
│  └─ {job_id}.log
└─ instances/
   └─ {instance_id}/
      ├─ gateway.stdout.log
      └─ gateway.stderr.log
```

日志字段：

```text
timestamp
level
request_id
device_id
job_id
instance_id
component
event
message
```

必须脱敏：

```text
Authorization
API Key
Token
Password
.env value
MCP Secret
Provider Secret
```

---

## 16. 安全要求

1. 默认只监听 Loopback。
2. 默认开启鉴权。
3. Token 只由 Desktop Main 保存。
4. Renderer 不获得 Token。
5. 不提供通用 Shell API。
6. 子进程使用参数数组。
7. 禁止 `shell=True`。
8. 下载 Artifact 必须校验 Hash。
9. Runtime 切换使用原子写。
10. Secret 不写普通数据库明文字段。
11. API 不返回 `.env`。
12. 日志必须脱敏。
13. 配置修改必须写审计。
14. MCP Command 必须经过执行策略。
15. 文件操作必须限制在 Runtime 和 Hermes 数据目录。
16. Backup Restore 必须校验文件路径。
17. Pairing Challenge 必须过期。
18. Device Token 支持吊销。
19. CORS 默认关闭。
20. SSE 使用同一鉴权策略。

---

## 17. 开发阶段

## Phase 1：Runtime Core

目标：

* 建立 Runtime Status；
* 建立 Capability；
* 建立 Runtime Version；
* 建立 Runtime Job；
* 建立目录规范；
* 增加 Migration。

开发项：

```text
runtime_versions
runtime_jobs
runtime_job_events
CapabilityRegistry
RuntimeStatusService
RuntimeJobService
RuntimeJobWorker
GET /runtime/status
GET /runtime/capabilities
GET /runtime/jobs
```

验收：

1. Runtime 状态接口可用。
2. Job 可创建和查询。
3. Job 事件可通过 SSE 获取。
4. 服务重启后未完成 Job 状态可恢复。
5. 新 Migration 测试通过。

---

## Phase 2：Hermes 安装

目标：

* Runtime 可安装 Hermes Agent；
* 安装失败不影响现有环境。

开发项：

```text
EnvironmentProbe
ArtifactDownloader
ChecksumVerifier
VersionLayout
InstallationService
HermesCliAdapter
POST /runtime/install
```

验收：

1. 空环境可完成 Hermes 安装。
2. 可读取安装版本。
3. 安装后 `hermes doctor` 通过。
4. 安装失败不创建 active 版本。
5. 进度事件完整。
6. 用户数据不被覆盖。

---

## Phase 3：Instance 重构

目标：

* Profile 和 Gateway 对外统一为 Instance。

开发项：

```text
Instance model
InstanceService
Profile migration
GatewaySupervisor version binding
Instance API
旧 Profiles API 适配
```

验收：

1. 现有 Profile 自动转换为 Instance。
2. Instance 可启动、停止、重启。
3. 多 Instance 端口不冲突。
4. Gateway 崩溃后状态正确。
5. 旧 Profile API 仍能工作。

---

## Phase 4：更新和回滚

目标：

* 支持多 Hermes 版本；
* 支持失败回滚。

开发项：

```text
UpdateService
RollbackService
ActivationManager
ConfigSnapshot
CompatibilityService
版本清理
```

验收：

1. 可从旧版本升级。
2. 升级失败自动切回旧版本。
3. 回滚后 Gateway 可启动。
4. active 版本不可删除。
5. 配置迁移前自动备份。

---

## Phase 5：Config、Secret、MCP

目标：

* Desktop 不再直接修改 Hermes 文件。

开发项：

```text
ConfigurationService
SecretService
McpService
ExecutablePolicy
配置和 MCP API
```

验收：

1. 可通过 API 修改模型配置。
2. Secret 不出现在 GET 响应。
3. MCP 可新增、编辑、测试和删除。
4. MCP 测试超时可终止。
5. 配置错误时自动恢复。
6. 需要重启的配置自动重启 Instance。

---

## Phase 6：Pairing 与 Desktop 接入

目标：

* 替换静态 Desktop Token；
* Desktop 不再 Spawn Runtime。

开发项：

```text
PairingService
Device model
Device Token
Legacy Token adapter
Desktop connection contract
```

验收：

1. 未配对设备无法访问写接口。
2. 配对后可访问 Runtime。
3. Token 吊销立即生效。
4. Token 不返回 Renderer。
5. Desktop 退出后 Runtime 保持运行。
6. Runtime 未启动时 Desktop 提供明确状态。

---

## Phase 7：交付与清理

目标：

* 完成 Windows 用户级后台运行；
* 清理旧启动链路。

开发项：

```text
windows_user_daemon.py
安装脚本
升级脚本
卸载脚本
端口冲突检测
Runtime Service 自更新预留
```

验收：

1. 用户登录后 Runtime 自动启动。
2. 不需要管理员权限。
3. Windows Service 模式仍可选。
4. 两种运行方式不会同时启动。
5. 卸载 Runtime 默认保留 Hermes 用户数据。
6. 完成安装冒烟测试。

---

## 18. 测试要求

## 18.1 Unit Test

覆盖：

```text
Runtime Job 状态机
Runtime Version 状态机
Instance 状态机
端口分配
路径校验
Checksum
配置快照
Secret 脱敏
MCP Command 策略
Pairing Challenge
Token Hash
```

## 18.2 Integration Test

覆盖：

```text
安装 Hermes
启动默认 Instance
Gateway Health
Chat SSE
停止 Gateway
重启 Gateway
配置修改
MCP Test
更新
回滚
Backup
Restore
```

## 18.3 Failure Test

覆盖：

```text
下载中断
Checksum 错误
磁盘空间不足
Doctor 失败
Gateway 启动超时
Gateway 被强制 Kill
配置迁移失败
端口占用
数据库 Migration 失败
Runtime 重启
Job 中断
Token 过期
MCP 进程超时
```

## 18.4 Windows Smoke Test

新增：

```text
scripts/runtime-precheck-windows.ps1
scripts/runtime-install-windows.ps1
scripts/runtime-upgrade-windows.ps1
scripts/runtime-uninstall-windows.ps1
scripts/runtime-smoke-test-windows.ps1
```

Smoke Test 必须验证：

```text
health
capabilities
runtime status
Hermes installed
instance list
gateway start
gateway health
models
chat run
chat events
gateway stop
doctor
```

---

## 19. 完成验收标准

v1.3 完成必须满足以下全部条件：

### Runtime 独立性

* [ ] Desktop 不再默认 Spawn `ai-os-serve`。
* [ ] Desktop 退出后 Runtime 保持运行。
* [ ] Runtime 可独立启动。
* [ ] Runtime 可独立升级。

### Hermes 安装

* [ ] Runtime 可检测 Hermes Agent。
* [ ] Runtime 可安装 Hermes Agent。
* [ ] Runtime 可更新 Hermes Agent。
* [ ] Runtime 可回滚 Hermes Agent。
* [ ] 安装失败不破坏当前版本。
* [ ] 用户数据与 Runtime 版本分离。

### Instance

* [ ] Profile 与 Gateway 已统一为 Instance。
* [ ] 支持多个 Instance。
* [ ] 支持端口自动分配。
* [ ] 支持健康检查。
* [ ] 支持崩溃状态识别。
* [ ] 支持自动启动。

### API

* [ ] 提供 Runtime Status。
* [ ] 提供 Capability。
* [ ] 提供 Runtime Job。
* [ ] 提供 Instance API。
* [ ] 提供 Config API。
* [ ] 提供 MCP API。
* [ ] 提供 Chat SSE。
* [ ] 提供 Session API。
* [ ] API 错误格式统一。

### 安全

* [ ] 默认仅监听 `127.0.0.1`。
* [ ] 默认要求认证。
* [ ] Device Token 不进入 Renderer。
* [ ] Secret 不通过 GET 返回。
* [ ] 禁止通用 Shell 执行。
* [ ] 安装 Artifact 校验 Hash。
* [ ] 日志完成脱敏。
* [ ] 写操作有审计记录。

### 兼容

* [ ] 原 `/profiles` API 保留兼容。
* [ ] 原 Chat 事件支持过渡。
* [ ] 现有 Task 模块仍可运行。
* [ ] Runtime Core 不依赖 Task 或 Team Hub。
* [ ] Alembic Migration 可从当前数据库升级。

---

## 20. 风险与处理

| 风险                      | 处理                           |
| ----------------------- | ---------------------------- |
| Hermes CLI 参数发生变化       | 统一由 HermesCliAdapter 封装      |
| Config Migration 不可逆    | 更新前创建 Snapshot 和 Backup      |
| Windows Service 用户目录不同  | 普通用户默认使用 User Daemon         |
| Desktop 与 Runtime 版本不一致 | Capability Negotiation       |
| Gateway 端口被占用           | PortAllocator 启动前二次检测        |
| Update 中途退出             | Job 恢复和 staging 清理           |
| 多 Runtime 同时启动          | Instance Lock + Port Lock    |
| Secret 泄漏               | Secret Store + 日志脱敏          |
| MCP Command 执行风险        | Executable Policy            |
| 旧 API 影响 Desktop        | 保留 Compatibility Adapter     |
| SQLite 写锁               | Runtime Job 单写锁              |
| Hermes 数据结构变化           | Session、Config 通过 Adapter 访问 |

---

## 21. Cursor 实施规则

Cursor 按 Phase 顺序实施。

每个 Phase 必须执行：

```text
1. 读取当前相关源码
2. 输出 implementation-plan.md
3. 列出修改文件
4. 创建或更新 Migration
5. 编写单元测试
6. 编写集成测试
7. 更新 docs/api-contract.md
8. 更新 .env.example
9. 执行 ruff
10. 执行 pytest
11. 输出验收记录
```

禁止：

* 一次性重写全部源码；
* 跳过 Migration；
* 在 API Handler 中直接执行安装；
* 在 API Handler 中直接操作 subprocess；
* 使用 `shell=True`；
* 直接返回 Secret；
* 删除旧 Profile API；
* 将 Task 模块并入 Runtime Core；
* 在应用启动时执行 `create_all`；
* 未测试就删除旧 Desktop Spawn 逻辑。

---

## 22. 每阶段输出文件

```text
docs/
├─ runtime-architecture.md
├─ runtime-installation.md
├─ runtime-versioning.md
├─ runtime-security.md
├─ runtime-desktop-contract.md
└─ api-contract.md

prd/
└─ ver1.3-runtime-service.md

tests/
├─ unit/
├─ integration/
└─ windows/

scripts/
├─ runtime-precheck-windows.ps1
├─ runtime-install-windows.ps1
├─ runtime-upgrade-windows.ps1
├─ runtime-uninstall-windows.ps1
└─ runtime-smoke-test-windows.ps1
```

---

## 23. 最终边界

```text
copilot-desktop
= 用户界面和桌面能力

ai-os-serve
= Hermes Runtime Service

hermes-agent
= Hermes 执行引擎
```

Runtime Service 是 Desktop 访问 Hermes Agent 的唯一入口。

Desktop 不再拥有 Hermes 安装环境、Gateway 进程和配置文件。

Hermes Agent 不依赖 Desktop 是否运行。

Runtime、Desktop 和 Hermes Agent 分别维护版本，通过 API 和 Capability 保持兼容。
