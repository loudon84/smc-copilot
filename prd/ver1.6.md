# smc-copilot-serve v1.6

# 真实执行面、可靠事件流与生产治理 PRD

## 1. 文档信息

| 项目         | 内容                                          |
| ---------- | ------------------------------------------- |
| 产品名称       | smc-copilot-serve                           |
| 仓库         | `loudon84/ai-os-serve`                      |
| PRD 版本     | v1.6                                        |
| 基线提交       | `1be3c39f85eb283967225996c655cc2f7831980e`  |
| 基线 API     | Runtime API `1.2`                           |
| 目标 API     | Runtime API `1.3`                           |
| 建议分支       | `feature/runtime-v1.6-production-execution` |
| 目标平台       | Windows 11 Pro x64                          |
| 优先级        | P0                                          |
| 主要调用方      | Copilot Desktop                             |
| 上游控制面      | Work Copilot Service Center                 |
| Agent 执行引擎 | Hermes Agent                                |
| 文档用途       | Cursor 实施开发、测试和验收基线                         |

---

# 2. 版本定位

## 2.1 版本演进

```text
v1.3
Hermes 安装与本地 Runtime 基础

v1.4
Instance、Gateway、Chat、配置、MCP、更新与企业安装

v1.5
Endpoint、Desired State、Remote Task、Experience 控制面结构

v1.6
真实 Hermes 执行、真实资源安装、可靠事件交付、生产连接和运行治理
```

v1.6 不再以“API 和数据模型是否存在”作为完成标准，而以以下生产闭环作为完成标准：

```text
Service Center 下发任务
→ Runtime 持久化并认领
→ 准备真实 Profile / Skill / MCP
→ 启动或选择 Hermes Instance
→ 执行真实 Agent Run
→ 持久化 SSE、Tool、Approval、Artifact 事件
→ 续租、取消和故障恢复
→ 上传结果并确认交付
→ 形成脱敏经验证据
```

---

# 3. 产品定位

`smc-copilot-serve` 是安装在员工电脑上的：

> 企业 Work Copilot 本地可信执行节点。

负责：

* Hermes Runtime 生命周期；
* 企业 Endpoint 身份；
* 本地 Instance 和 Gateway；
* 企业资源同步与应用；
* 远程任务执行；
* 本地任务状态；
* 审批与策略执行；
* 事件持久化和交付；
* Artifact 管理；
* 经验证据采集；
* 本地诊断和可观测性。

不负责：

* 组织架构主数据；
* 企业用户和 RBAC 主数据；
* Expert Factory；
* StaffDeck 服务端审核；
* nodeskclaw 服务端治理；
* AutoTask 业务编排器；
* 邮件业务服务；
* 企业知识库；
* RPA 引擎；
* LLM 推理；
* Hermes Agent Loop。

---

# 4. 系统职责边界

## 4.1 Copilot Desktop

负责：

* 用户登录；
* Work 工作台；
* Chat 与任务窗口；
* 专家和专家团队选择；
* Approval UI；
* Skill、MCP 和资源状态展示；
* Artifact 预览和另存为；
* Experience Candidate 审核；
* Runtime 状态和诊断入口。

Desktop 不得：

* 直接操作 Hermes 进程；
* 直接修改 `~/.hermes`；
* 直接访问 Endpoint 私钥；
* 直接连接 Service Center 执行任务；
* 自行维护任务状态机。

---

## 4.2 smc-copilot-serve

负责：

```text
Desktop Local API
Endpoint Sync
Desired State Reconciliation
Task Runtime
Hermes Instance Adapter
Policy Enforcement
Event Store
Artifact Delivery
Experience Capture
Runtime Supervision
```

---

## 4.3 Work Copilot Service Center

负责：

* 用户和 Endpoint 绑定；
* Endpoint 注册和吊销；
* Desired State 生成；
* Assignment 下发；
* Task Lease；
* Artifact 预签名地址；
* 任务状态聚合；
* Audit 汇总；
* StaffDeck、nodeskclaw、copilot-docker 的平台适配。

Service Center 不得直接调用终端 Hermes Gateway。

---

## 4.4 Hermes Agent

负责：

* 模型调用；
* Agent Loop；
* Tool 调用；
* Skill 执行；
* MCP 调用；
* Context 和 Memory；
* 子智能体执行；
* Session 持久化。

Runtime 通过稳定 Adapter 使用 Hermes，不复制其内部实现。

---

# 5. v1.6 核心目标

v1.6 必须完成：

1. 关闭生产环境 Stub Service Center；
2. 建立生产级 Service Center 长连接 Client；
3. 修复 Inbox、ACK、Cursor 的事务顺序；
4. 实现消息签名和重放保护；
5. 将 Desired State 从元数据落盘升级为真实资源安装；
6. 实现 Profile、Skill、Plugin、MCP 的资源 Adapter；
7. 将 Remote Task 接入真实 Hermes Instance；
8. 建立本地 Task、Run、Event、Approval、Artifact 统一模型；
9. 支持 SSE 断线重放；
10. 支持任务租约续期；
11. 支持真实取消、超时和 Runtime 重启恢复；
12. 支持 Artifact 流式、分块和断点续传；
13. 建立 Worker Supervisor；
14. 建立运行指标、SLO、诊断包和审计链；
15. 自动从真实任务事件生成 Experience Evidence；
16. 完成正式 Windows 安装、升级、签名与 E2E；
17. 保持 Runtime API 1.2 一个版本的兼容期。

---

# 6. 非目标

v1.6 不实现：

