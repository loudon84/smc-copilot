# Layout

## 1. 路径

```text
src/renderer/src/screens/Layout/
```

## 2. 入口

由 `App.tsx` 在 `screen === "main"` 时渲染，作为主界面壳层。

## 3. 职责

- 主界面壳层，编排 MainPage、StatusBar、ModalLayer、DrawerLayer
- 管理 SettingsDrawer 打开/关闭状态
- 提供 `openSettingsDrawer(panel?)` 上下文方法
- 编排 WorkspaceOutlet 与各 Screen 路由

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `Layout.tsx` | 主界面壳层组件 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Context | `SettingsDrawerContext`（open/close） |
| Preload | `window.mainPageState.*`（持久化状态） |

## 6. 状态流

```text
App.tsx screen=main
  → Layout 渲染
  → MainPage（数据 props）
  → SettingsDrawer（drawer layer）
  → StatusBar
  → ModalLayer
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- 不修改 WorkspaceOutlet 路由规则

## 8. 相关文档

- `docs/API_CONTRACTS.md` § MainPage State
- `docs/renderer/WORKSPACE_ROUTING.md`
