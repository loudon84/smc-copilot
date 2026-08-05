# smc-copilot-serve v1.4

# 企业 Windows Runtime 交付与统一 Instance 控制面方案 PRD

## 1. 文档信息

| 项目                | 内容                                         |
| ----------------- | ------------------------------------------ |
| 产品名称              | smc-copilot-serve / Hermes Runtime Service |
| 版本                | v1.4                                       |
| 文档类型              | 产品与技术实施 PRD                                |
| 目标仓库              | `loudon84/ai-os-serve`                     |
| 基线提交              | `0dab0baa29ba4d506234c7bf37066e11f7cc1689` |
| 基线版本              | v1.3.1 Windows Runtime Hotfix              |
| 建议开发分支            | `feature/runtime-v1.4-enterprise-delivery` |
| 目标系统              | Windows 11 Pro x64                         |
| Runtime API       | `127.0.0.1:8765`                           |
| Hermes API Server | `127.0.0.1:<instance.gateway_port>`        |
| 优先级               | P0                                         |
| 主要使用方             | Copilot Desktop、企业 IT、Runtime 运维工具         |

---

# 2. 版本定位

v1.3.1 解决的是：

```text
真实 Hermes 能否安装
→ Hermes Gateway 能否启动
→ Instance 能否独立监管
→ Secret 能否安全注入
```

v1.4 解决的是：

```text
Runtime 能否作为正式产品交付
→ 员工电脑能否无人值守安装
→ Desktop 能否通过统一 Instance 控制面使用 Chat
→ Hermes 能否安全更新和回滚
→ 企业能否稳定维护全部终端
```

v1.4 不再以“源码部署工具”为产品形态，而是形成正式的 Windows Runtime 产品：

```text
SMC-Copilot-Runtime-Setup.exe
        │
        ├─ 安装 Runtime 程序
        ├─ 安装受控 Python
        ├─ 安装 Hermes Agent
        ├─ 注册用户级后台任务
        ├─ 初始化本机配置
        ├─ 完成 Desktop 配对
        └─ 提供升级、修复和卸载
```

---

# 3. 当前完成情况

## 3.1 v1.3.1 已完成能力

当前源码已经完成：

1. 禁止 Stub Hermes 进入生产安装流程；
2. Manifest 字段校验和 SemVer 选择；
3. Hermes 可执行文件真实校验；
4. `hermes doctor` 命令修正；
5. Gateway CLI 命令修正；
6. 默认 Profile 和命名 Profile 路径区分；
7. Instance 独立 Gateway Supervisor；
8. Instance 自动启动和启动恢复；
9. Windows DPAPI SecretStore；
10. API Server Key 自动生成；
11. Gateway Scoped Environment；
12. Windows PythonPath 参数贯穿；
13. PowerShell Bypass `.cmd` 入口；
14. Provision 和 Smoke Test 脚本；
15. 配置原子写入和 Hermes Native Check；
16. 基础单元测试和 Mock Gateway 测试。

安装服务当前已经执行 Artifact 下载、校验、解压、venv、pip 安装、版本检查、配置迁移、Doctor 和版本激活。

Instance Gateway 已经能够独立解析 RuntimeVersion、加载 Profile Secret、启动 Gateway、检查健康、自动启动并执行重协调。

---

# 4. 当前待完成问题

## 4.1 P0：Gateway 内部鉴权链路未完成

Runtime 会自动生成并注入：

```text
API_SERVER_KEY
```

Hermes API Server 的 `/v1/models`、`/v1/runs`、`/v1/chat/completions` 等接口需要 Bearer Token。

但当前以下代码没有携带 Authorization：

* `HermesGatewayClient.list_models()`；
* `HermesGatewayClient.create_run()`；
* `HermesGatewayClient.get_run()`；
* `ChatStreamService.stream_chat()`；
* Windows Smoke Test `/v1/models`；
* 其它直接访问 Hermes API Server 的服务。

当前客户端只根据端口构造 URL，没有 Secret Resolver 或 Authorization Header。

Chat Stream 也只传递：

```text
Content-Type
Accept
x-hermes-session-id
```

没有传递 API Server Key。

### 结果

真实 Gateway 启用鉴权后：

```text
Runtime /health 正常
Gateway /health 正常
但 /v1/models 返回 401
Chat 返回 401
Runs 返回 401
Smoke Test 失败
```

---

## 4.2 P0：Chat 仍依赖旧 Profile 控制面

当前 Runtime 生命周期已迁移到：

```text
instances
RuntimeVersion
InstanceGatewayService
```

但 Chat 仍使用：

```text
ProfileRepository
ProfileRefResolver
profiles.status
profiles.gateway_port
profiles.profile_path
```

### 结果

可能出现：

```text
instances.status = running
profiles.status = stopped
```

此时：

```text
GET /instances/{id}/health
→ healthy

POST /profiles/{id}/chat/completions
→ gateway_not_running
```

v1.4 必须让 Chat、Session、Attachment、Model 和 Run 全部以 Instance 为运行时主对象。

---

## 4.3 P0：Hermes 更新和回滚不是 Instance 事务

当前 UpdateService：

1. 查询 Active RuntimeVersion；
2. 调用 InstallationService；
3. 将新版本设为 Active；
4. 清理旧版本。