* Service Center 服务端；
* Desktop React 页面；
* nodeskclaw 服务端；
* copilot-docker Expert Factory；
* StaffDeck Review 页面；
* 企业知识库检索；
* 邮件收发；
* RPA 流程设计器；
* 业务系统工作流；
* 多机分布式 Runtime；
* Kubernetes；
* macOS/Linux 正式安装包；
* 自动发布 Skill。

---

# 7. 目标架构

```text
┌───────────────────────────────────────────┐
│ Copilot Desktop                           │
│                                           │
│ Work Task Window                          │
│ Approval UI                               │
│ Artifact Preview                          │
│ Runtime Status                            │
└───────────────────┬───────────────────────┘
                    │ Loopback API 1.3
                    │ SSE + Last-Event-ID
                    ▼
┌───────────────────────────────────────────┐
│ smc-copilot-serve                         │
│                                           │
│ Local API                                 │
│ Task Control Plane                        │
│ Run/Event Store                           │
│ Worker Supervisor                         │
│ Policy Engine                             │
│ Resource Reconciler                       │
│ Endpoint Sync                             │
│ Artifact Manager                          │
│ Experience Capture                        │
│ Hermes Runtime Adapter                    │
└──────────────┬─────────────────┬──────────┘
               │                 │
       HTTPS / Device Auth       │ Gateway HTTP/SSE
               │                 │ CLI
               ▼                 ▼
┌───────────────────────┐  ┌──────────────────────┐
│ Work Copilot Center   │  │ Hermes Agent         │
│                       │  │                      │
│ Desired State         │  │ Agent Loop           │
│ Assignment / Lease    │  │ Tool / Skill / MCP   │
│ Artifact Service      │  │ Session / Memory     │
│ StaffDeck Bridge      │  │ Model Provider       │
└───────────────────────┘  └──────────────────────┘
```

---

# 8. 核心设计原则

## 8.1 本地事实优先

Service Center 保存 Desired State。

Runtime 保存 Actual State。

任务是否真正运行、资源是否真正安装、Artifact 是否真正产生，以 Runtime 的实际验证结果为准。

---

## 8.2 先持久化，再广播，再交付

所有任务事件必须遵循：

```text
生成事件
→ 本地数据库提交
→ Desktop SSE 广播
→ Delivery Outbox
→ Service Center ACK
```

禁止先向 Desktop 或 Center 发送，再写数据库。

---

## 8.3 Stub 不得进入生产模式

部署模式固定为：

```text
development_stub
staging_http
production_http
```

规则：

* `development_stub`：允许 Stub Client；
* `staging_http`：必须配置 HTTPS Center；
* `production_http`：必须配置 HTTPS Center、认证、域名白名单和签名公钥；
* Stable 安装包默认 `production_http`；
* 生产模式发现 Stub 时启动失败。

---

## 8.4 Runtime 不复制 Hermes

以下能力必须通过 Hermes Adapter 调用：

* Chat；
* Session；
* Tool；
* Skill；
* Plugin；
* MCP；
* Agent interrupt；
* Gateway health；
* Model usage。

---

## 8.5 本地安全策略可以更严格

策略合并：

```text
Effective Policy =
Center Policy
∩ Local Enterprise Policy
∩ User Approval
```

Center 不得降低本地安全约束。

---

# 9. Phase 0：生产发布门禁修复

## FR-001：修正 CI 分支

Workflow 必须覆盖：

```yaml
branches:
  - master
  - main
  - feature/runtime-v1.6-*
```

默认分支和 Release 分支必须真实触发测试。

---

## FR-002：真实 Runtime Launcher

删除：

```text
把 .cmd 文件复制并重命名为 .exe
```

使用以下任一实现：

* 独立 Rust Launcher；
* PyInstaller Onefile Launcher；
* Nuitka Launcher；
* C# .NET Single File Launcher。

Launcher 负责：

* 解析安装目录；
* 定位嵌入式 Python；
* 注入 Runtime 环境；
* 启动 Uvicorn；
* 写入 PID；
* 处理 Stop Signal；
* 返回明确退出码。

---

## FR-003：Stable E2E 强制执行

Stable Channel：

* 未配置 E2E 环境必须失败；
* 不允许输出提示后跳过；
* 必须验证真实 Hermes Artifact；
* 必须验证真实 Installer；
* 必须验证真实 Chat SSE；
* 必须验证升级和回滚。

---

## FR-004：正式 Manifest 发布

Release Pipeline 输出：

```text
runtime-release-manifest.json
runtime-release-manifest.sig
SBOM.spdx.json
provenance.json
SMC-Copilot-Runtime-Setup-<version>.exe
SMC-Copilot-Runtime-<version>-x64.msi
runtime-bundle-<version>-win-x64.zip
```

Manifest 必须发布到正式 Artifact Repository，不只保留为 GitHub Actions 临时 Artifact。

---

## FR-005：Maintenance 安全解压

替换直接 `extractall`。

必须验证：

* ZIP Slip；
* 绝对路径；
* NTFS Alternate Data Stream；
* Symlink；
* 最大文件数；
* 最大展开体积；
* 单文件最大值；
* Manifest；
* SHA-256；
* Ed25519 Signature；
* Runtime Version；
* Platform；
* Architecture。

---

# 10. 生产级 Service Center Client

## FR-101：Deployment Mode

新增：

```text
AIOS_DEPLOYMENT_MODE=
development_stub
staging_http
production_http
```

生产模式启动检查：

```text
Center Base URL
Domain Allowlist
Manifest Public Key
Runtime Auth
Legacy Token Disabled
Device Credential
TLS Trust
```

检查失败时返回非零退出码。

---

## FR-102：共享 HTTP Client

新增：

```text
ServiceCenterTransport
```

全服务共享一个 `httpx.AsyncClient`：

