# Context Map — 架构与进程边界

## 三层模型

```text
Renderer (React)     → window.hermesAPI / smcShell / desktopAuth / …
       ↓ ipcRenderer.invoke
Preload (contextBridge) → src/preload/*.ts
       ↓ IPC
Main (Node.js)       → src/main/index.ts + 域模块
       ↓ HTTP / spawn
Portal Auth (:8000) + Hermes Gateway (:8642+) + copilot-serve (:8765)
```

## 硬性边界

| 层 | 允许 | 禁止 |
|----|------|------|
| Renderer | `window.*`、React、Tailwind | `electron`、`fs`、`path`、直接 IPC |
| Preload | `contextBridge`、薄封装 | 业务 UI |
| Main | FS、SQLite、子进程、IPC | React、DOM |

## 关键入口文件

| 文件 | 职责 |
|------|------|
| `src/main/index.ts` | IPC 注册中枢 |
| `src/preload/index.ts` | `hermesAPI` 主表 |
| `src/renderer/src/App.tsx` | 生命周期路由 splash→main |
| `src/renderer/src/Layout.tsx` | 主界面编排 |
| `docs/ARCHITECTURE.md` | 架构详述 |
| `docs/API_CONTRACTS.md` | IPC 单一事实源 |

## Profile 与路径

- 默认 Profile：`~/.hermes/`（Main 用 `profileHome()`）
- 桌面控制面：`~/.hermes/desktop/`（`profile-runtime.db` 等）
- **禁止**在 feature 模块硬编码 `%USERPROFILE%\.hermes`

## 延伸阅读

- 安装布局：`context-map/install-enterprise.md`
- 启动门控：`context-map/auth-bootstrap.md`
- Renderer 路由：`context-map/renderer-layout.md`