但没有完成：

* 识别绑定旧版本的 Instance；
* 停止受影响 Gateway；
* 将 Instance 绑定到新版本；
* 启动新版本 Gateway；
* 验证 Chat；
* 失败时恢复 Instance 绑定；
* 失败时恢复 Gateway 运行；
* 检查旧版本是否仍被 Instance 引用。

CompatibilityService 当前固定返回：

```json
{
  "compatible": true
}
```

版本清理也直接删除 inactive 目录，没有先检查 Instance 是否固定引用该版本。

### 结果

可能出现：

```text
Active RuntimeVersion = 0.20
Instance.runtime_version_id = 0.19
```

或者：

```text
清理 inactive 0.19
→ Instance 仍绑定 0.19
→ Gateway 下次启动找不到 hermes.exe
```

---

## 4.4 P0：Provision 仍是开发脚本，不是企业安装器

当前 Provision 依赖：

* 已 clone 的源码仓库；

* 系统 Python 3.12；

* uv；

* Node；

* Git；

* PowerShell；

* 手工维护 `.env`；

* 已配置的 Manifest URL。

当前 Precheck 仍将 Node 和 Git 作为必检项，即使真实 Hermes Wheel 安装本身不需要 Git。

### 结果

员工电脑仍需研发式环境准备，无法通过企业软件中心、Intune、GPO 或 RMM 直接部署。

---

## 4.5 P0：UserDaemon 安装顺序冲突

Provision 会先启动临时 Runtime：

```text
127.0.0.1:8765
```

Smoke Test 成功后再执行：

```text
windows_user_daemon install
```

但 UserDaemon 安装逻辑发现 8765 已被占用时会直接返回错误码 2。

### 结果

Provision 可以完成 Hermes 安装，却无法正确注册 UserDaemon。

---

## 4.6 P0：v1.3.1 尚无真实 Windows E2E 验收

当前 `test_real_artifact_install.py` 主要验证：

* README-only ZIP 必须失败；
* Wheel 文件可被识别；
* Manifest SemVer 排序；
* Stub 代码不存在。

它没有构建并安装真实 Hermes Agent Wheel，也没有执行真实：

```text
hermes --version
hermes doctor
hermes gateway run
/v1/models
/v1/chat/completions
```

Instance Gateway 测试仍使用 `mock_hermes_gateway.py`。

当前 v1.3.1 验收清单全部未勾选。

---

## 4.7 P1：Runtime Service 自身没有正式发布机制

当前项目包版本仍为：

```text
0.1.0
```

没有形成与 PRD 对应的正式 Runtime 版本。

当前缺少：

* Runtime Release Artifact；
* Runtime Manifest；
* Runtime 自更新；
* MSI/EXE 安装包；
* Authenticode 签名；
* CI Windows 构建；
* 稳定版和测试版 Channel；
* Repair 安装；
* 安装产品注册信息。

---

## 4.8 P1：固定 `D:\Programs` 不适合全公司终端

当前脚本和路径校验强制：

```text
D:\Programs
```

公司员工电脑不一定存在 D 盘，因此该约束不能作为正式产品安装规则。

---

## 4.9 P1：Secret Scope 仍可能继承父进程密钥

Gateway Environment 当前从：

```python
os.environ
```

完整复制父进程环境，再覆盖 Profile Secret。

### 风险

若 Runtime 进程本身存在：

```text
DASHSCOPE_API_KEY
OPENAI_API_KEY
DEEPSEEK_API_KEY
```

命名 Profile 即使没有配置这些 Secret，也可能继承父进程中的值。

这与 Profile Secret 隔离目标冲突。

---

## 4.10 P1：Gateway 日志仍记录完整环境值集合

GatewayProcessManager 会记录经过规则替换后的整个环境字典。

当前脱敏规则主要覆盖：

```text
_KEY
_TOKEN
_API_KEY
```

没有覆盖：

```text
PASSWORD
PASS
SECRET
CREDENTIAL
COOKIE
CONNECTION_STRING
```

正式版本不应记录完整子进程环境值，只允许记录环境变量名称。

---

## 4.11 P1：配置修改会自动重启 Gateway

当前：

```text
PATCH /instances/{id}/configuration
```

只要返回 `restartRequired=true`，API 会立即重启 Instance。

### 问题

* 调用方不能选择延迟应用；
* 连续修改多个配置会连续重启；
* 重启失败后没有恢复旧配置并重新启动；
* 不适合 Desktop 批量编辑配置。

---

## 4.12 P1：MCP CRUD 没有写入 Hermes 配置

当前 MCP Server 保存到：

```text
%LOCALAPPDATA%\HermesRuntime\mcp_servers.json
```

MCP CRUD 只维护该 JSON 文件，没有：

* 编译到 Hermes Profile；
* 写入 Hermes MCP 配置；
* 关联 MCP Secret；
* 重启或 Reload Gateway；
* 验证 Hermes 实际加载状态。

### 结果

Runtime API 返回 MCP 创建成功，不代表 Hermes Agent 实际可以调用该 MCP。

---

## 4.13 P1：备份包含明文 `.env`

BackupService 会直接复制：