* Connection Pool；
* Keep-Alive；
* Connect Timeout；
* Read Timeout；
* Write Timeout；
* Pool Timeout；
* 禁止自动 Redirect；
* 响应体大小限制；
* Graceful Close。

不得每个请求创建新的 Client。

---

## FR-103：重试策略

只重试：

```text
408
425
429
500
502
503
504
ConnectError
ReadTimeout
```

禁止自动重试：

```text
Enrollment Complete
Task Complete
Artifact Complete
Experience Submit
```

除非请求携带有效 `Idempotency-Key`。

支持：

* `Retry-After`；
* 指数退避；
* Jitter；
* 最大尝试次数；
* 最大累计时间。

---

## FR-104：Circuit Breaker

状态：

```text
closed
open
half_open
```

按 Host 统计：

* 连续失败数；
* 最近成功时间；
* 最近错误；
* Open Until；
* Half-open Probe。

Circuit Open 时：

* 本地任务继续；
* Outbox 保留；
* 不高频请求 Center；
* Desktop 显示 Offline。

---

## FR-105：设备请求签名

每个敏感请求增加：

```text
X-Endpoint-Id
X-Request-Id
X-Timestamp
X-Nonce
X-Body-SHA256
X-Device-Signature
```

签名原文：

```text
METHOD
PATH
BODY_SHA256
TIMESTAMP
NONCE
```

Center 响应也应支持签名验证。

---

## FR-106：协议协商

新增：

```http
GET /api/v1/runtime-contract
```

返回：

```json
{
  "protocolVersions": ["1.0"],
  "assignmentVersions": ["2"],
  "desiredStateVersions": ["1"],
  "eventSchemaVersions": ["1"],
  "artifactProtocolVersions": ["1"]
}
```

协议不兼容时停止对应 Channel，不影响本地 Chat。

---

# 11. 可靠同步协议

## FR-201：正确的 Inbox 事务顺序

新流程：

```text
Pull Changes
→ 验证签名
→ 验证 Sequence
→ 写 SyncInbox
→ Dispatch Domain Handler
→ 更新 Cursor
→ 本地 Commit
→ 写 AckOutbox
→ Ack Worker 发送 ACK
```

禁止在本地 Commit 前发送 ACK。

---

## FR-202：ACK Outbox

新增：

```text
sync_ack_outbox
```

字段：

```text
id
endpoint_id
channel
message_id
cursor
status
attempt_count
next_attempt_at
last_error
created_at
acknowledged_at
```

---

## FR-203：Cursor 连续性

只有满足以下条件才推进 Cursor：

* 当前 Sequence 已处理；
* 之前 Sequence 无缺口；
* Domain 操作已提交；
* Inbox 状态为 `processed` 或明确 `ignored`。

发现缺口时：

```text
channel.status = sequence_gap
停止推进 Cursor
请求 Center 重放
```

---

## FR-204：消息签名和重放保护

验证：

* Endpoint ID；
* Tenant ID；
* Message ID；
* Sequence；
* Timestamp；
* Nonce；
* Payload Hash；
* Center Signature。

重放消息进入：

```text
replay_rejected
```

不再次执行业务操作。

---

## FR-205：Poison Message

单条消息连续处理失败后：

```text
received
→ processing
→ retry
→ quarantined
```

进入隔离区后允许后续 Sequence 按策略继续，避免整个 Channel 永久阻塞。

---

## FR-206：逐事件交付确认

Center 的事件批量接口应返回：

```json
{
  "accepted": ["event-1"],
  "duplicate": ["event-2"],
  "rejected": [
    {
      "eventId": "event-3",
      "code": "schema_invalid"
    }
  ]
}
```

Runtime 按单个事件更新状态，不再整批统一成功或失败。

---

# 12. 真实 Desired State

## FR-301：资源 Adapter

定义：

```python
class ResourceAdapter(Protocol):
    resource_type: str

    async def validate(...)
    async def stage(...)
    async def apply(...)
    async def verify(...)
    async def rollback(...)
    async def remove(...)
```

实现：

```text
ProfileResourceAdapter
ExpertBundleResourceAdapter
SkillResourceAdapter
PluginResourceAdapter
McpResourceAdapter
PolicyResourceAdapter
```

---

## FR-302：Artifact 下载与验证

新增：

```text
ArtifactDownloader
ArtifactVerifier
ArtifactCache
```

流程：

```text
Download to .partial
→ Streaming SHA-256
→ Signature Verify
→ Manifest Verify
→ Archive Security Scan
→ Atomic Rename into Cache
```

禁止只根据测试用字符串判断 checksum。

---

## FR-303：Profile 应用

流程：

```text
解析 Profile Bundle
→ 检查 forbidden keys
→ 创建版本目录
→ 写 profile.yaml / SOUL.md / instructions
→ 绑定 Skill / Plugin / MCP 引用
→ hermes config check
→ hermes profile info
→ 切换版本软链接或版本指针
→ 重启对应 Instance
→ Gateway Health
```

---

## FR-304：Skill 应用

调用真实 Hermes CLI：

```text
hermes skills inspect
hermes skills check
hermes skills audit
```

要求：

* 安装到对应 Instance/Profile；
* 保留旧版本；
* 验证 `SKILL.md`；
* 验证依赖；
* 安全审计失败禁止启用。

---

## FR-305：Plugin 应用

流程：

```text
Manifest Validate
→ Dependency Validate
→ Static Policy Scan
→ hermes plugins install
→ hermes plugins enable
→ Gateway Restart
→ Health Probe
```

---

## FR-306：MCP 应用

流程：

```text
Center MCP Definition
→ Local Secret Resolution
→ mcp_config_compiler
→ hermes config check
→ hermes mcp test
→ Instance Restart
→ Tool Discovery Verify
```

