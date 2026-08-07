# Architecture Decisions

## AD-1: Electron 三层进程隔离

- **决策**: 严格遵循 Main / Preload / Renderer 三层模型
- **原因**: Electron 安全模型要求渲染进程不能直接访问 Node.js API
- **影响**: 所有渲染进程到主进程的通信必须通过 IPC
- **文件**: src/main/, src/preload/, src/renderer/

## AD-2: 双路由消息发送

- **决策**: API Server 优先，CLI Fallback
- **原因**: API Server 提供 SSE 流式输出和会话管理，CLI 作为兜底
- **影响**: hermes.ts 的 sendMessage() 需要健康检查和路径选择逻辑
- **文件**: src/main/hermes.ts

## AD-3: 本地/远程双模式

- **决策**: 支持本地 Gateway 和远程 API Server 两种连接模式
- **原因**: 用户可能在远程服务器运行 Hermes Agent
- **影响**: 远程模式跳过 CLI Fallback，始终使用 API
- **文件**: src/main/hermes.ts, src/main/config.ts

## AD-4: 会话缓存层

- **决策**: 本地 JSON 缓存 + SQLite 原始数据
- **原因**: SQLite 查询较慢，缓存提供快速会话列表和标题
- **影响**: 需要同步机制保持缓存与数据库一致
- **文件**: src/main/session-cache.ts

## AD-5: better-sqlite3 只读访问

- **决策**: Desktop 只读取 state.db，不写入
- **原因**: 数据库由 Hermes Agent Python 进程管理，避免并发写入冲突
- **影响**: 会话管理只有 list/get/search，没有 create/update/delete
- **文件**: src/main/sessions.ts

## AD-6: 配置档案隔离

- **决策**: 每个 Profile 独立目录 ~/.hermes/profiles/<name>
- **原因**: 不同使用场景需要不同的 API Key、模型、记忆
- **影响**: 切换 Profile 需要重启 Gateway
- **文件**: src/main/profiles.ts

## AD-7: i18n 命名空间拆分

- **决策**: 每个功能域一个翻译文件（20 个模块）
- **原因**: 按需加载，减少初始包体积
- **影响**: 新增页面需要同步添加 4 个语言的翻译文件
- **文件**: src/shared/i18n/locales/