```text
~/.hermes/.env
~/.hermes/profiles
```

并生成普通 ZIP。

### 风险

备份中可能包含：

* Provider API Key；
* Bot Token；
* API Server Key；
* MCP Secret；
* 企业连接凭据。

---

## 4.14 P1：Job 取消只修改数据库状态

当前取消 Job 时，只将 Job 状态设为：

```text
cancelled
```

但不会：

* 取消正在下载的 HTTP 请求；
* 终止 pip 进程；
* 停止解压；
* 阻止 Handler 后续产生副作用。

### 结果

用户看到 Job 已取消，但后台仍可能继续安装或修改文件。

---

## 4.15 P1：Runtime 状态始终返回 ready

当前 RuntimeStatusService 固定返回：

```text
status = ready
```

只检查 Active Hermes 可执行文件是否存在。

没有区分：

```text
starting
ready
degraded
maintenance
failed
```

---

# 5. v1.4 产品目标

## 5.1 核心目标

v1.4 必须完成：

1. Gateway 内部鉴权桥接；
2. Chat 全面迁移到 Instance；
3. Hermes 更新、回滚和 Instance 切换事务化；
4. 企业 Windows 独立安装包；
5. 员工电脑无需预装 Python、uv、Git、Node；
6. Runtime 与 Hermes Release Pipeline；
7. 一次安装、自动启动、自动修复；
8. Production 默认启用 Runtime 鉴权；
9. Manifest 和 Artifact 可信校验；
10. Windows 实机自动化验收；
11. MCP 配置真正写入 Hermes；
12. 备份和日志达到企业安全要求。

---

## 5.2 版本完成后的用户体验

员工侧：

```text
双击 SMC-Copilot-Setup.exe
→ 自动安装
→ 启动 Copilot Desktop
→ 首次完成本机配对
→ 直接使用 Chat
```

IT 侧：

```text
SMC-Copilot-Setup.exe /quiet /channel=stable
```

Runtime 自动完成：

```text
安装 Runtime
→ 下载 Hermes
→ 校验签名
→ 创建默认 Instance
→ 启动 Gateway
→ 运行健康检查
→ 注册登录自启
→ 返回标准退出码
```

---

# 6. 非目标

v1.4 不包括：

* 不开发完整中央设备管理控制台；
* 不实现远程执行任意 PowerShell；
* 不支持 Runtime 监听公网地址；
* 不实现 Linux 企业安装器；
* 不实现 macOS 正式 LaunchAgent；
* 不开发 Hermes Agent 本身的新工具；
* 不开发完整 Skill Registry；
* 不删除全部旧 Profile 数据表；
* 不实现跨 Windows 用户共享同一 Hermes Profile；
* 不将 Provider Secret 上传到中心服务器。

Fleet 管理和远程策略进入 v1.5。

---

# 7. 目标架构

```text
┌───────────────────────────────────────────┐
│ Copilot Desktop                           │
│                                           │
│ Device Token                              │
│ Instance Chat API                         │
└───────────────────┬───────────────────────┘
                    │ REST / SSE
                    ▼
┌───────────────────────────────────────────┐
│ smc-copilot-serve                         │
│                                           │
│ Bootstrap Controller                      │
│ Runtime Service Updater                   │
│ Hermes Release Manager                    │
│ Instance Control Plane                    │
│ Gateway Credential Broker                 │
│ Configuration Compiler                    │
│ MCP Compiler                              │
│ SecretStore / DPAPI                       │
│ Diagnostics                               │
└───────────────────┬───────────────────────┘
                    │ CLI + Authenticated HTTP
                    ▼
┌───────────────────────────────────────────┐
│ Hermes Agent                              │
│                                           │
│ Version-isolated venv                     │
│ Profile Config                            │
│ Scoped Secrets                            │
│ API Server                                │
│ MCP Servers                               │
└───────────────────────────────────────────┘
```

---

# 8. 实施阶段

## 第一阶段：运行链路收敛

完成：

* GatewayCredentialBroker；
* Instance-native Chat；
* Profile 兼容 Adapter；
* Config Apply；
* Secret 环境隔离；
* MCP 配置编译。

## 第二阶段：版本事务

完成：

* Instance-aware Update；
* Instance-aware Rollback；
* Canary；
* 自动恢复；
* Pinned Version Cleanup；
* Job 真取消。

## 第三阶段：企业安装包

完成：

* Runtime 自包含 Bundle；
* MSI/Setup.exe；
* 受控 Python；
* Bootstrap 配置；
* 用户级后台；
* Repair；
* Uninstall。

## 第四阶段：发布与安全

完成：

* Runtime Release Pipeline；
* Hermes Wheelhouse；
* Manifest 签名；
* Authenticode；
* Channel；
* Production Auth。

## 第五阶段：验收与可观测

完成：

* Windows CI；
* 真实 Hermes E2E；
* Desktop Chat E2E；
* Diagnostic Bundle；
* Release Checklist。

---

# 9. 详细功能需求

## FR-01：Gateway Credential Broker

新增：

```text
src/services/gateway_credential_service.py
src/integrations/hermes/client_factory.py
```

### 统一创建客户端

禁止业务代码直接执行：

```python
HermesGatewayClient(port)
```

统一改为：

