## 源码分析结论

当前 `master` 最新提交为 `1b4b06f7d8e1212067f7b85033e32c57731d04e5`。v1.4 已完成 Instance Chat、Gateway 内部鉴权、配置 Apply、MCP 编译、事务更新、Bootstrap、诊断与安全加固等本地控制面能力；但提交说明明确指出，Windows 安装器、嵌入式 Python、Hermes Wheelhouse、Authenticode、CI 发布和真实 Windows E2E 仍属于脚手架或受条件限制的实现。

存在五个需要优先处理的结构性问题：

1. **企业交付尚未形成真实制品。** Runtime Bundle 中的嵌入式 Python、`site-packages` 仍是占位内容；Hermes Wheelhouse 在找不到真实包时还会创建占位 wheel；WiX 和 Burn 仅完成基础结构。
2. **Runtime 自更新没有真实执行。** `apply()` 仍将停止服务、备份、替换、迁移、启动和健康检查标记为 `stub`，并返回 `applied: false`。
3. **真实验收没有自动化。** Windows/Hermes E2E 测试最终直接调用 `pytest.skip()`，没有完成真实安装器、Gateway、Bearer 模型查询和 Chat SSE 验证。
4. **发布流水线尚未闭环。** MSI 构建允许失败，Manifest 发布步骤只输出占位日志，没有生成和发布正式签名制品。
5. **企业协同仍停留在旧 Team Hub 原型。** 当前 HTTP Client 明确标记为占位协议；任务同步主要是轮询、简单 Outbox 和固定重试，缺少终端注册、版本游标、租约、幂等、Desired State 和资源同步协议。

此外，README 和架构文档仍保留手工安装 Python、Node、Git、固定 `D:\Programs` 和 Profile 旧接口说明，与 v1.4 目标实现存在明显漂移。

因此，下一版本不应继续扩充单机安装功能，而应定义为：

> **v1.5：企业终端 Runtime 同步、远程任务闭环与 StaffDeck 经验沉淀基础。**

该方向延续 Hermes / AI-OS / Copilot Desktop / MCP Skill Gateway / Expert 主线。

# smc-copilot-serve v1.5

# 企业终端 Runtime 同步、任务闭环与经验沉淀方案 PRD

## 1. 文档信息

| 项目             | 内容                                         |
| -------------- | ------------------------------------------ |
| 产品             | smc-copilot-serve                          |
| 版本             | v1.5                                       |
| 文档类型           | 产品与技术实施 PRD                                |
| 基线版本           | v1.4.0                                     |
| 基线提交           | `1b4b06f7d8e1212067f7b85033e32c57731d04e5` |
| 建议分支           | `feature/runtime-v1.5-endpoint-sync`       |
| Runtime API 版本 | `1.2`                                      |
| 目标系统           | Windows 11 Pro x64                         |
| 主要调用方          | Copilot Desktop                            |
| 上游控制面          | Work Copilot Service Center                |
| Agent Runtime  | Hermes Agent                               |
| 专家治理           | nodeskclaw                                 |
| 专家生产           | copilot-docker                             |
| 经验治理           | StaffDeck                                  |
| 优先级            | P0                                         |

---

# 2. 版本定位

v1.4 将 `smc-copilot-serve` 建设为本机 Hermes Runtime 控制面，解决：

```text
Hermes 安装
→ Instance 管理
→ Gateway 监管
→ Chat
→ MCP
→ 配置
→ Secret
→ 更新与回滚
```

v1.5 将其升级为企业终端智能体运行节点，解决：

```text
终端注册
→ 中心策略同步
→ 专家与技能同步
→ 远程任务接收
→ 本地 Hermes 执行
→ 过程事件回传
→ 结果与附件交付
→ 经验证据提取
→ StaffDeck 候选经验提交
```

v1.5 的产品本质是：

> Work Copilot 企业控制面在员工电脑上的可信执行节点。

它不是公司级任务管理平台，也不是组织与权限主数据系统。

---

# 3. 产品职责边界

## 3.1 Copilot Desktop

负责：

* 用户登录；
* 本机 Runtime 发现与配对；
* Chat、任务、审批和文件交互；
* Instance、Profile、Skill、MCP 的可视化配置；
* 用户对经验候选的审核确认；
* 展示同步、任务和运行状态。

禁止：

* 直接启动 Hermes Gateway；
* 直接读写 `~/.hermes`；
* 保存 Gateway API Key；
* 直接调用企业控制面执行 Runtime 操作；
* 绕过 Runtime 调用 Hermes。

---

## 3.2 smc-copilot-serve

负责：

* 本机 Runtime 生命周期；
* Hermes 版本与 Instance 管理；
* Gateway 和 Chat 代理；
* 本地 Secret；
* Profile、Skill、Plugin、MCP 的落地；
* 企业终端注册；
* Desired State 同步；
* 远程任务执行；
* 任务事件和结果回传；
* 经验证据采集；
* 本地安全策略和审计。

禁止：

* 保存企业组织架构主数据；
* 决定用户、部门和专家权限；
* 在本地发布企业级 Skill；
* 自动把经验升级为正式 Skill；
* 直接管理其它员工电脑；
* 接收 nodeskclaw 对本地进程的直接控制。

---

## 3.3 Work Copilot Service Center

负责：

* 用户、组织和 RBAC；
* 终端设备注册；
* Desktop 与 Endpoint 绑定；
* Profile、Expert、Skill、Plugin、MCP Registry；
* Desired State；
* 任务下发；
* 执行状态聚合；
* 结果和审计汇总；
* Artifact 地址和签名；
* StaffDeck 候选经验接收；
* nodeskclaw、copilot-docker 与终端之间的适配。

