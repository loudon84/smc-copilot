# Known Pitfalls

## 进程通信

- **IPC channel 命名冲突**: 所有 channel 必须在 index.ts 中唯一注册，重复注册会静默覆盖
- **preload 类型不同步**: index.d.ts 必须与 index.ts 的实际 API 保持一致，否则渲染进程类型错误
- **IPC invoke 超时**: ipcRenderer.invoke 没有内置超时，长时间操作（安装、备份）需要通过事件推送进度

## Gateway 管理

- **Gateway 僵尸进程**: stopGateway() 需要同时 kill 进程引用和 PID 文件，否则可能残留
- **健康检查假阳性**: /health 检测通过不代表聊天可用（模型可能未配置）
- **自动重启竞态**: 修改 API Key 触发 restartGateway()，如果快速连续修改可能产生竞态
- **config.yaml 注入**: 首次启动自动追加 api_server 配置，重复启动不会重复追加（正则检测）

## 数据访问

- **SQLite 锁定**: Hermes Agent 进程可能锁定 state.db，better-sqlite3 打开可能失败
- **会话缓存不一致**: 缓存可能落后于实际数据，需要手动 syncSessionCache
- **MEMORY.md 字符限制**: 超过 2200 字符会被截断，用户可能丢失内容
- **USER.md 字符限制**: 超过 1375 字符会被截断

## UI

- **SSE 流中断**: 网络断开时 SSE 流可能静默中断，需要 chat-error 事件通知
- **远程模式无 CLI Fallback**: 远程模式下 API 不可用直接报错，没有 CLI 兜底
- **Claw3D WebView 依赖**: Office 页面依赖外部 dev server，未启动时显示空白

## 构建

- **better-sqlite3 native 模块**: 需要 electron-builder install-app-deps 重新编译
- **macOS 公证**: notarize=false，用户首次打开会看到 Gatekeeper 警告
- **Windows SmartScreen**: 未代码签名，首次打开会看到 SmartScreen 警告