```python
client = await HermesGatewayClientFactory.create_for_instance(
    instance_id
)
```

Factory 负责解析：

```text
Instance
→ profile_name
→ gateway_port
→ API_SERVER_KEY
→ Authorization Header
```

### 请求头

```http
Authorization: Bearer <API_SERVER_KEY>
```

### 覆盖范围

必须覆盖：

* `/v1/models`；
* `/api/model/options`；
* `/v1/chat/completions`；
* `/v1/responses`；
* `/v1/runs`；
* Run status；
* Run events；
* Run stop；
* Session API；
* Detailed health。

### 安全要求

* API_SERVER_KEY 不返回 Desktop；
* 不写入日志；
* 不写入异常详情；
* 不写入 Chat SSE；
* 只由 Runtime 内部解析。

---

## FR-02：Instance-native Chat API

新增正式接口：

```text
GET  /api/v1/instances/{id}/chat/models
GET  /api/v1/instances/{id}/chat/model-options
GET  /api/v1/instances/{id}/chat/model-config
PUT  /api/v1/instances/{id}/chat/model-config
POST /api/v1/instances/{id}/chat/completions
POST /api/v1/instances/{id}/chat/abort

GET /api/v1/instances/{id}/sessions/{sessionId}/messages
```

### Chat 解析流程

```text
Instance ID
→ HermesInstance
→ RuntimeVersion
→ Gateway health
→ API Server credential
→ Hermes API
```

### 禁止依赖

新接口不得依赖：

```text
profiles.status
profiles.gateway_pid
profiles.gateway_port
ProfileRefResolver
```

### 兼容接口

旧接口继续保留：

```text
/profiles/{profile_id}/chat/*
```

内部通过：

```text
Profile
→ profile_name
→ HermesInstance
```

映射到 Instance Chat Service。

响应 Header 增加：

```text
Deprecation: true
Sunset: <planned-date>
```

---

## FR-03：Instance Ref Resolver

新增：

```text
src/services/instance_ref_resolver.py
```

支持：

```text
Instance ID
Instance name
profile_name
default
```

解析结果：

```json
{
  "instanceId": "...",
  "name": "default",
  "profileName": "default",
  "runtimeVersion": "0.20.0",
  "gatewayPort": 8642,
  "status": "running",
  "healthy": true
}
```

---

## FR-04：Chat 数据模型迁移

Chat Settings 当前以 `profile_id` 为主键。

v1.4 增加：

```text
instance_id
```

迁移策略：

```text
profile_id
→ 查找 profile.name
→ 查找 HermesInstance.profile_name
→ 写入 instance_id
```

过渡期允许：

```text
instance_id 非空优先
profile_id 仅兼容旧数据
```

附件、Session 和 Workspace Scope 统一增加 Instance 维度。

---

## FR-05：配置 Apply 模型

配置修改调整为两阶段：

```text
PATCH configuration
→ 保存并校验
→ 返回 restartRequired

POST configuration/apply
→ 重启 Gateway
→ 健康检查
→ 成功提交
```

### PATCH 请求

```json
{
  "group": "model",
  "values": {
    "provider": "custom",
    "model": "qwen-max"
  },
  "apply": false
}
```

### 返回

```json
{
  "configuration": {},
  "restartRequired": true,
  "applied": false,
  "snapshotId": "..."
}
```

### Apply 接口

```http
POST /api/v1/instances/{id}/configuration/apply
```

### Apply 失败

```text
恢复 Snapshot
→ 启动旧配置
→ 检查 Gateway
→ 返回 configuration_apply_failed
```

---

## FR-06：严格的 Gateway 环境隔离

禁止完整复制 `os.environ`。

改为白名单继承：

```text
PATH
PATHEXT
SYSTEMROOT
WINDIR
COMSPEC
USERPROFILE
LOCALAPPDATA
APPDATA
TEMP
TMP
LANG
```

随后注入当前 Profile Secret。

### 启动前清除

明确移除父进程中的：

```text
*_API_KEY
*_TOKEN
*_SECRET
*_PASSWORD
API_SERVER_KEY
```

### 日志

只记录：

```json
{
  "envKeys": [
    "PATH",
    "HERMES_HOME",
    "API_SERVER_PORT",
    "DASHSCOPE_API_KEY"
  ]
}
```

禁止记录任何环境变量值。

---

## FR-07：MCP 配置编译

MCP CRUD 不再只写 `mcp_servers.json`。

新增：

```text
McpConfigCompiler
McpSecretResolver
McpRuntimeValidator
```

### 处理流程

```text
Runtime MCP Record
→ ExecutablePolicy
→ Secret Reference
→ 编译 Hermes MCP 配置
→ hermes config check
→ Apply / Restart
→ Hermes Runtime Test
```

### 数据持久化

新增表：

```text
mcp_servers
mcp_secret_refs
mcp_test_results
```

不再以单个 JSON 文件作为主数据源。

### 状态

```text
draft
validating
ready
error
disabled
```

---

## FR-08：Hermes Update Plan

更新前生成计划：

```http
POST /api/v1/runtime/update/plan
```

请求：

```json
{
  "version": "latest",
  "channel": "stable",
  "instanceIds": ["..."],
  "strategy": "rolling"
}
```