禁止：

* 直接启动终端 Gateway；
* 直接读取终端文件；
* 直接执行终端命令；
* 获取终端 Provider API Key；
* 绕过用户审批操作本地业务数据。

---

## 3.4 Hermes Agent

负责：

* Agent 推理循环；
* 工具调用；
* Skill、Plugin、MCP 加载；
* Session 和 Memory；
* 多模型调用；
* 子智能体；
* 本地任务执行。

Runtime 只监管 Hermes，不复制 Hermes 内部执行引擎。

---

## 3.5 nodeskclaw

负责：

* 企业专家目录；
* 专家团队；
* 专家岗位和组织归属；
* 专家版本治理；
* 专家发布策略；
* 专家任务分派和状态聚合。

nodeskclaw 不得直接连接终端 Gateway。

正确链路：

```text
nodeskclaw
→ Work Copilot Service Center
→ smc-copilot-serve
→ Hermes Agent
```

---

## 3.6 copilot-docker

负责：

* Expert Factory；
* Expert Bundle 构建；
* Skill、Plugin、MCP 依赖解析；
* 安全和评测；
* Bundle 签名与发布；
* Nacos / Registry 发布。

`smc-copilot-serve` 只消费构建完成并签名的 Bundle。

---

## 3.7 StaffDeck

负责：

* 经验候选聚合；
* 经验去重和归并；
* SOP、判断标准和方法论提炼；
* 人工 Review；
* Experience → Expert / Skill 的升级；
* 组织经验版本化。

本机 Runtime 只负责：

```text
证据采集
→ 隐私处理
→ 生成候选
→ 用户确认
→ 提交中心
```

不得在终端自动发布企业 Skill。

---

# 4. 当前能力与目标差距

| 领域             | v1.4 状态      | v1.5 目标                |
| -------------- | ------------ | ---------------------- |
| 本地 Runtime     | 已具备          | 稳定化                    |
| Windows 安装     | 脚手架          | 正式发布闭环                 |
| Runtime 自更新    | Apply 为 Stub | 真实 Maintenance 更新      |
| 真实 E2E         | 占位测试         | 自动化 Windows E2E        |
| 企业终端注册         | 无            | 正式 Endpoint Enrollment |
| 配置同步           | 无            | Desired State          |
| Profile 同步     | 本地 CRUD      | 中心版本同步                 |
| Skill / Plugin | 本地能力         | Bundle 同步与回滚           |
| MCP            | 本地编译         | 中心定义、本地 Secret         |
| 远程任务           | Team Hub 原型  | Assignment v2          |
| 状态同步           | 简单 Outbox    | 游标、确认、重试、死信            |
| Artifact       | 本地附件         | 预签名上传与结果引用             |
| 经验沉淀           | 无            | Experience Evidence    |
| StaffDeck      | 无            | Candidate Bridge       |
| 审计             | 本地日志         | 本地审计 + 摘要回传            |
| 离线运行           | 部分支持         | 正式 Offline-first       |

---

# 5. 版本目标

## 5.1 核心目标

v1.5 必须实现：

1. 将 v1.4 安装、发布和更新脚手架转为正式可执行能力；
2. 建立企业 Endpoint Identity；
3. 建立 Service Center 双向同步协议；
4. 建立 Desired State；
5. 完成 Profile、Expert、Skill、Plugin、MCP 同步；
6. 建立远程任务租约和执行协议；
7. 实现任务事件、结果与 Artifact 回传；
8. 支持中心断开时本地继续工作；
9. 建立经验证据和候选经验模型；
10. 打通 StaffDeck 候选经验提交；
11. 保证企业 Secret 不通过中心同步；
12. 完成 Desktop 与 Runtime API 1.2 契约。

---

# 6. 非目标

v1.5 不实现：

* 企业组织架构管理；
* 中心端完整 RBAC；
* nodeskclaw 服务端功能；
* StaffDeck Review 页面；
* Expert Factory；
* 企业知识库；
* 远程桌面控制；
* 任意终端命令下发；
* Provider API Key 中心托管；
* 自动发布 Skill；
* 跨用户共享 DPAPI Secret；
* Linux、macOS 企业安装包；
* 互联网公网 Runtime API。

---

# 7. 目标架构

```text
┌──────────────────────────────────────────────┐
│ Work Copilot Service Center                  │
│                                              │
│ Identity / RBAC                              │
│ Endpoint Registry                            │
│ Desired State                                │
│ Task Assignment                              │
│ Artifact Service                             │
│ Audit Aggregation                            │
│ StaffDeck Bridge                             │
│ nodeskclaw Adapter                           │
│ Expert Registry                              │
└──────────────────────┬───────────────────────┘
                       │ HTTPS
                       │ Device JWT
                       │ Cursor / Ack / Outbox
                       ▼
┌──────────────────────────────────────────────┐
│ smc-copilot-serve                            │
│                                              │
│ Endpoint Enrollment                          │
│ Center Client                                │
│ Sync Engine                                  │
│ Desired State Reconciler                     │
│ Resource Bundle Manager                      │
│ Remote Task Runtime                          │
│ Event / Result Delivery                      │
│ Experience Capture                          │
│ DPAPI SecretStore                            │
│ Instance / Gateway Supervisor                │
└──────────────────────┬───────────────────────┘
                       │ CLI + HTTP
                       ▼
┌──────────────────────────────────────────────┐
│ Hermes Agent                                 │
│                                              │
│ Profile                                      │
│ Skill / Plugin / MCP                         │
│ Session / Memory                             │
│ Agent Loop                                   │
│ Tools                                        │
└──────────────────────────────────────────────┘
```

