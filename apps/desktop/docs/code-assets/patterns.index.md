# Patterns Index

## 架构模式

| 模式 | 说明 | 使用位置 |
|---|---|---|
| Electron 三层隔离 | Main / Preload / Renderer 严格分离 | 全项目 |
| IPC invoke/handle | 渲染进程通过 ipcRenderer.invoke 调用主进程 | preload ↔ main |
| contextBridge | 预加载层通过 contextBridge 暴露安全 API | src/preload/index.ts |
| SSE 流式通信 | Server-Sent Events 实时推送聊天内容 | hermes.ts + sse-parser.ts |
| 双路由消息 | API Server 优先，CLI Fallback | hermes.ts:sendMessage() |
| 健康检查轮询 | 15s 间隔检测 Gateway 可用性 | hermes.ts |
| 屏幕路由 | splash → welcome → install → setup → main | App.tsx |
| 侧边栏导航 | 13 个视图的 Tab 导航 | Layout.tsx |

## 数据模式

| 模式 | 说明 | 使用位置 |
|---|---|---|
| SQLite 只读查询 | 会话历史通过 better-sqlite3 读取 | sessions.ts |
| JSON 文件 CRUD | 模型/缓存等用 JSON 文件存储 | models.ts, session-cache.ts |
| YAML 配置读写 | config.yaml 解析和写入 | config.ts |
| .env 键值对 | API Keys 环境变量 | config.ts |
| Markdown 文件 | MEMORY.md / SOUL.md / USER.md | memory.ts, soul.ts |
| Profile 隔离 | 每个配置档案独立目录 | profiles.ts |

## UI 模式

| 模式 | 说明 | 使用位置 |
|---|---|---|
| 流式聊天 | SSE chunk → 实时追加 → done 完成 | Chat.tsx |
| 工具进度推送 | hermes.tool.progress 事件 → 进度条 | Chat.tsx |
| Usage 统计 | token 用量 + cost + rate limit | Chat.tsx |
| 缓存优先 | 会话列表先读缓存，按需同步 | Sessions.tsx |
| 条件横幅 | 远程模式提示 | RemoteNotice.tsx |
| 主题切换 | 系统/亮/暗三模式 | ThemeProvider.tsx |
| i18n 切换 | 4 语言实时切换 | I18nProvider.tsx |

## 进程管理模式

| 模式 | 说明 | 使用位置 |
|---|---|---|
| spawn + detach | Gateway 进程独立运行 | hermes.ts:startGateway() |
| PID 文件清理 | 读取 gateway.pid kill 残留进程 | hermes.ts:stopGateway() |
| 自动重启 | 配置变更时重启 Gateway | index.ts (set-env handler) |
| before-quit 清理 | 应用退出前停止子进程 | index.ts |