返回：

```json
{
  "fromVersion": "0.19.0",
  "toVersion": "0.20.0",
  "affectedInstances": [],
  "compatibility": {
    "api": true,
    "config": true,
    "python": true
  },
  "warnings": []
}
```

---

## FR-09：事务化 Hermes 更新

更新步骤：

```text
解析目标版本
→ 下载并安装为 inactive
→ executable 验证
→ doctor
→ config compatibility check
→ 选择 Canary Instance
→ 停止 Canary
→ 绑定新版本
→ 启动 Canary
→ Gateway health
→ /v1/models
→ 最小 Chat Probe
→ 通过后更新其它 Instance
→ 设置 Active
→ 提交事务
```

### 失败处理

```text
停止新版本 Gateway
→ 恢复 Instance.runtime_version_id
→ 恢复旧 Active
→ 启动旧 Gateway
→ 检查健康
→ 标记 update failed
```

---

## FR-10：事务化回滚

Rollback 不得只切换 `active.json`。

必须同时处理：

```text
RuntimeVersion
Instance runtime_version_id
Gateway Process
Gateway Health
Chat Probe
```

支持：

```text
all
selected instances
canary rollback
```

---

## FR-11：Pinned Version Cleanup

删除版本前检查：

```text
是否 Active
是否被 Instance 引用
是否被 Update Plan 引用
是否为最后一个健康版本
是否为 Rollback 保留版本
```

被引用时返回：

```text
runtime_version_pinned
```

后台 Cleanup 不得绕过该检查。

---

## FR-12：Job 真取消

Runtime Job Handler 增加：

```python
CancellationToken
```

Handler 必须在以下阶段检查：

```text
下载分块
校验前
解压前
创建 venv 前
pip 安装期间
doctor 前
激活前
```

取消时：

* 关闭 HTTP Stream；
* 终止 pip 子进程；
* 删除 staging；
* 不激活版本；
* 不修改 Instance；
* 返回 `cancelled`。

---

## FR-13：企业安装目录策略

取消固定 `D:\Programs`。

### 默认用户级安装

```text
%LOCALAPPDATA%\Programs\SMC\CopilotRuntime
%LOCALAPPDATA%\Programs\SMC\HermesAgent
```

### 可选机器级安装

```text
%ProgramFiles%\SMC\CopilotRuntime
%ProgramFiles%\SMC\HermesAgent
```

### 数据目录保持

```text
%LOCALAPPDATA%\HermesRuntime
%USERPROFILE%\.hermes
```

### 兼容旧目录

检测：

```text
D:\Programs\copilot-serve
D:\Programs\HermesAgent
```

提供迁移工具，但不得自动删除旧目录。

---

## FR-14：自包含 Runtime Bundle

构建产物：

```text
runtime-bundle-win-x64.zip
├─ runtime\
├─ python\
├─ site-packages\
├─ scripts\
├─ migrations\
├─ config\
└─ manifest.json
```

员工电脑不需要预装：

```text
Python
uv
Git
Node
```

Node 只作为可选 Tool Runtime 单独安装。

---

## FR-15：Hermes Offline Wheelhouse

Hermes Artifact 改为：

```text
hermes-agent-<version>-win-x64.zip
├─ hermes_agent-<version>.whl
├─ wheelhouse\
├─ requirements.lock
└─ artifact.json
```

安装命令：

```text
python -m pip install
--no-index
--find-links wheelhouse
hermes_agent-<version>.whl
```

禁止终端安装期间直接访问 PyPI。

---

## FR-16：Windows Installer

输出：

```text
SMC-Copilot-Runtime-<version>-x64.msi
SMC-Copilot-Runtime-Setup-<version>.exe
```

建议技术：

```text
WiX Toolset 5
Burn Bootstrapper
```

### 支持参数

```text
/quiet
/channel=stable
/installScope=user
/bootstrapConfig=<path>
/norestart
/log=<path>
```

### 标准退出码

| 退出码 | 含义           |
| --- | ------------ |
| 0   | 成功           |
| 10  | 系统不支持        |
| 11  | 端口冲突         |
| 12  | Runtime 安装失败 |
| 13  | Hermes 安装失败  |
| 14  | Gateway 验证失败 |
| 15  | 鉴权初始化失败      |
| 16  | 签名验证失败       |
| 17  | Repair 失败    |

---

## FR-17：UserDaemon 生命周期修复

安装 UserDaemon 前：

1. 获取临时 Runtime PID；
2. 停止临时 Runtime；
3. 等待 8765 释放；
4. 注册计划任务；
5. 启动计划任务；
6. 等待 Runtime 健康；
7. 验证 Instance 自动恢复。

UserDaemon 安装不得因为“当前健康 Runtime 占用端口”而直接失败。

增加命令：

```text
install --replace
start
stop
restart
repair
status --json
```

---

## FR-18：明确 Windows Service 边界

默认不使用 LocalSystem Windows Service。

原因：

```text
DPAPI Secret
HERMES_HOME
Profile
用户会话
```

均属于 Windows 用户上下文。

### v1.4 默认

```text
Task Scheduler ONLOGON
当前用户
LIMITED
```