---

# 8. 设计原则

## 8.1 Offline-first

Service Center 不可用时：

* 本地 Chat 不受影响；
* 本地 Instance 不停止；
* 当前任务可以继续；
* 事件进入本地 Outbox；
* 结果等待恢复后上传；
* 不允许因中心断开删除本地资源。

---

## 8.2 Desired State 与 Actual State 分离

中心保存：

```text
Desired State
```

终端保存：

```text
Actual State
```

Runtime 负责对账：

```text
Desired State
→ Validate
→ Plan
→ Apply
→ Verify
→ Report Actual State
```

中心不能假定“配置已下发”等于“配置已生效”。

---

## 8.3 本地 Secret 不同步

中心只下发：

```json
{
  "requiredSecretNames": [
    "DASHSCOPE_API_KEY",
    "ERP_API_TOKEN"
  ]
}
```

中心不得下发或读取 Secret 值。

Runtime 返回：

```json
{
  "DASHSCOPE_API_KEY": {
    "configured": true
  }
}
```

---

## 8.4 资源必须版本化

以下资源必须包含：

```text
resourceId
resourceType
version
checksum
signature
publishedAt
compatibility
```

适用对象：

* Profile；
* Expert Bundle；
* Skill；
* Plugin；
* MCP；
* Policy；
* Task Routing；
* Prompt Template。

---

## 8.5 所有同步操作必须幂等

每个请求包含：

```text
messageId
idempotencyKey
endpointId
resourceVersion
```

同一消息重复到达不得重复执行任务或重复安装资源。

---

## 8.6 经验不能自动转为生产能力

Experience Candidate 的最高本地状态为：

```text
submitted
```

只有 StaffDeck 或企业治理流程可以：

```text
accepted
published
```

---

# 9. Phase 0：v1.4 正式发布闭环

## FR-00：删除所有发布占位实现

必须删除：

* Placeholder wheel；
* 空 Wheelhouse 成功返回；
* `python/README.md` 代替 Python；
* `site-packages/README.md` 代替依赖；
* Installer Concept CustomAction；
* Manifest Publish Placeholder；
* Runtime Update Stub；
* E2E 中无条件 `pytest.skip()`。

任何占位资源不得进入 Stable Channel。

---

## FR-01：正式 Runtime Bundle

输出：

```text
runtime-bundle-1.5.0-win-x64.zip
├─ runtime\
├─ python\
│  ├─ python.exe
│  └─ python312._pth
├─ site-packages\
├─ scripts\
├─ migrations\
├─ config\
├─ runtime-launcher.exe
└─ manifest.json
```

构建后必须在隔离环境执行：

```text
runtime-launcher.exe --version
runtime-launcher.exe database check
runtime-launcher.exe health
```

---

## FR-02：正式 Hermes Wheelhouse

输入：

```text
公司 hermes-agent Git Tag
```

输出：

```text
hermes-agent-<version>-win-x64.zip
├─ hermes_agent-<version>.whl
├─ wheelhouse\
├─ requirements.lock
├─ SBOM.spdx.json
└─ artifact.json
```

规则：

* 不允许在线访问 PyPI；
* 所有依赖必须有 Hash；
* Artifact 必须签名；
* Artifact 中不得出现源码仓库凭据；
* `hermes --version` 必须与 Manifest 一致。

---

## FR-03：真实 Runtime Maintenance Process

新增：

```text
runtime-maintenance.exe
```

负责：

```text
接收更新计划
→ 验证签名
→ 停止 UserDaemon
→ 备份数据库
→ 解压新 Runtime
→ 原子目录切换
→ Alembic
→ 启动新 Runtime
→ 健康检查
→ 成功提交
```

失败：

```text
恢复旧目录
→ 恢复数据库
→ 启动旧 Runtime
→ 标记 rollback
```

`RuntimeServiceUpdateService.apply()` 不再返回 `stub`。

---

## FR-04：正式 Windows Installer

必须输出：

```text
SMC-Copilot-Runtime-1.5.0-x64.msi
SMC-Copilot-Runtime-Setup-1.5.0.exe
```

支持：

```text
/quiet
/channel=stable
/installScope=user
/bootstrapConfig=<path>
/repair
/uninstall
/log=<path>
```

Stable 构建中：

* WiX 缺失必须失败；
* MSI 构建失败必须失败；
* Setup.exe 缺失必须失败；
* 签名失败必须失败；
* 不允许 `continue-on-error`。

---

## FR-05：真实 Windows E2E

自动执行：

```text
全新 Windows Runner
→ 无 Python
→ 无 Node
→ 无 Git
→ 安装 Setup.exe
→ Runtime 健康
→ 安装真实 Hermes
→ 启动 Instance
→ Bearer /v1/models
→ Chat SSE
→ Runtime Update
→ Hermes Update
→ Rollback
→ Repair
→ Uninstall
```

---

# 10. Endpoint Identity

## FR-06：终端身份模型

新增：

```text
Endpoint
```

字段：

```text
endpointId
tenantId
deviceId
userId
machineIdHash
runtimeVersion
osVersion
architecture
enrollmentStatus
certificateThumbprint
lastSeenAt
createdAt
revokedAt
```

禁止上传：

* 用户真实本机路径；
* MAC 地址明文；
* 硬盘序列号明文；
* Provider Secret；
* Chat 正文。

---

## FR-07：终端密钥

