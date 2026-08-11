# 项目概览

`smc-copilot-serve` 是 Desktop 的本机 Hermes Runtime 控制面，并在 v1.5 承担企业终端 Endpoint Sync。默认监听 `http://127.0.0.1:8765`，API 前缀 `/api/v1`。

本知识图谱描述项目「做什么」与「为什么」，不重复源码。各节用 `[[wiki link]]` 互引并锚定到源码符号，源码可用 `// @lat:` 反向引用。详见 [[index#文档导航]]。

v1.6 在 Endpoint Sync 之上补齐生产执行面：真实 Hermes 任务、真实资源安装、可靠 Sync、Worker Supervisor 与 API 1.3。

## 系统边界

控制面位于 Desktop 与 Hermes Agent 之间，三者职责分离：

```text
copilot-desktop（UI / 登录 / 连接 Runtime）
  → smc-copilot-serve（本仓库：Runtime 控制面 + Endpoint Sync）
  → hermes-agent（Gateway 执行引擎，按 Profile 端口）
  → Work Copilot Service Center（Stub/HTTPS）/ Team Hub（Deprecated）/ Workspace
```

本服务**不负责**：LLM 推理实现、Gateway 进程内部逻辑、Electron UI 渲染。Hermes 始终被视为外部运行时（见 [[design-decisions#Hermes 视为外部运行时]]）。

## 技术栈

Python 3.12、FastAPI + Uvicorn、Pydantic v2 + pydantic-settings、SQLAlchemy 2.x async + SQLite（aiosqlite）、Alembic、httpx、python-multipart（附件上传）、asyncio subprocess + psutil、pytest / pytest-asyncio、uv 包管理。生产仅用 Alembic 建表，应用启动不 `create_all`。

## 文档导航

按下表按主题查阅各文档。

| 文档 | 主题 |
|------|------|
| [[architecture#架构总览]] | 分层职责、应用装配、生命周期 |
| [[runtime-service#Hermes Runtime Service]] | 真实安装、版本/Job、配置与 Secret |
| [[gateway-supervisor#Gateway 监管]] | Instance/legacy 启停、CLI 合同、env 注入 |
| [[profiles-instances#Profile 与 Instance]] | Profile 路径、Instance、角色编译 |
| [[task-runtime#任务运行时]] | 状态机、路由、Team Hub、Outbox、Worker |
| [[approval-workspace#审批与工作空间]] | 审批运行时、Workspace Guard、可执行策略 |
| [[auth-pairing#本地鉴权与设备配对]] | loopback、配对、遗留 Token |
| [[chat-sessions#Workspace Chat]] | Chat SSE、附件、Session、Chat Runtime v2 |
| [[kanban#Hermes Kanban Facade]] | Instance-scoped Kanban CLI Facade（独立于 WorkTask） |
| [[deployment#部署形态]] | Provision、UserDaemon、目录约束 |
| [[data-model#数据模型]] | 表、迁移链 |
| [[endpoint-sync#Endpoint Sync]] | Endpoint 身份、Sync、Desired State、Remote Task v2、Experience |
| [[design-decisions#关键设计决策]] | 本地优先、隔离、失败不破坏现状 |
| [[tests#测试规范]] | 真实安装、Instance Gateway、bootstrap |
源码根为扁平 `src/`（`PYTHONPATH=src` 或 `--app-dir src`），不再使用 `src/copilot_serve/` 包前缀。