机器级 Installer 只负责安装二进制，Runtime 仍由每个用户的任务启动。

Windows Service 模式标记为：

```text
experimental
```

---

## FR-19：Bootstrap 配置

安装器读取：

```json
{
  "tenantId": "smc",
  "runtimeChannel": "stable",
  "runtimeManifestUrl": "...",
  "hermesManifestUrl": "...",
  "requireAuth": true,
  "allowLegacyToken": false,
  "defaultInstance": {
    "name": "default",
    "gatewayPort": 8642,
    "autoStart": true
  }
}
```

Bootstrap 配置不得包含 Provider API Key。

---

## FR-20：Bootstrap 一次性令牌

Production 模式默认：

```text
RUNTIME_REQUIRE_AUTH=true
```

安装器启动 Runtime 时生成一次性 Bootstrap Token。

只允许调用：

```text
POST /api/v1/bootstrap
GET  /api/v1/bootstrap/jobs/{id}
```

Bootstrap 完成后令牌立即失效。

Desktop 后续仍通过 Device Pairing 获取正式 Device Token。

---

## FR-21：Runtime Service Release

Runtime 与 Hermes 使用独立版本：

```text
Runtime Service Version
Hermes Agent Version
Runtime API Version
Desktop API Version
```

示例：

```json
{
  "serviceVersion": "1.4.0",
  "apiVersion": "1.1",
  "activeHermesVersion": "0.20.0"
}
```

修改：

```text
pyproject.toml version
src/version.py
build metadata
installer product version
```

---

## FR-22：Runtime Service 更新

Hermes Update 与 Runtime Service Update 分离。

新增：

```text
GET  /api/v1/service/update/check
POST /api/v1/service/update/download
POST /api/v1/service/update/apply
```

Runtime 自身更新由 Maintenance Process 执行：

```text
下载新 Runtime
→ 签名校验
→ 停止 UserDaemon
→ 备份数据库
→ 替换程序
→ Alembic
→ 启动
→ 健康检查
→ 失败回滚
```

---

## FR-23：Manifest 签名

SHA-256 只能验证完整性，不能证明发布者身份。

v1.4 增加：

```text
Ed25519 Manifest Signature
Embedded Public Key
Key ID
Signature Expiry
```

Manifest：

```json
{
  "payload": {},
  "keyId": "smc-runtime-2026",
  "signature": "base64..."
}
```

安装器和 Runtime 必须先验证签名，再读取 Artifact URL。

---

## FR-24：Artifact 安全策略

增加：

* HTTPS 强制；
* 允许域名列表；
* 最大 Manifest 大小；
* 最大 Artifact 大小；
* 下载超时；
* 重定向域名校验；
* Archive 文件数量限制；
* Archive 解压总大小限制；
* Archive 路径穿越检查；
* 下载缓存；
* Partial 文件清理。

---

## FR-25：代码签名

以下文件必须 Authenticode 签名：

```text
Setup.exe
MSI
Runtime executable
Maintenance executable
PowerShell scripts
```

安装器必须验证 Runtime Bundle 和 Hermes Artifact 签名。

---

## FR-26：安全备份

备份默认不包含：

```text
.env
DPAPI 文件
Provider Secret
API_SERVER_KEY
Device Token
```

备份 Manifest 只记录 Secret 元数据：

```json
{
  "name": "DASHSCOPE_API_KEY",
  "configured": true
}
```

可选 Secret 备份必须：

* 使用 DPAPI；
* 限定当前 Windows 用户；
* 明确标记不可跨用户恢复。

Restore 前必须停止相关 Instance。

---

## FR-27：Runtime Readiness

状态扩展：

```text
starting
ready
degraded
maintenance
failed
```

Readiness 检查：

```text
数据库
Migration
Job Worker
SecretStore
Active Hermes
Instance
Gateway
磁盘
Manifest
```

返回：

```json
{
  "status": "degraded",
  "checks": {
    "database": "ok",
    "secretStore": "ok",
    "hermes": "ok",
    "defaultInstance": "failed"
  }
}
```

---

## FR-28：诊断包

新增：

```http
POST /api/v1/diagnostics/bundle
```

输出：

```text
runtime-diagnostics-<timestamp>.zip
```

包含：

* 版本信息；
* Runtime 状态；
* Instance 状态；
* Job 摘要；
* 日志尾部；
* 环境检查；
* 配置结构；
* Manifest 元数据。

禁止包含：

* Secret；
* Token；
* `.env` 内容；
* Chat 正文；
* 用户文件内容。

---

## FR-29：Repair

安装器支持：

```text
Setup.exe /repair
```

Repair 检查：

```text
Runtime 文件
受控 Python
数据库 Migration
UserDaemon
端口
Active Hermes
Instance
Gateway
```

只修复程序和控制面，不默认删除：

```text
~/.hermes
Session
Skill
Memory
```

---

## FR-30：正式卸载

支持：

```text
Setup.exe /uninstall /quiet
```

默认删除：

```text
Runtime 程序
UserDaemon
Runtime 缓存
临时文件
```

默认保留：

```text
~/.hermes
Hermes Profile
Session
Skill
Memory
```

提供显式参数：

```text
/removeRuntimeData
/removeHermesVersions
/removeHermesUserData
```