首次注册生成：

```text
Ed25519 Device Key Pair
```

私钥：

* 使用 Windows DPAPI；
* 不离开终端；
* 不写入日志；
* 不进入备份；
* 不允许 Desktop Renderer 读取。

中心保存公钥。

---

## FR-08：Enrollment 流程

```text
Desktop 用户登录
→ 获取 Enrollment Code
→ Desktop 调本地 Runtime
→ Runtime 生成 Key Pair
→ Runtime 向 Service Center 提交 Code + Public Key
→ Center 返回 endpointId + short-lived token
→ Runtime 保存 Endpoint Credential
→ 上报首次 Inventory
```

本地 API：

```http
POST /api/v1/endpoint/enrollment/start
POST /api/v1/endpoint/enrollment/complete
GET  /api/v1/endpoint/status
POST /api/v1/endpoint/enrollment/revoke
```

---

## FR-09：Token 生命周期

使用：

```text
短期 Access Token
长期 Refresh Credential
Device Signature
```

要求：

* Access Token 最长 30 分钟；
* Refresh Credential 使用 DPAPI；
* 终端被吊销后停止中心同步；
* 本地 Chat 继续可用；
* 中心任务不得继续执行。

---

# 11. Sync Protocol

## FR-10：消息信封

统一格式：

```json
{
  "protocolVersion": "1.0",
  "messageId": "uuid",
  "idempotencyKey": "string",
  "tenantId": "smc",
  "endpointId": "endpoint-uuid",
  "sequence": 1024,
  "sentAt": "2026-08-06T10:00:00Z",
  "messageType": "desired_state.updated",
  "payload": {},
  "signature": "base64"
}
```

---

## FR-11：同步游标

每个同步通道独立保存 Cursor：

```text
desired_state
task_assignment
task_control
resource_release
staffdeck_review
```

请求：

```http
GET /api/v1/endpoints/{id}/changes?channel=desired_state&cursor=xxx
```

响应：

```json
{
  "items": [],
  "nextCursor": "xxx",
  "hasMore": false
}
```

只有全部 Item 成功持久化后才推进 Cursor。

---

## FR-12：Inbox 去重

新增表：

```text
sync_inbox
```

字段：

```text
message_id
channel
idempotency_key
payload_hash
received_at
processed_at
status
error_code
```

同一 `messageId` 只能处理一次。

---

## FR-13：Delivery Outbox

新增表：

```text
delivery_outbox
```

状态：

```text
pending
sending
acknowledged
retry
dead_letter
cancelled
```

字段：

```text
event_id
channel
aggregate_type
aggregate_id
event_type
payload_json
sequence
attempt_count
next_attempt_at
last_error
created_at
acknowledged_at
```

重试策略：

```text
指数退避
+ 随机抖动
+ 最大重试次数
+ Dead Letter
```

---

## FR-14：同步状态 API

```http
GET  /api/v1/sync/status
POST /api/v1/sync/now
GET  /api/v1/sync/channels
GET  /api/v1/sync/dead-letters
POST /api/v1/sync/dead-letters/{id}/retry
```

---

# 12. Desired State

## FR-15：Desired State Bundle

结构：

```json
{
  "revision": 28,
  "generatedAt": "2026-08-06T10:00:00Z",
  "resources": [
    {
      "resourceType": "profile",
      "resourceId": "sales-expert",
      "version": "2.1.0",
      "applyMode": "managed",
      "checksum": "...",
      "artifactUrl": "...",
      "signature": "..."
    }
  ],
  "policies": {},
  "removedResources": []
}
```

---

## FR-16：资源所有权

### Center Managed

* 企业 Profile；
* Expert Bundle；
* 企业 Skill；
* Plugin；
* MCP 定义；
* Tool Policy；
* Task Routing；
* 审批策略。

### Local Managed

* Gateway PID；
* 本地端口；
* 本地路径；
* 本地 Secret；
* 用户草稿；
* Experience Evidence；
* 未提交 Candidate；
* 用户临时模型切换。

### Hybrid

* 默认模型；
* Profile 启用状态；
* Skill 启用状态；
* Workspace 映射。

Hybrid 必须定义：

```text
baseline
allowedOverrides
effectiveValue
```

---

## FR-17：Reconciliation Plan

拉取 Desired State 后先生成 Plan：

```json
{
  "revision": 28,
  "operations": [
    {
      "operation": "install",
      "resourceType": "skill",
      "resourceId": "sales-analysis",
      "fromVersion": null,
      "toVersion": "1.3.0"
    }
  ],
  "restartRequired": true,
  "warnings": []
}
```

未经校验不得直接 Apply。

---

## FR-18：Apply 与回滚

流程：

```text
下载
→ 签名验证
→ 解压安全验证
→ 依赖验证
→ config check
→ 创建 Snapshot
→ 安装
→ 重启相关 Instance
→ Health
→ Probe
→ 提交 Actual State
```

失败：

```text
恢复 Snapshot
→ 恢复旧资源
→ 重启旧 Instance
→ 上报 apply_failed
```

---

# 13. Resource Sync

## FR-19：Profile Bundle

内容：

```text
profile.yaml
SOUL.md
instructions\
skill-refs.json
plugin-refs.json
mcp-refs.json
policy.json
```

禁止包含：

* Secret；
* 本地绝对路径；
* Session；
* Memory 明文。

---

## FR-20：Skill 与 Plugin

Runtime 必须：

* 校验签名；
* 校验 Manifest；
* 校验 Hermes 兼容版本；
* 执行 `hermes skills check`；
* 执行 Plugin 安全策略；
* 保存版本；
* 支持按 Instance 启用；
* 支持回滚。

