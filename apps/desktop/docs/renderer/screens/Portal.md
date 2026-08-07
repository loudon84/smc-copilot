# Portal

## 1. 路径

```text
src/renderer/src/screens/Portal/
```

## 2. 入口

由 `WorkspaceRenderer` 根据 registry `portal`（kind `webview`）渲染。

## 3. 职责

- Portal WebView 嵌入页
- 加载 Portal 前端（aios-home，默认 `http://127.0.0.1:3000`）
- 通过 `WebContentsHost` 控制显示/隐藏（deactivate/activate）
- Bearer Token 自动注入到 `persist:aios-home` Session

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `Index.tsx` | Portal 页面组件（WebContentsHost layer `portal`） |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.shellView.*`（ShellView 生命周期 / metadata） |
| Preload | `window.desktopAuth.*`（Token 用于注入） |

## 6. 状态流

```text
WorkspaceRenderer 渲染 Portal
  → Index.tsx → WebContentsHost(layer="portal")
  → ShellViewManager 创建/加载 → deactivate（延迟显示）
  → MainTopBar 切换到 portal tab → setBounds("portal") → activate
  → Token 注入到 persist:aios-home Session
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- Portal View 默认 deactivate，仅 setBounds 时显示
- Token 仅注入到 `persist:aios-home` 分区

> **状态**：retained — 当前 registry 注释，WorkspaceRenderer 保留分支，非主链路入口。

## 8. 相关文档

- `docs/API_CONTRACTS.md` § ShellView / Auth
- `docs/renderer/WORKSPACE_ROUTING.md`
