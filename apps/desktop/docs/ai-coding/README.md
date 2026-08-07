# AI Coding 入口（SMC Copilot / ai-os-desktop）

> Agent 编码任务的**第一层索引**。不替代 `AGENTS.md` 与 `docs/API_CONTRACTS.md`，而是收敛「先读什么、去哪改、怎么验收」。

## 阅读顺序（Token 节流）

```text
1. AGENTS.md                          — 项目速查、Preload API、版本索引（每次任务扫一眼）
2. docs/ai-coding/context-map/<域>.md — 按任务域加载 L2（本目录，见下表）
3. docs/API_CONTRACTS.md              — 新/改 IPC 时必读
4. docs/renderer/ 或 prd/             — 仅当 L2 指向时再打开
```

**禁止**一次性读完整 PRD 目录或 `docs/INDEX.md` 全文；用 context-map 按需跳转。

## Context Map 路由

| 任务关键词 | 打开 |
|-----------|------|
| IPC / Preload / channel / hermesAPI | [`context-map/preload-ipc.md`](context-map/preload-ipc.md) |
| Main / Gateway / SQLite / 进程 | [`context-map/main.md`](context-map/main.md) |
| Layout / Tab / Workspace / 路由 | [`context-map/renderer-layout.md`](context-map/renderer-layout.md) |
| Local Hermes / Work 专家台 / Experts | [`context-map/hermes-workbench.md`](context-map/hermes-workbench.md) |
| Web Operator / 浏览器 / CRM Bridge | [`context-map/web-operator.md`](context-map/web-operator.md) |
| 登录 / 启动门控 / bootstrap | [`context-map/auth-bootstrap.md`](context-map/auth-bootstrap.md) |
| 安装 / NSIS / Enterprise / Doctor | [`context-map/install-enterprise.md`](context-map/install-enterprise.md) |
| 多 Profile / Gateway 端口 | [`context-map/profile-runtime.md`](context-map/profile-runtime.md) |
| MCP / GeneHub / Expert MCP | [`context-map/mcp-genehub-experts.md`](context-map/mcp-genehub-experts.md) |
| Work 任务窗口 / task SSE | [`context-map/work-tasks.md`](context-map/work-tasks.md) |
| 进程边界 / 三层架构 | [`context-map/architecture.md`](context-map/architecture.md) |
| 不确定归属 | [`context-map/00-routing.md`](context-map/00-routing.md) |

## Superpowers 工作流

本项目已安装 **Superpowers** 插件。编码流程见 [`superpowers-workflow.md`](superpowers-workflow.md)。

- 计划落盘：`docs/superpowers/plans/`
- 设计规格：`docs/superpowers/specs/`
- 任务模板：`templates/`

## 硬性约束（摘要）

与 `.cursor/rules/` 一致，此处只列入口级提醒：

- Renderer **禁止** Node 模块；只走 `window.*` Preload API
- 新 IPC：**Main → Preload → index.d.ts → API_CONTRACTS**（见 `003-ipc-contract.mdc`）
- **禁止**修改含 `#command by loudon` 的注释块（见 `008-loudon-command-comments.mdc`）
- 改 `screens/Hermes` 前读 v1.3 Spec Pack（见 `workbuddy-product-line.mdc`）

## 验收命令

```bash
npm run typecheck
npm run lint      # 触及 eslint 覆盖区时
npm test          # 改逻辑或 IPC 时
```

## 目录结构

```text
docs/ai-coding/
├── README.md                 # 本文件
├── superpowers-workflow.md   # Superpowers 与本仓库协作规范
├── context-map/              # 按域上下文地图（L2）
└── templates/                # 任务 / IPC / Screen 模板
```