---

## FR-21：MCP 同步

中心只同步：

```text
name
transport
command
args
url
requiredSecretNames
policy
version
```

本地完成：

```text
Secret Binding
→ Config Compile
→ Config Check
→ Runtime Test
```

---

## FR-22：Artifact Cache

缓存：

```text
%LOCALAPPDATA%\HermesRuntime\artifact-cache
```

采用内容寻址：

```text
sha256/<checksum>
```

支持：

* 引用计数；
* 最大容量；
* LRU；
* Pinned Artifact；
* 安全清理；
* 离线复用。

---

# 14. Remote Task Assignment v2

## FR-23：任务 Assignment

结构：

```json
{
  "taskId": "task-001",
  "assignmentId": "assignment-001",
  "assignmentVersion": 3,
  "taskType": "sales_analysis",
  "title": "分析客户采购变化",
  "instructions": "...",
  "profileRef": {
    "resourceId": "sales-expert",
    "version": "2.1.0"
  },
  "requiredSkills": [],
  "workspacePolicy": {},
  "inputRefs": [],
  "approvalPolicy": {},
  "deadline": "2026-08-07T10:00:00Z",
  "leaseSeconds": 300
}
```

---

## FR-24：任务状态机

```text
received
→ validating
→ ready
→ claiming
→ claimed
→ running
→ waiting_approval
→ completed
→ delivering
→ delivered
```

异常状态：

```text
rejected
cancelled
failed
expired
delivery_failed
```

---

## FR-25：Task Lease

Claim：

```http
POST /api/v1/task-assignments/{id}/claim
```

返回：

```json
{
  "leaseId": "uuid",
  "expiresAt": "...",
  "heartbeatIntervalSeconds": 60
}
```

Runtime 定期续租。

Lease 失效后不得继续提交最终结果，必须重新确认任务状态。

---

## FR-26：任务幂等

幂等键：

```text
assignmentId + assignmentVersion
```

同一任务重复下发：

* 不重复创建本地任务；
* 不重复启动 Hermes Run；
* 返回当前本地状态；
* 已终态任务返回终态。

---

## FR-27：任务资源准备

开始任务前检查：

* Profile 是否存在；
* Profile 版本是否匹配；
* Skill 是否齐全；
* MCP 是否 Ready；
* Secret 是否配置；
* Workspace 是否授权；
* Gateway 是否健康；
* Deadline 是否有效。

不满足时返回结构化 Block Reason。

---

## FR-28：Hermes 执行

映射：

```text
Remote Assignment
→ LocalTask
→ HermesInstance
→ Hermes Run
```

所有执行都必须使用 Instance Control Plane，不得重新依赖旧 Profile Gateway 状态。

---

## FR-29：任务控制

中心支持：

```text
cancel
pause
resume
priority_change
deadline_change
```

执行风险动作前仍由本地审批策略决定是否允许。

---

# 15. Event 与 Result Delivery

## FR-30：标准事件

事件类型：

```text
task.received
task.validated
task.claimed
task.started
task.progress
task.tool.started
task.tool.completed
task.approval.requested
task.approval.resolved
task.completed
task.failed
task.cancelled
task.result.uploaded
```

---

## FR-31：事件裁剪

默认不上传：

* 完整 Prompt；
* Chat 全文；
* Tool 原始输入；
* Tool 原始输出；
* Secret；
* 本地路径；
* 用户文件正文。

允许上传：

* 状态；
* 时间；
* Tool 名称；
* 耗时；
* Token 统计；
* 错误码；
* Artifact 引用；
* 用户确认结果；
* 脱敏摘要。

---

## FR-32：Result Manifest

```json
{
  "taskId": "task-001",
  "assignmentId": "assignment-001",
  "status": "completed",
  "summary": "...",
  "metrics": {
    "durationMs": 120000,
    "tokenUsage": 30000
  },
  "artifacts": [
    {
      "artifactId": "artifact-001",
      "name": "report.md",
      "mediaType": "text/markdown",
      "size": 32000,
      "sha256": "...",
      "uploadStatus": "uploaded"
    }
  ]
}
```

---

## FR-33：Artifact 上传

流程：

```text
Runtime 请求预签名 URL
→ 上传文件
→ 校验 SHA-256
→ Center 确认
→ Runtime 回传 Artifact Ref
```

中心不得获得终端原始绝对路径。

---

# 16. Inventory 与 Heartbeat

## FR-34：Endpoint Inventory

上报：

* Runtime 版本；
* Hermes 已安装版本；
* Active Hermes；
* Instance 状态；
* Profile 版本；
* Skill 版本；
* Plugin 版本；
* MCP 状态；
* 磁盘容量；
* 最近错误；
* Desired State Revision；
* Outbox 数量。

---

## FR-35：Heartbeat

默认周期：

```text
5 分钟
```

状态变化时允许立即上报。

中心不可用时不持续高频重试。

---

## FR-36：Actual State

```json
{
  "desiredRevision": 28,
  "appliedRevision": 27,
  "status": "degraded",
  "resources": [],
  "conflicts": [],
  "lastApplyError": {}
}
```

---

# 17. Experience Capture

## FR-37：Experience Evidence

来源：

* 已完成任务；
* 用户修改后的最终结果；
* 审批决定；
* 工具调用序列；
* 失败和修复过程；
* 用户明确标记“可沉淀”；
* 重复出现的操作步骤；
* 高质量结果模板。

---

## FR-38：Evidence 类型