---

# 10. 数据模型改造

## 10.1 新增表

### runtime_service_versions

```text
id
version
channel
install_path
status
checksum
signature_key_id
installed_at
activated_at
```

### runtime_update_plans

```text
id
from_version
to_version
strategy
status
affected_instances_json
created_at
completed_at
```

### mcp_servers

```text
id
instance_id
name
transport
command
args_json
url
enabled
status
created_at
updated_at
```

### mcp_secret_refs

```text
id
mcp_server_id
secret_name
secret_reference_id
```

### bootstrap_sessions

```text
id
token_hash
status
expires_at
completed_at
```

---

## 10.2 修改表

### chat_settings

增加：

```text
instance_id
```

### attachments

增加：

```text
instance_id
```

### runtime_jobs

增加：

```text
cancellation_requested_at
rollback_state_json
operation_id
```

### runtime_versions

增加：

```text
signature_key_id
artifact_type
manifest_version
verified_at
```

---

# 11. API 版本

Runtime API 升级为：

```text
API Version 1.1
```

保持 `/api/v1` URL，不改变主路径。

Capability 新增：

```text
gateway.auth.internal
instances.chat
instances.sessions
runtime.update.plan
runtime.update.transactional
runtime.job.cancel
runtime.service.update
runtime.bootstrap
runtime.repair
mcp.compile
diagnostics.bundle
artifact.signature
```

---

# 12. Windows 发布流程

```text
Git Tag runtime-v1.4.0
        │
        ▼
GitHub Actions Windows Runner
        │
        ├─ pytest
        ├─ ruff
        ├─ build wheel
        ├─ build runtime bundle
        ├─ build MSI
        ├─ build Setup.exe
        ├─ sign artifacts
        ├─ integration test
        └─ publish manifest
```

### Channel

```text
dev
beta
stable
```

### Promotion

```text
dev artifact
→ 自动测试
→ beta 签名
→ Windows 人工验收
→ stable promotion
```

Stable 不重新构建，只提升已验证 Artifact。

---

# 13. 测试方案

## 13.1 单元测试

新增：

```text
test_gateway_client_adds_bearer_token
test_chat_stream_adds_bearer_token
test_instance_chat_does_not_read_profiles_status
test_parent_provider_secrets_not_inherited
test_gateway_logs_only_env_keys
test_update_rebinds_instances
test_update_failure_restores_instance_binding
test_cleanup_rejects_pinned_version
test_job_cancel_terminates_pip
test_mcp_compile_writes_hermes_config
test_backup_excludes_plaintext_env
test_runtime_readiness_degraded
```

---

## 13.2 集成测试

必须使用可安装 Wheel Bundle：

```text
构建测试 Hermes Package
→ pip --no-index
→ hermes.exe
→ doctor
→ Gateway
→ Bearer /v1/models
→ Chat SSE
```

不能只测试 README-only 包失败。

---

## 13.3 真实 Hermes 测试

CI Nightly 使用公司 Hermes Agent Artifact：

```text
真实 Hermes Wheel
真实依赖 Wheelhouse
真实 Windows venv
真实 API Server
Mock Provider Endpoint
```

不使用 Mock Gateway。

---

## 13.4 Windows Installer 测试

测试环境：

```text
Windows 11 Pro
无 Python
无 Node
无 Git
无 uv
无 D 盘
Restricted PowerShell
普通用户
```

测试：

1. 静默安装；
2. 首次启动；
3. Hermes 下载；
4. Device Pairing；
5. Chat；
6. Runtime 更新；
7. Hermes 更新；
8. 回滚；
9. Repair；
10. 卸载；
11. 重新安装；
12. 用户数据保留。

---

# 14. 验收标准

## 14.1 安装验收

```text
员工电脑无需源码 clone
无需预装 Python
无需预装 uv
无需预装 Git
无需预装 Node
Setup.exe 可静默安装
Runtime 登录后自动启动
```

## 14.2 Chat 验收

```text
Instance healthy
Bearer /v1/models 成功
Bearer Chat SSE 成功
不依赖 profiles.status
Attachment 可用
Session 可恢复
```

## 14.3 更新验收

```text
新版本先安装 inactive
Canary 验证通过再切换
Instance 自动重绑
失败自动恢复旧版本
旧 Gateway 自动恢复
Pinned 版本不被删除
```

## 14.4 安全验收

```text
Runtime API 默认要求 Device Token
Gateway API Key 不暴露给 Desktop
命名 Profile 不继承父进程 Provider Secret
日志无环境变量值
Manifest 签名验证
Installer Authenticode 通过
备份无明文 .env
```

## 14.5 运维验收

```text
Repair 可恢复损坏安装
Diagnostic Bundle 可生成
卸载默认保留 Hermes 用户数据
标准退出码可被 IT 平台识别
```

---

# 15. 代码改造清单

## 必须修改