缺失 Secret 时：

```text
status = blocked
conflict = missing_secret
```

不得标记为 `installed`。

---

## FR-307：Revision 级事务回滚

一个 Revision 中任一资源失败：

```text
停止后续操作
→ 按逆序 rollback 已完成操作
→ 恢复 Instance 配置
→ 重启旧版本
→ Health Probe
→ Revision = rolled_back
```

不允许只回滚最后一个资源。

---

## FR-308：Actual State Probe

Actual State 必须来自真实探针：

* 文件版本；
* Hermes CLI；
* Gateway；
* Tool Discovery；
* MCP Test；
* Skill Status；
* Plugin Status。

不得只读取 `resource_installations` 表。

---

# 13. 统一 Task、Run、Event 模型

## FR-401：WorkTask

新增：

```text
work_tasks
```

字段：

```text
id
source
source_task_id
assignment_id
title
task_type
priority
status
profile_id
instance_id
deadline
approval_policy_json
workspace_policy_json
tool_policy_json
data_policy_json
created_at
updated_at
completed_at
```

---

## FR-402：TaskRun

新增：

```text
task_runs
```

字段：

```text
id
task_id
run_number
status
hermes_session_id
gateway_instance_id
lease_id
started_at
finished_at
exit_reason
usage_json
error_code
error_detail
checkpoint_json
```

---

## FR-403：Task Event

新增：

```text
task_run_events
```

字段：

```text
id
task_id
run_id
sequence
event_type
schema_version
payload_json
payload_artifact_id
visibility
redaction_status
created_at
```

约束：

```text
UNIQUE(run_id, sequence)
```

---

## FR-404：标准事件类型

```text
task.created
task.validating
task.ready
task.claimed
task.started
task.progress
task.paused
task.resumed
task.cancel.requested
task.cancelled
task.completed
task.failed
task.expired

agent.message.started
agent.message.delta
agent.message.completed

tool.started
tool.progress
tool.completed
tool.failed

approval.required
approval.resolved
approval.expired

artifact.created
artifact.upload.started
artifact.upload.completed
artifact.upload.failed

runtime.instance.selected
runtime.instance.started
runtime.instance.restarted
runtime.recovery.started
runtime.recovery.completed
```

---

## FR-405：事件 payload 上限

默认：

```text
Inline Payload <= 64 KB
```

超过上限：

```text
payload → Local Artifact
event.payload_artifact_id → Artifact ID
```

---

## FR-406：SSE 重放

新增：

```http
GET /api/v1/tasks/{taskId}/events/stream
Last-Event-ID: <sequence>
```

Runtime 从数据库补发未接收事件，再进入实时流。

Desktop 刷新或断网后不得丢失工具调用和审批事件。

---

# 14. 真实 Hermes Task Executor

## FR-501：HermesRuntimeAdapter

定义：

```python
class HermesRuntimeAdapter:
    async def ensure_instance(...)
    async def start_run(...)
    async def stream_run(...)
    async def cancel_run(...)
    async def get_session(...)
    async def health(...)
```

---

## FR-502：执行流程

```text
Assignment
→ Validate
→ Resolve Profile
→ Resolve Resource Revision
→ Resolve Instance
→ Ensure Gateway
→ Claim Lease
→ Create WorkTask
→ Create TaskRun
→ POST Gateway Chat SSE
→ Normalize Hermes Events
→ Persist Events
→ Handle Approval
→ Finalize Result
→ Artifact Delivery
→ Complete Assignment
```

---

## FR-503：真实 SSE 映射

Hermes 事件映射：

```text
chat chunk
→ agent.message.delta

tool progress
→ tool.started / tool.progress / tool.completed

usage
→ run.usage_json

done
→ agent.message.completed

error
→ task.failed
```

---

## FR-504：租约续期

Task Run 启动后创建独立 Lease Renewal Task。

续期周期：

```text
min(
  center heartbeat interval,
  lease duration / 3
)
```

连续续租失败：

```text
task.status = lease_at_risk
```

Lease 到期：

```text
停止交付最终结果
尝试取消 Hermes Run
task.status = expired
```

---

## FR-505：真实取消

Center 或 Desktop 发起取消：

```text
写 task.cancel.requested
→ 设置 Cancel Token
→ abort Gateway SSE
→ 调用 Hermes interrupt
→ 等待 Grace Period
→ 必要时停止 Instance 子进程
→ 写 task.cancelled
```

P95 取消响应目标：

```text
<= 3 秒
```

---

## FR-506：并发和队列

新增：

```text
TaskExecutionScheduler
```

支持：

* 最大并发任务；
* 每个 Instance 最大并发；
* Priority；
* Deadline；
* FIFO；
* Profile 互斥；
* Workspace 互斥；
* Resource Lock。

默认：

```text
Endpoint Max Concurrent Runs = 2
Instance Max Concurrent Runs = 1
```

---

## FR-507：重启恢复

Runtime 启动时扫描：

```text
starting
running
waiting_approval
finalizing
delivering
```

恢复策略：

* Gateway Session 存在：恢复事件监听；
* Hermes 已完成：补齐 Finalize；
* Gateway 失联：标记 `orphaned`；
* Lease 有效：允许人工或策略重试；
* Lease 失效：标记 `expired`；
* Artifact 未上传：恢复 Delivery。

---

# 15. Approval 与 Policy

## FR-601：统一 EffectivePolicy

结构：

```json
{
  "workspace": {},
  "tools": {},
  "data": {},
  "approval": {},
  "network": {},
  "artifact": {}
}
```

来源：

```text
Center Policy
Local Enterprise Policy
Profile Policy
Task Policy
User Decision
```

---

## FR-602：Approval 数据模型