```text
workflow_trace
decision_rule
user_correction
approval_pattern
tool_sequence
result_template
failure_resolution
domain_term
```

---

## FR-39：数据模型

```text
experience_evidence
```

字段：

```text
id
endpoint_id
task_id
session_id
evidence_type
source_refs_json
summary
redacted_payload_json
confidence
sensitivity
created_at
reviewed_at
```

---

## FR-40：本地脱敏

必须移除：

* Secret；
* 客户隐私数据；
* 本地路径；
* 账号；
* Token；
* 内部系统 Session；
* 未授权附件；
* Chat 无关正文。

脱敏前的数据不得提交中心。

---

## FR-41：Experience Candidate

Candidate 类型：

```text
sop
decision_rule
prompt_template
skill_candidate
profile_patch
mcp_recipe
checklist
failure_playbook
```

状态：

```text
draft
local_review
approved_for_submit
submitted
accepted
rejected
published
```

本地只允许推进到：

```text
submitted
```

---

## FR-42：用户审核

Copilot Desktop 展示：

* 候选标题；
* 来源任务；
* 经验摘要；
* 建议适用范围；
* 脱敏结果；
* 预期升级类型；
* 提交范围。

用户可以：

```text
编辑
删除
批准提交
拒绝
```

---

## FR-43：StaffDeck Bridge

提交：

```http
POST /api/v1/endpoints/{id}/experience-candidates
```

结构：

```json
{
  "candidateId": "uuid",
  "candidateType": "sop",
  "title": "...",
  "summary": "...",
  "evidenceRefs": [],
  "scopeSuggestion": {
    "level": "department",
    "departmentId": "sales"
  },
  "content": {},
  "sensitivity": "internal"
}
```

StaffDeck 返回：

```text
received
reviewing
accepted
rejected
published
```

---

## FR-44：经验发布闭环

```text
Endpoint Evidence
→ Local Candidate
→ User Review
→ Service Center
→ StaffDeck Review
→ Expert Factory / Skill Build
→ Registry Publish
→ Desired State
→ Endpoint Apply
```

StaffDeck 不直接修改终端文件。

---

# 18. 本地 API

## 18.1 Endpoint

```http
GET  /api/v1/endpoint/status
POST /api/v1/endpoint/enrollment/start
POST /api/v1/endpoint/enrollment/complete
POST /api/v1/endpoint/enrollment/revoke
GET  /api/v1/endpoint/inventory
```

---

## 18.2 Sync

```http
GET  /api/v1/sync/status
POST /api/v1/sync/now
GET  /api/v1/sync/channels
GET  /api/v1/sync/resources
GET  /api/v1/sync/conflicts
POST /api/v1/sync/conflicts/{id}/resolve
GET  /api/v1/sync/dead-letters
POST /api/v1/sync/dead-letters/{id}/retry
```

---

## 18.3 Remote Tasks

```http
GET  /api/v1/remote-tasks
GET  /api/v1/remote-tasks/{id}
POST /api/v1/remote-tasks/{id}/accept
POST /api/v1/remote-tasks/{id}/reject
POST /api/v1/remote-tasks/{id}/cancel
GET  /api/v1/remote-tasks/{id}/events
```

---

## 18.4 Experience

```http
GET    /api/v1/experience/evidence
GET    /api/v1/experience/evidence/{id}
DELETE /api/v1/experience/evidence/{id}

GET    /api/v1/experience/candidates
POST   /api/v1/experience/candidates
PATCH  /api/v1/experience/candidates/{id}
DELETE /api/v1/experience/candidates/{id}
POST   /api/v1/experience/candidates/{id}/submit
```

---

# 19. Service Center 出站契约

以下接口由 Service Center 实现，本仓库只实现 Client：

```http
POST /api/v1/endpoints/enroll
POST /api/v1/endpoints/token/refresh
POST /api/v1/endpoints/{id}/heartbeat
POST /api/v1/endpoints/{id}/inventory

GET  /api/v1/endpoints/{id}/changes
POST /api/v1/endpoints/{id}/acks
POST /api/v1/endpoints/{id}/events/batch

POST /api/v1/task-assignments/{id}/claim
POST /api/v1/task-assignments/{id}/heartbeat
POST /api/v1/task-assignments/{id}/complete
POST /api/v1/task-assignments/{id}/fail

POST /api/v1/artifacts/upload-request
POST /api/v1/artifacts/{id}/complete

POST /api/v1/endpoints/{id}/experience-candidates
GET  /api/v1/endpoints/{id}/experience-reviews
```

---

# 20. 数据模型

新增表：

```text
endpoint_enrollments
endpoint_credentials
sync_channels
sync_cursors
sync_inbox
delivery_outbox
desired_state_revisions
desired_state_resources
resource_installations
resource_conflicts
remote_task_assignments
task_leases
task_delivery_records
result_artifacts
endpoint_inventory_snapshots
experience_evidence
experience_candidates
experience_submission_records
```

---

# 21. Capability 更新

API Version：

```text
1.2
```

新增 Capability：

```text
endpoint.enrollment
endpoint.inventory
sync.cursor
sync.desired-state
sync.resources
sync.offline-outbox
sync.dead-letter
tasks.remote.v2
tasks.lease
tasks.result.delivery
artifacts.presigned-upload
experience.capture
experience.local-review
experience.staffdeck.submit
runtime.release.production
runtime.maintenance.apply
installer.windows.production
```

---

# 22. 安全要求

## 22.1 网络

