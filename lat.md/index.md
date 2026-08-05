# 项目概览

`smc-copilot-serve` 是面向 `smc-copilot-desktop` 的本机常驻 **Hermes Runtime Service**：负责 Hermes Agent 安装/更新/回滚、Instance/Gateway 监管、Profile 与角色、配置与 MCP、Workspace Chat、本地与团队任务、审批门控、工作空间安全策略、设备配对与本地鉴权。默认监听 `http://127.0.0.1:8765`，前缀 `/api/v1`。

本知识图谱描述项目「做什么」与「为什么」，不重复源码。各节用 `[[wiki link]]` 互引并锚定到源码符号，源码可用 `// @lat:` 反向引用。详见 [[index#文档导航]]。

## 系统边界

控制面位于 Desktop 与 Hermes Agent 之间，三者职责分离：

```text
copilot-desktop（UI / 登录 / 连接 Runtime）
  → smc-copilot-serve（本仓库：Runtime 控制面）
  → hermes-agent（Gateway 执行引擎，按 Profile 端口）
  → Team Task Hub / Workspace / 本地工具（经 Guard + Approval）
```

本服务**不负责**：LLM 推理实现、Gateway 进程内部逻辑、Electron UI 渲染。Hermes 始终被视为外部运行时（见 [[design-decisions#Hermes 视为外部运行时]]）。

## 技术栈

Python 3.12、FastAPI + Uvicorn、Pydantic v2 + pydantic-settings、SQLAlchemy 2.x async + SQLite（aiosqlite）、Alembic、httpx、python-multipart（附件上传）、asyncio subprocess + psutil、pytest / pytest-asyncio、uv 包管理。生产仅用 Alembic 建表，应用启动不 `create_all`。

## 文档导航

按下表按主题查阅各文档。

| 文档 | 主题 |
|------|------|
| [[architecture#架构总览]] | 分层职责、应用装配、生命周期 |
| [[runtime-service#Hermes Runtime Service]] | 版本管理、安装/更新/回滚、Job 队列 |
| [[gateway-supervisor#Gateway 监管]] | 进程生命周期、端口、健康、重协调 |
| [[profiles-instances#Profile 与 Instance]] | Profile CRUD、角色编译、能力协商 |
| [[task-runtime#任务运行时]] | 状态机、路由、Team Hub、Outbox、Worker |
| [[approval-workspace#审批与工作空间]] | 审批运行时、Workspace Guard、可执行策略 |
| [[auth-pairing#本地鉴权与设备配对]] | loopback、配对、遗留 Token |
| [[chat-sessions#Workspace Chat]] | Chat SSE、附件、Session |
| [[deployment#部署形态]] | Windows 服务/后台、目录约束、跨平台 |
| [[data-model#数据模型]] | 表、迁移链 |
| [[design-decisions#关键设计决策]] | 本地优先、隔离、门控 |
| [[tests#测试规范]] | 关键测试覆盖 |

源码根为扁平 `src/`（`PYTHONPATH=src` 或 `--app-dir src`），不再使用 `src/copilot_serve/` 包前缀。
