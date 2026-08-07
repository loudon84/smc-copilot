# Office

## 1. 路径

```text
src/renderer/src/screens/Office/
```

## 2. 入口

由 `WorkspaceRenderer` 根据 registry `office`（kind `react`）渲染。

## 3. 职责

- Office 视图页面
- Claw3D 可视化（`main/claw3d.ts`）
- KeepAlive 保持页面状态

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `Office.tsx` | Office 页面组件（KeepAlive） |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.hermesAPI.*`（Claw3D 相关） |

## 6. 状态流

```text
WorkspaceRenderer 渲染 Office
  → Office.tsx（KeepAlive）
  → Claw3D 可视化内容
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload

> **状态**：retained — 当前 registry 注释，WorkspaceRenderer 保留分支，非主链路入口。

## 8. 相关文档

- `docs/API_CONTRACTS.md`
- `docs/renderer/WORKSPACE_ROUTING.md`