* 只允许 HTTPS；
* Runtime 本地 API 继续只监听 Loopback；
* 中心域名使用 Allowlist；
* 禁止任意重定向；
* 设置连接和读取超时；
* 限制响应体大小。

---

## 22.2 Secret

不得同步：

* Provider Key；
* API Server Key；
* MCP Secret；
* ERP Token；
* Device Private Key。

Secret 只存在于 Windows DPAPI。

---

## 22.3 Artifact

必须验证：

* Manifest Signature；
* Artifact Signature；
* SHA-256；
* Artifact 类型；
* 平台；
* 架构；
* Hermes 兼容版本；
* 解压路径穿越；
* 解压文件数量；
* 解压后总大小。

---

## 22.4 任务权限

远程任务必须携带：

```text
approvalPolicy
workspacePolicy
toolPolicy
dataPolicy
```

Runtime 只能在本地策略允许范围内执行。

中心策略不能绕过本地安全门控。

---

# 23. 兼容与迁移

## 23.1 Team Hub

旧：

```text
integrations/team_hub
```

迁移为兼容 Adapter。

新主路径：

```text
integrations/service_center
```

旧接口标记 Deprecated。

---

## 23.2 Profile API

旧：

```text
/profiles/{id}/chat/*
```

继续保留一个版本周期。

新调用只使用：

```text
/instances/{id}/chat/*
```

---

## 23.3 旧 Outbox

现有：

```text
sync_outbox
```

迁移至：

```text
delivery_outbox
```

迁移时保留未发送记录。

---

## 23.4 文档

必须更新：

* README；
* `docs/INDEX.md`；
* `docs/api-contract.md`；
* `docs/runtime-architecture.md`；
* `docs/runtime-desktop-contract.md`；
* `docs/runtime-installation.md`；
* `.env.example`；
* OpenAPI；
* `lat.md`。

删除固定 `D:\Programs` 和手工 Python 作为正式安装要求的描述。

---

# 24. 代码改造清单

## 24.1 新增模块

```text
src/integrations/service_center/
├─ client.py
├─ auth.py
├─ dto.py
├─ protocol.py
└─ artifact_client.py

src/services/
├─ endpoint_enrollment_service.py
├─ endpoint_inventory_service.py
├─ runtime_sync_service.py
├─ desired_state_service.py
├─ resource_sync_service.py
├─ remote_task_service.py
├─ task_delivery_service.py
├─ artifact_delivery_service.py
├─ experience_capture_service.py
├─ experience_candidate_service.py
└─ staffdeck_bridge_service.py

src/runtime/
├─ desired_state_reconciler.py
├─ resource_bundle.py
├─ sync_protocol.py
├─ delivery_backoff.py
└─ experience_redactor.py

src/workers/
├─ endpoint_heartbeat_worker.py
├─ desired_state_worker.py
├─ assignment_worker.py
├─ delivery_outbox_worker.py
└─ staffdeck_review_worker.py

src/api/v1/
├─ endpoint.py
├─ sync.py
├─ remote_tasks.py
└─ experience.py

src/schemas/
├─ endpoint.py
├─ sync.py
├─ remote_task.py
└─ experience.py
```

---

## 24.2 修改模块

```text
src/app.py
src/api/router.py
src/core/capabilities.py
src/core/config.py
src/core/lifecycle.py
src/services/bootstrap_service.py
src/services/runtime_service_update.py
src/services/task_sync_service.py
src/services/task_runtime.py
src/services/installation_service.py
src/workers/v12_workers.py
src/local_service/windows_user_daemon.py
build/runtime-bundle.ps1
build/hermes-wheelhouse.ps1
installer/wix/*
installer/bootstrapper/*
.github/workflows/runtime-windows.yml
```

---

# 25. 测试方案

## 25.1 单元测试

必须覆盖：

```text
endpoint enrollment
device key DPAPI
token refresh
sync cursor
inbox idempotency
outbox backoff
dead-letter
desired state plan
resource rollback
secret non-sync
assignment duplicate delivery
lease expiry
task cancellation
result manifest
artifact checksum
experience redaction
candidate state machine
StaffDeck submit
```

---

## 25.2 集成测试

### Desired State

```text
Center Mock
→ Desired State
→ Resource Download
→ Signature
→ Apply
→ Instance Restart
→ Actual State
```

### Remote Task

```text
Assignment
→ Claim
→ Hermes Run
→ Events
→ Result
→ Artifact Upload
→ Complete
```

### Offline

```text
Center 断开
→ 本地任务继续
→ Outbox 累积
→ Runtime 重启
→ Center 恢复
→ 按 Sequence 回传
```

### Experience

```text
Completed Task
→ Evidence
→ Redaction
→ Candidate
→ User Approval
→ StaffDeck Submit
```

---

## 25.3 Windows E2E

不得再使用占位 Skip。

测试环境：

```text
Windows 11 Pro
无 Python
无 Node
无 Git
无 uv
无 D 盘
普通用户
Restricted PowerShell
```

必须验证：

1. Setup 静默安装；
2. Runtime 登录自启；
3. Endpoint 注册；
4. Hermes 安装；
5. Instance Chat；
6. Desired State；
7. Skill 安装；
8. MCP 配置；
9. Remote Task；
10. 中心断开；
11. 恢复同步；
12. Runtime 更新；
13. Hermes 更新；
14. Repair；
15. Uninstall。

---

# 26. 验收标准

## 26.1 v1.4 Release Gate