新增：

```text
task_approvals
```

字段：

```text
id
task_id
run_id
tool_call_id
action_type
request_payload_json
risk_level
status
decision
decided_by
expires_at
created_at
resolved_at
```

---

## FR-603：Approval Token

Approval 通过后生成：

```text
一次性
绑定 task_id
绑定 run_id
绑定 tool_call_id
绑定参数 Hash
有过期时间
```

参数变化后原 Approval 失效。

---

## FR-604：Workspace Guard

必须防止：

* `..` 路径穿越；
* Symlink 逃逸；
* Junction 逃逸；
* UNC Path；
* 非授权盘符；
* 临时目录绕过；
* 大小写路径绕过。

---

# 16. Artifact v2

## FR-701：本地 Artifact Spool

目录：

```text
%LOCALAPPDATA%\HermesRuntime\artifact-spool
```

状态：

```text
created
queued
uploading
uploaded
failed
expired
deleted
```

---

## FR-702：流式 Hash 和上传

禁止：

```python
data = path.read_bytes()
```

改为：

```text
Chunk Read
→ Incremental SHA-256
→ Streaming Upload
```

---

## FR-703：分块与续传

大于配置阈值时：

```text
Multipart Init
→ Upload Parts
→ Persist Part ETags
→ Resume after Restart
→ Complete Multipart
```

---

## FR-704：本地加密

未上传的敏感 Artifact：

* 使用 Windows DPAPI 包装数据密钥；
* 文件使用 AES-GCM；
* 上传完成后按保留策略清除；
* 日志不得记录原始文件路径。

---

# 17. Worker Supervisor

## FR-801：Worker Registry

统一注册：

```text
EndpointHeartbeatWorker
SyncPullWorker
AckDeliveryWorker
EventDeliveryWorker
DesiredStateWorker
AssignmentWorker
LeaseRenewalWorker
ArtifactDeliveryWorker
StaffDeckReviewWorker
RetentionWorker
```

---

## FR-802：Worker 状态

```text
starting
running
backing_off
circuit_open
degraded
stopped
failed
```

记录：

```text
last_started_at
last_tick_at
last_success_at
last_error_at
last_error_code
consecutive_failures
next_run_at
```

---

## FR-803：Worker 运行策略

支持：

* Backoff；
* Jitter；
* Circuit Breaker；
* Tick Timeout；
* Graceful Cancel；
* Manual Restart；
* Critical Worker 标识；
* Readiness 聚合。

禁止 Service 直接访问其他 Service 私有 Repository。

---

## FR-804：单实例锁

启动 Runtime 时创建用户级 Process Lock。

检测另一个 Runtime 已监听同一数据目录时：

```text
拒绝启动
返回 runtime_already_running
```

防止双 Worker 重复消费。

---

## FR-805：Graceful Drain

升级或退出：

```text
停止接收新任务
→ 停止 Claim
→ 等待当前数据库事务
→ 持久化 Checkpoint
→ Flush Event Store
→ 停止 Worker
→ 停止 Gateway
```

---

# 18. 可观测性

## FR-901：统一 Trace Context

所有日志和事件包含：

```text
request_id
endpoint_id
task_id
run_id
assignment_id
event_id
instance_id
resource_revision
```

---

## FR-902：Metrics

新增：

```http
GET /api/v1/metrics
```

指标：

```text
runtime_uptime_seconds
runtime_worker_healthy
runtime_worker_failures_total
runtime_sync_lag_seconds
runtime_inbox_pending
runtime_outbox_pending
runtime_outbox_dead_letter
runtime_task_running
runtime_task_waiting_approval
runtime_task_duration_seconds
runtime_task_failures_total
runtime_gateway_health
runtime_resource_revision
runtime_artifact_upload_bytes
runtime_artifact_upload_failures_total
```

---

## FR-903：Readiness

```http
GET /api/v1/health/live
GET /api/v1/health/ready
GET /api/v1/health/details
```

Readiness 必须考虑：

* 数据库；
* Runtime Job Worker；
* Critical Workers；
* Credential Store；
* Gateway Supervisor；
* Center Circuit 状态；
* 数据迁移版本。

Center 离线不应导致本地 Runtime Liveness 失败。

---

## FR-904：诊断包

诊断包包含：

* Runtime 版本；
* Hermes 版本；
* Instance 状态；
* Worker 状态；
* Sync Channel；
* Cursor；
* Outbox 数量；
* 最近错误；
* 配置摘要；
* 日志片段；
* 数据库 Schema 版本。

禁止包含：

* Secret；
* Access Token；
* Refresh Credential；
* Device Private Key；
* Chat 正文；
* 原始客户数据。

---

## FR-905：SLO

| 指标                 |        目标 |
| ------------------ | --------: |
| 本地 API 可用性         |   ≥ 99.9% |
| Runtime 启动恢复       |    ≤ 60 秒 |
| Desktop SSE 断线恢复   |     ≤ 5 秒 |
| Task Cancel P95    |     ≤ 3 秒 |
| 本地事件丢失             |         0 |
| Outbox 重启后丢失       |         0 |
| 重复 Assignment 重复执行 |         0 |
| Secret 泄漏          |         0 |
| Worker 故障发现        | ≤ 2 个轮询周期 |

---

# 19. Experience v2

## FR-1001：自动 Evidence Hook

在以下事件自动创建 Evidence：

```text
task.completed
task.failed
approval.resolved
user.correction
artifact.created
tool.failed
runtime.recovery.completed
```

---

## FR-1002：Provenance

Evidence 必须引用：

```text
task_id
run_id
event_sequence_range
artifact_ids
profile_version
skill_versions
tool_names
```

不得只保存无法追溯的摘要。

