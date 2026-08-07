# Context Map — Main 进程

## 职责

Node.js 特权层：IPC、Gateway 生命周期、SQLite、企业安装、Web Operator 浏览器控制、Token 存储。

## 模块速查

| 域 | 路径 | 一句话 |
|----|------|--------|
| 入口 / IPC 注册 | `src/main/index.ts` | 新 handler 薄注册，逻辑放域模块 |
| Gateway / 聊天 | `src/main/hermes.ts` | 启停 Gateway、SSE/CLI 消息路由 |
| 配置 | `src/main/config.ts` | desktop.json、.env、config.yaml |
| 安装 | `src/main/installer.ts` | 向导安装；委托 `enterprise/` |
| 会话 | `src/main/sessions.ts` | state.db 只读 |
| Profile CRUD | `src/main/profiles.ts` | Profile 目录发现 |
| 多 Profile 运行时 | `src/main/profile-runtime-*.ts` | 见 profile-runtime.md |
| Web Operator | `src/main/browser/` | BrowserController、审计 |
| Auth | `src/main/auth/` | Portal 登录、Token Vault |
| 启动门控 | `src/main/startup/` | splash→login 决策 |
| MCP Gateway | `src/main/mcp-skill-gateway-runtime/` | 本地 Proxy :48742 |
| GeneHub | `src/main/genehub/` | Skill 同步 |
| Hermes Experts | `src/main/hermes-experts/` | Expert MCP 客户端 |
| Work 任务 | `src/main/work/` | task-send SSE |
| 运行时路径 | `src/main/runtime/runtime-paths.ts` | V5.3 hermes/serve/portal |
| 窗口 | `src/main/window/window-ipc.ts` | window:* |
| Shell | `src/main/shell/` | 主窗口、ShellView、菜单 |

## 改 Gateway 前必读

1. `src/main/hermes.ts`
2. `src/main/profile-runtime-manager.ts`（多 Profile）
3. `AGENTS.md` § Multi Profile Runtime

配置影响 Gateway 行为时通常需 `restartGateway()`。

## 新 IPC 流程

见 `preload-ipc.md` 与 `templates/ipc-change.md`。

## 测试

- `tests/ipc-handlers.test.ts`
- 域相关 `tests/*.test.ts`

## 不要

- 在 `setupIPC()` 内写大段业务逻辑
- 从 Renderer 路径 import Main 模块
- 未读 `hermes.ts` 就改 Gateway spawn 参数