```text
[ ] Runtime Bundle 不含 Placeholder
[ ] Hermes Wheelhouse 是真实 Artifact
[ ] MSI 构建失败会阻断 Release
[ ] Setup.exe 已签名
[ ] Manifest 已签名并正式发布
[ ] Runtime Maintenance 完成真实替换
[ ] Windows E2E 非 Skip
```

---

## 26.2 Endpoint

```text
[ ] Endpoint 可以注册和吊销
[ ] 私钥只存 DPAPI
[ ] Token 可刷新
[ ] 中心断开不影响本地 Chat
[ ] 中心吊销后停止同步
```

---

## 26.3 Sync

```text
[ ] Cursor 重启后不丢失
[ ] 同一消息只处理一次
[ ] Outbox 可恢复
[ ] 重试有退避和抖动
[ ] 超过上限进入 Dead Letter
[ ] Desired State 失败可以回滚
```

---

## 26.4 Task

```text
[ ] Assignment 重复下发只执行一次
[ ] Lease 可续期
[ ] Lease 失效停止结果提交
[ ] 中心取消可以终止 Hermes Run
[ ] Result 和 Artifact 可确认交付
[ ] 本地路径不上传
```

---

## 26.5 Experience

```text
[ ] 完成任务可以产生 Evidence
[ ] Evidence 经过脱敏
[ ] 用户可以审核 Candidate
[ ] 未经用户批准不能提交
[ ] Runtime 不能把 Candidate 标记为 Published
[ ] StaffDeck 状态可以同步回来
```

---

# 27. 里程碑

## M0：Production Release Gate

完成：

* Runtime Bundle；
* Wheelhouse；
* Installer；
* Maintenance；
* Signing；
* CI；
* Windows E2E。

---

## M1：Endpoint Identity 与 Sync Foundation

完成：

* Enrollment；
* Device Credential；
* Center Client；
* Cursor；
* Inbox；
* Outbox；
* Heartbeat。

---

## M2：Desired State 与 Resource Sync

完成：

* Profile；
* Expert；
* Skill；
* Plugin；
* MCP；
* Policy；
* Apply 与 Rollback。

---

## M3：Remote Task v2

完成：

* Assignment；
* Claim；
* Lease；
* Hermes Run；
* Events；
* Result；
* Artifact；
* Cancellation。

---

## M4：StaffDeck Experience Foundation

完成：

* Evidence；
* Redaction；
* Candidate；
* Local Review；
* Submit；
* Review Status。

---

## M5：Desktop 与正式验收

完成：

* Desktop API 1.2；
* 同步状态 UI；
* Remote Task UI；
* Experience Review UI；
* Windows 全链路验收。

---

# 28. 提交顺序

```text
1. fix(release): replace runtime and wheelhouse placeholders
2. feat(maintenance): implement real Runtime service update apply
3. feat(installer): build production MSI and Burn bootstrapper
4. ci(windows): enforce signed release and real E2E
5. feat(endpoint): add endpoint enrollment and device credentials
6. feat(sync): add cursor inbox outbox and delivery protocol
7. feat(desired-state): add reconciliation and resource apply
8. feat(resources): add profile expert skill plugin and mcp sync
9. feat(tasks): add remote assignment lease and cancellation
10. feat(delivery): add event result and artifact delivery
11. feat(inventory): add heartbeat and actual state reporting
12. feat(experience): add evidence capture and redaction
13. feat(staffdeck): add candidate submission bridge
14. refactor(team-hub): move legacy integration behind adapter
15. feat(api): expose endpoint sync task and experience APIs
16. test(e2e): add real Windows center-to-Hermes scenarios
17. docs(runtime): publish v1.5 architecture and operations
```

---

# 29. Definition of Done

```text
[ ] v1.4 的发布脚手架全部转为真实制品
[ ] Runtime 自更新不再返回 Stub
[ ] Windows E2E 自动执行
[ ] Endpoint Identity 可用
[ ] Service Center 双向同步可用
[ ] Desired State 可应用和回滚
[ ] 企业资源可以安全同步
[ ] Provider Secret 不进入中心
[ ] Remote Task 具备租约和幂等
[ ] 结果和 Artifact 可可靠交付
[ ] 中心断开时本地可继续工作
[ ] Outbox 重启后不丢失
[ ] Experience Evidence 可采集
[ ] Experience Candidate 需用户确认
[ ] StaffDeck Candidate 可提交
[ ] StaffDeck 不直接修改终端
[ ] nodeskclaw 不直接监管本地进程
[ ] Desktop 只通过 Runtime 操作 Hermes
[ ] API Version 升级到 1.2
[ ] 旧 Team Hub 和 Profile Chat 已标记 Deprecated
[ ] README 和架构文档与代码一致
[ ] pytest、ruff、Windows CI 全部通过
```

---

# 30. 最终交付结果

v1.5 完成后形成以下闭环：

```text
企业创建专家与任务
→ Service Center 生成 Desired State 和 Assignment
→ Endpoint Runtime 安全同步
→ Hermes Agent 本地执行
→ 事件与结果可靠回传
→ 用户修正和执行轨迹形成经验证据
→ StaffDeck 完成人工治理
→ Expert Factory 构建新版本
→ Registry 发布
→ Endpoint 获取新版本
```

该版本将 `smc-copilot-serve` 从“本机 Hermes 管理服务”升级为：

> 企业 Work Copilot 的本地可信执行节点、资源同步节点和经验采集节点。

建议文档路径：

```text
prd/ver1.5-endpoint-sync-experience.md
```

建议同步更新的基线文档：

```text
README.md
docs/runtime-architecture.md
docs/runtime-desktop-contract.md
docs/api-contract.md
docs/INDEX.md
```
