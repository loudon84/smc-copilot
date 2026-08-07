# TaskWorkbench

## 1. 路径

```text
src/renderer/src/screens/TaskWorkbench/
```

## 2. 入口

由 `WorkspaceRenderer` 根据 registry `task-workbench`（kind `react`）渲染。

## 3. 职责

- V1.3 本地任务三栏工作台
- 展示本地任务列表、任务详情、执行结果
- 直调 copilot-serve API（不经过 backend）

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `TaskWorkbenchScreen.tsx` | 任务工作台主组件 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.copilotServe.*`（任务连接 / 生命周期） |

## 6. 状态流

```text
WorkspaceRenderer 渲染 TaskWorkbench
  → TaskWorkbenchScreen
  → copilotServe.getConnection() → 任务列表/详情/执行
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload

> **状态**：retained — 当前 registry 注释，WorkspaceRenderer 保留分支，非主链路入口。

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Copilot Serve
- `docs/renderer/WORKSPACE_ROUTING.md`