---

## FR-1003：去重

生成：

```text
evidence_fingerprint
```

依据：

* Evidence 类型；
* 标准化步骤；
* Tool 序列；
* 关键决策；
* 错误码；
* 修复结果。

重复 Evidence 合并计数，不重复提交 Candidate。

---

## FR-1004：质量评分

评分维度：

```text
repeat_count
successful_reuse_count
user_confirmation
result_quality
policy_compliance
failure_rate
```

只有达到阈值的 Evidence 才建议生成 Candidate。

---

## FR-1005：用户同意

默认：

```text
自动采集脱敏 Evidence
不自动提交 Center
```

提交 StaffDeck 前必须经过 Desktop 用户批准。

---

# 20. Runtime API 1.3

## 20.1 Deployment

```http
GET /api/v1/runtime/mode
GET /api/v1/service-center/status
POST /api/v1/service-center/reconnect
```

---

## 20.2 Workers

```http
GET  /api/v1/workers
GET  /api/v1/workers/{name}
POST /api/v1/workers/{name}/restart
POST /api/v1/workers/{name}/pause
POST /api/v1/workers/{name}/resume
```

---

## 20.3 Tasks

```http
GET  /api/v1/tasks
POST /api/v1/tasks
GET  /api/v1/tasks/{taskId}
POST /api/v1/tasks/{taskId}/start
POST /api/v1/tasks/{taskId}/cancel
POST /api/v1/tasks/{taskId}/retry
GET  /api/v1/tasks/{taskId}/runs
GET  /api/v1/tasks/{taskId}/events
GET  /api/v1/tasks/{taskId}/events/stream
```

---

## 20.4 Approval

```http
GET  /api/v1/approvals
GET  /api/v1/approvals/{approvalId}
POST /api/v1/approvals/{approvalId}/resolve
```

---

## 20.5 Artifact

```http
GET    /api/v1/tasks/{taskId}/artifacts
GET    /api/v1/artifacts/{artifactId}
GET    /api/v1/artifacts/{artifactId}/content
POST   /api/v1/artifacts/{artifactId}/retry-upload
DELETE /api/v1/artifacts/{artifactId}
```

---

## 20.6 Resources

```http
GET  /api/v1/resources/reconciliations
GET  /api/v1/resources/reconciliations/{revision}
POST /api/v1/resources/reconciliations/{revision}/apply
POST /api/v1/resources/reconciliations/{revision}/rollback
GET  /api/v1/resources/{type}/{id}/probe
```

---

## 20.7 Diagnostics

```http
GET  /api/v1/health/live
GET  /api/v1/health/ready
GET  /api/v1/health/details
GET  /api/v1/metrics
POST /api/v1/diagnostics/bundle
```

---

# 21. Capability 更新

API：

```text
1.3
```

新增：

```text
deployment.production-mode
service-center.http.production
service-center.device-signature
service-center.circuit-breaker

sync.ack-outbox
sync.signature-verification
sync.sequence-gap
sync.poison-message

resources.real-apply
resources.revision-rollback
resources.actual-state-probe
resources.artifact-cache-v2

tasks.local-control-plane
tasks.hermes-execution
tasks.event-store
tasks.event-replay
tasks.cancel
tasks.recovery
tasks.scheduler

approvals.task-scoped
policies.effective-policy

artifacts.streaming-upload
artifacts.multipart-resume
artifacts.encrypted-spool

workers.supervisor
observability.metrics
observability.slo
experience.auto-evidence
```

---

# 22. 数据模型

新增：

```text
sync_ack_outbox
sync_replay_nonces
sync_poison_messages

resource_apply_runs
resource_apply_operations
resource_snapshots

work_tasks
task_runs
task_run_events
task_run_checkpoints
task_approvals
task_artifacts
task_resource_locks

worker_states
worker_incidents

artifact_upload_sessions
artifact_upload_parts

experience_evidence_links
experience_fingerprints
```

修改：

```text
sync_inbox
delivery_outbox
desired_state_revisions
resource_installations
remote_task_assignments
task_leases
experience_evidence
```

---

# 23. 兼容与迁移

## 23.1 API 兼容

Runtime API `1.2` 保留一个版本周期。

旧接口：

```text
/api/v1/remote-tasks/*
```

内部转接到新：

```text
/api/v1/tasks/*
```

---

## 23.2 Team Hub

默认关闭：

```text
AIOS_TEAM_HUB_USE_STUB=false
```

旧 Team Hub Worker 不再与 Service Center Worker 同时启动。

启用兼容模式时：

```text
Team Hub Assignment
→ Legacy Adapter
→ WorkTask
```

---

## 23.3 旧 Remote Task

迁移：

```text
remote_task_assignments
→ work_tasks
```

未完成 Assignment：

* 保留原 Assignment ID；
* 创建新的 WorkTask；
* 不自动执行；
* 标记 `migration_pending_review`。

---

## 23.4 旧 Event

`task_delivery_records` 迁移到：

```text
task_run_events
delivery_outbox
```

---

## 23.5 README

删除正式部署章节中的：

* `D:\Programs` 默认要求；
* 员工机预装 Python；
* 员工机预装 Node；
* 员工机预装 Git；
* v1.3 一键 Provision 作为推荐方式。

保留为：

```text
Legacy / Developer Installation
```

---

# 24. 代码改造目录

## 24.1 新增

