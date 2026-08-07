# Welcome

## 1. 路径

```text
src/renderer/src/screens/Welcome/
```

## 2. 入口

由 `App.tsx` 在启动门控 `screen === "welcome"` 时渲染。

## 3. 职责

- 首次使用欢迎页
- 引导用户选择安装模式（本地 / 远程 / SSH）
- 可跳转到 Install 向导或直接进入 Setup

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `Welcome.tsx` | 欢迎页主组件 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.hermesAPI.getConnectionMode()` |
| Preload | `window.smcShell.resolveStartupDecision()` |

## 6. 状态流

```text
用户选择安装模式
  → hermesAPI.setConnectionMode()
  → recheck → 路由切换（install / setup / main）
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Hermes
- `docs/renderer/WORKSPACE_ROUTING.md`