```text
src/integrations/hermes/client.py
src/services/chat_model_service.py
src/services/chat_stream_service.py
src/services/chat_session_service.py
src/services/profile_ref_resolver.py
src/services/update_service.py
src/services/installation_service.py
src/services/runtime_job_service.py
src/services/configuration_service.py
src/services/mcp_service.py
src/services/backup_service.py
src/services/runtime_status_service.py
src/runtime/gateway_environment.py
src/runtime/gateway_process.py
src/runtime/artifact_downloader.py
src/local_service/windows_user_daemon.py
src/core/capabilities.py
src/core/config.py
src/api/v1/chat.py
src/api/v1/configurations.py
src/api/v1/runtime.py
src/api/v1/diagnostics.py
scripts/runtime-provision-windows.ps1
scripts/runtime-smoke-test-windows.ps1
pyproject.toml
```

## 建议新增

```text
src/integrations/hermes/client_factory.py
src/services/gateway_credential_service.py
src/services/instance_ref_resolver.py
src/services/instance_chat_service.py
src/services/runtime_update_plan_service.py
src/services/runtime_service_update.py
src/services/bootstrap_service.py
src/services/diagnostic_bundle_service.py
src/runtime/artifact_signature.py
src/runtime/archive_policy.py
src/runtime/cancellation_token.py
src/runtime/mcp_config_compiler.py
installer/wix/
installer/bootstrapper/
build/runtime-bundle.ps1
build/hermes-wheelhouse.ps1
.github/workflows/runtime-windows.yml
```

---

# 16. 开发提交顺序

```text
1. fix(gateway-auth): add internal API server credential broker
2. refactor(chat): migrate chat runtime resolution to instances
3. refactor(config): separate save validate and apply
4. fix(secrets): isolate child environment and remove env value logging
5. feat(mcp): compile runtime MCP records into Hermes configuration
6. feat(update): add instance-aware update plan and transactional rollout
7. feat(rollback): restore instance bindings and gateways transactionally
8. fix(jobs): implement cooperative cancellation
9. feat(packaging): build self-contained Windows runtime bundle
10. feat(installer): add WiX MSI and bootstrapper
11. feat(security): add signed manifests and artifact policy
12. feat(service-update): add Runtime Service maintenance updater
13. feat(diagnostics): readiness repair and diagnostic bundle
14. test(windows): add real Hermes and installer E2E
15. docs(runtime): publish v1.4 deployment and operations guides
```

---

# 17. 里程碑

## M1：Instance 控制面收敛

完成：

* Gateway Auth；
* Instance Chat；
* Config Apply；
* Secret 隔离；
* MCP Compile。

验收：

```text
Desktop 不再依赖旧 Profile Gateway 状态完成 Chat
```

## M2：版本事务

完成：

* Update Plan；
* Canary；
* Instance Rebind；
* Rollback；
* Pinned Cleanup；
* Job Cancel。

验收：

```text
升级失败后所有 Instance 恢复旧版本并保持可用
```

## M3：Windows 产品交付

完成：

* Runtime Bundle；
* Installer；
* UserDaemon；
* Bootstrap；
* Repair；
* Uninstall。

验收：

```text
全新 Windows 普通用户电脑无需开发环境即可安装
```

## M4：Release 与安全

完成：

* CI；
* Signed Manifest；
* Authenticode；
* Stable Channel；
* Runtime Service Update。

验收：

```text
IT 可通过静默命令批量部署
```

---

# 18. Definition of Done

```text
[ ] Gateway 所有受保护接口携带内部 Bearer Token
[ ] Chat、Model、Session、Attachment 使用 Instance 控制面
[ ] 旧 Profile Chat 仅作为兼容 Adapter
[ ] Profile Secret 不继承父进程 Provider Secret
[ ] Gateway 日志不记录环境变量值
[ ] MCP API 创建后 Hermes 实际加载 MCP
[ ] Config 修改不会未经控制连续重启
[ ] Update 会重绑并重启受影响 Instance
[ ] Rollback 会恢复 Instance 与 Gateway
[ ] Cleanup 不删除 Pinned Version
[ ] Job Cancel 可终止真实安装操作
[ ] Runtime Service 版本更新到 1.4.0
[ ] 生成自包含 Runtime Bundle
[ ] 生成 MSI 和 Setup.exe
[ ] 员工电脑无需 Python、uv、Git、Node
[ ] 不依赖 D:\Programs
[ ] Production 默认启用 Runtime Auth
[ ] Manifest 使用数字签名
[ ] Installer 使用 Authenticode
[ ] 备份不包含明文 Secret
[ ] Runtime Readiness 支持 degraded
[ ] Repair、Uninstall 可用
[ ] 真实 Hermes Windows E2E 通过
[ ] Desktop Chat E2E 通过
[ ] Windows CI 全部通过
[ ] v1.4 验收文档全部勾选
```

---

# 19. 最终交付结果

v1.4 完成后，产品链路应达到：

```text
研发发布一次 Runtime 和 Hermes Artifact
        │
        ▼
IT 静默下发 Setup.exe
        │
        ▼
员工电脑自动安装 Runtime
        │
        ▼
Runtime 安装并监管 Hermes
        │
        ▼
Desktop 使用 Instance Chat API
        │
        ▼
Hermes 可安全更新、回滚和修复
```

v1.4 的阶段验收不再是：

```text
脚本能运行
```

而是：

```text
正式安装包可批量交付
真实 Hermes 可运行
Desktop Chat 可使用
版本可安全升级
故障可自动恢复
运维不依赖研发手工处理
```