```text
src/integrations/service_center/
├─ transport.py
├─ retry_policy.py
├─ circuit_breaker.py
├─ request_signer.py
├─ response_verifier.py
└─ contract_negotiator.py

src/runtime/resources/
├─ base.py
├─ profile_adapter.py
├─ expert_adapter.py
├─ skill_adapter.py
├─ plugin_adapter.py
├─ mcp_adapter.py
└─ policy_adapter.py

src/runtime/tasks/
├─ scheduler.py
├─ hermes_adapter.py
├─ executor.py
├─ event_normalizer.py
├─ event_store.py
├─ recovery.py
├─ lease_manager.py
└─ cancellation.py

src/runtime/artifacts/
├─ spool.py
├─ streaming_hash.py
├─ multipart_upload.py
├─ encryption.py
└─ retention.py

src/runtime/policy/
├─ effective_policy.py
├─ approval_token.py
└─ workspace_guard_v2.py

src/workers/
├─ supervisor.py
├─ registry.py
├─ ack_delivery_worker.py
├─ event_delivery_worker.py
├─ lease_renewal_worker.py
├─ artifact_delivery_worker.py
└─ retention_worker.py

src/services/
├─ work_task_service.py
├─ task_run_service.py
├─ task_event_service.py
├─ task_approval_service.py
├─ worker_service.py
└─ metrics_service.py

src/api/v1/
├─ tasks.py
├─ approvals.py
├─ workers.py
├─ metrics.py
└─ service_center.py
```

---

## 24.2 重构

```text
src/core/lifecycle.py
src/core/config.py
src/core/capabilities.py

src/integrations/service_center/client.py
src/integrations/service_center/artifact_client.py

src/services/runtime_sync_service.py
src/services/desired_state_service.py
src/services/resource_sync_service.py
src/services/remote_task_service.py
src/services/artifact_delivery_service.py
src/services/experience_capture_service.py

src/local_service/runtime_maintenance.py
src/workers/v15_workers.py
```

---

# 25. 测试方案

## 25.1 单元测试

覆盖：

* Deployment Mode；
* Stub 禁止进入生产；
* HTTP Retry；
* Circuit Breaker；
* Request Signature；
* Response Signature；
* Replay Nonce；
* ACK Outbox；
* Sequence Gap；
* Poison Message；
* Resource Adapter；
* Revision Rollback；
* Event Sequence；
* SSE Replay；
* Lease Renewal；
* Task Cancellation；
* Runtime Recovery；
* Approval Token；
* Workspace Escape；
* Streaming Hash；
* Multipart Resume；
* Experience Fingerprint。

---

## 25.2 Contract Test

使用独立 Fake HTTP Server，不直接注入内存 Client。

验证：

```text
Enrollment
Token Refresh
Desired State
Assignment
Lease
Heartbeat
ACK
Events Batch
Artifact
Experience
Protocol Negotiation
```

---

## 25.3 Hermes Integration Test

使用真实 Hermes Artifact：

```text
Install
→ Create Instance
→ Start Gateway
→ Send Chat
→ Receive Delta
→ Tool Call
→ Approval
→ Complete
→ Session Exists
→ Artifact Exists
```

---

## 25.4 Crash Test

在以下位置强制终止 Runtime：

```text
Inbox 已写、未 Commit
Commit 后、未 ACK
Task 已 Claim、未启动 Hermes
Hermes Running
Task Finalizing
Artifact Upload Part 3
Desired State Operation 2/5
```

重启后验证：

* 不丢消息；
* 不重复执行；
* 可恢复；
* 可回滚；
* Cursor 正确；
* Lease 正确。

---

## 25.5 Windows E2E

环境：

```text
Windows 11 Pro
无 Python
无 Node
无 Git
普通用户
Restricted PowerShell
```

执行：

```text
安装 Setup.exe
→ Runtime Ready
→ Endpoint Enrollment
→ Center HTTP Contract
→ Hermes Install
→ Desired State Apply
→ Remote Assignment
→ Real Hermes SSE
→ Tool Approval
→ Artifact Upload
→ Center Offline
→ Local Continue
→ Center Recovery
→ Runtime Upgrade
→ Power-loss Simulation
→ Rollback
→ Repair
→ Uninstall
```

---

# 26. 里程碑

## M0：Release Gate

完成：

* CI 分支修复；
* 真实 Launcher；
* Stable 强制 E2E；
* Manifest 发布；
* Maintenance 安全解压。

---

## M1：Production Center Transport

完成：

* Deployment Mode；
* Shared HTTP Client；
* Retry；
* Circuit Breaker；
* Request Signature；
* Protocol Negotiation。

---

## M2：Reliable Sync

完成：

* Commit-before-ACK；
* ACK Outbox；
* Sequence Gap；
* Replay Protection；
* Poison Message；
* Partial Event ACK。

---

## M3：Real Resource Apply

完成：

* Artifact Downloader；
* Resource Adapter；
* Profile、Skill、Plugin、MCP；
* Revision Rollback；
* Actual State Probe。

---

## M4：Real Task Execution

完成：

* WorkTask；
* TaskRun；
* Event Store；
* Hermes Adapter；
* Scheduler；
* Lease；
* Cancel；
* Recovery；
* SSE Replay。

---

## M5：Artifact、Policy、Worker

完成：

* Streaming Artifact；
* Multipart；
* Approval；
* Effective Policy；
* Worker Supervisor；
* Metrics；
* Diagnostics。

---

## M6：Experience 与正式验收

完成：

* Automatic Evidence；
* Provenance；
* Fingerprint；
* StaffDeck Candidate；
* Windows Full E2E；
* Desktop API 1.3。

---

# 27. 验收标准

## 27.1 Service Center

```text
[ ] production_http 下不能使用 Stub
[ ] 所有敏感请求有设备签名
[ ] Retry 只作用于允许重试的请求
[ ] Center 离线时 Circuit Breaker 生效
[ ] Center 恢复后自动 Half-open Probe
```

---

## 27.2 Sync

```text
[ ] ACK 一定发生在本地 Commit 之后
[ ] Runtime 在 Commit 后崩溃不会重复执行业务操作
[ ] Sequence 缺口可以检测
[ ] 重放消息不会重复执行
[ ] 单条坏消息不会永久阻塞整个 Channel
[ ] Batch 部分失败可以逐事件处理
```

---

## 27.3 Resource

```text
[ ] Profile 真正安装到 Hermes
[ ] Skill 通过 hermes skills check
[ ] Plugin 通过安装和健康验证
[ ] MCP 通过 hermes mcp test
[ ] 缺失 Secret 时资源为 blocked
[ ] Revision 中任一资源失败可全量回滚
[ ] Actual State 来自真实探针
```

---

## 27.4 Task

```text
[ ] Assignment 实际调用 Hermes Gateway
[ ] Desktop 可实时看到 Agent Delta
[ ] Tool 调用形成标准事件
[ ] Approval 可以暂停并恢复 Run
[ ] Lease 自动续期
[ ] Center Cancel 可以中止 Hermes Run
[ ] Runtime 重启后可以恢复 Task
[ ] 同一 Assignment 不会执行两次
[ ] 最终结果不是模拟固定文本
```

---

## 27.5 Artifact

```text
[ ] 大文件不会一次性读入内存
[ ] 上传中断可以续传
[ ] Runtime 重启后可以继续上传
[ ] Artifact Hash 与 Center 一致
[ ] 本地绝对路径不会上传
[ ] 敏感 Artifact 本地加密
```

---

## 27.6 Worker

```text
[ ] Worker 有状态和健康探针
[ ] Worker 失败有退避
[ ] Worker Circuit Open 可见
[ ] Critical Worker 影响 Readiness
[ ] 更新时 Worker 可优雅排空
[ ] 同一数据目录不能启动两个 Runtime
```

---

## 27.7 Release

```text
[ ] Stable E2E 不允许跳过
[ ] MSI 和 Setup.exe 均真实可执行
[ ] 所有制品完成签名
[ ] Manifest 发布到正式仓
[ ] Windows 无开发工具环境可完成安装
[ ] 升级失败可自动回滚
```

---

# 28. 提交顺序

```text
1. fix(ci): align runtime workflow with master and stable gates
2. feat(launcher): add production runtime launcher
3. fix(maintenance): verify and safely extract runtime bundle
4. feat(mode): add explicit deployment modes
5. feat(center): add pooled production service-center transport
6. feat(center): add retries circuit breaker and device signatures
7. feat(sync): add commit-before-ack and ack outbox
8. feat(sync): add sequence replay and poison-message protection
9. feat(resources): introduce resource adapter contract
10. feat(resources): implement profile and expert bundle adapters
11. feat(resources): implement skill plugin and mcp adapters
12. feat(resources): add revision transaction rollback
13. feat(tasks): introduce work task run and event models
14. feat(tasks): implement Hermes runtime adapter
15. feat(tasks): implement scheduler lease cancellation and recovery
16. feat(events): add persistent SSE replay
17. feat(approval): add effective policy and task approvals
18. feat(artifacts): add streaming multipart artifact delivery
19. feat(workers): add worker supervisor and health registry
20. feat(observability): add metrics readiness and diagnostics
21. feat(experience): capture evidence from real run events
22. feat(api): publish Runtime API 1.3
23. test(e2e): add full Windows Center-to-Hermes execution
24. docs(runtime): align README architecture API and operations
```

---

# 29. Definition of Done

```text
[ ] v1.5 的 Stub 控制链已替换为生产 HTTP 链路
[ ] 生产模式禁止 Stub
[ ] Desired State 可以真实安装 Hermes 资源
[ ] Remote Task 可以真实执行 Hermes Agent
[ ] Task、Run、Event、Approval、Artifact 使用统一模型
[ ] Agent SSE 事件先持久化再广播
[ ] Desktop 支持 Last-Event-ID 重放
[ ] Assignment Lease 可以续期
[ ] Center Cancel 可以停止实际 Run
[ ] Runtime 重启可以恢复未完成任务
[ ] Inbox、ACK、Cursor 不存在确认丢失窗口
[ ] Event Outbox 支持逐事件确认
[ ] Worker 具备 Supervisor 和健康状态
[ ] Artifact 支持流式和续传
[ ] Resource Revision 支持事务回滚
[ ] Runtime Maintenance 完成安全解压
[ ] Stable Channel 强制执行真实 E2E
[ ] Installer 使用真实 Launcher
[ ] 所有 Stable 制品完成签名
[ ] Experience 来自真实任务事件
[ ] Candidate 仍需用户确认
[ ] Runtime 不复制 Hermes Agent Loop
[ ] Runtime 不吸收 AutoTask、Email、Knowledge 业务逻辑
[ ] Runtime API 1.3 文档完整
[ ] Runtime API 1.2 保持一个版本兼容期
```

---

# 30. 最终交付闭环

```text
Service Center 下发 Desired State
→ Runtime 验签并安装真实 Expert / Skill / MCP
→ Service Center 下发 Assignment
→ Runtime 创建 WorkTask 和 TaskRun
→ Hermes Agent 真实执行
→ Agent、Tool、Approval 和 Artifact 事件持久化
→ Desktop 实时展示并支持断线重放
→ Runtime 续租、取消、恢复和交付结果
→ 真实执行过程形成 Experience Evidence
→ 用户确认 Candidate
→ Service Center 提交 StaffDeck
→ 后续 Expert Factory 生产新版本
```

v1.6 完成后，`smc-copilot-serve` 才从：

```text
企业终端控制面原型
```

升级为：

```text
企业 Work Copilot 可生产运行的本地可信执行节点
```
