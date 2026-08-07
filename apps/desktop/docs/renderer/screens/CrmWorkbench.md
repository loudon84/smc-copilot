# CrmWorkbench

## 1. 路径

```text
src/renderer/src/screens/Crm/
```

## 2. 入口

由 `WorkspaceRenderer` 根据 registry `crm-workbench`（kind `react`）渲染。

## 3. 职责

- CRM 业务工作台界面
- 嵌入 WebOperator WebContentsView 运行 CRM 页面
- 通过 CRM Bridge Preload 建立受控双向通道
- 接收 CRM JSSDK 提交的 CrmBridgeEvent（用户手势 → Main 校验 → Renderer 聚焦/刷新）
- 向 CRM 页面发送 CrmDesktopCommand

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `CrmWorkbenchScreen.tsx` | 工作台主组件 |
| `CrmRoutePage.tsx` | CRM 路由页面（WebContentsView 宿主） |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.aiosBrowser.*`（WebContentsView 操作） |
| Preload | `window.shellView.*`（ShellView 生命周期） |

## 6. 状态流

```text
WorkspaceRenderer 渲染 CrmWorkbench
  → CrmRoutePage → WebContentsView（CRM 页面 + crm-bridge-preload）
  → CRM JSSDK → CrmBridgeEvent → Main 校验 → Renderer 聚焦/刷新
  → Renderer → CrmDesktopCommand → Main → WebContents → CRM JSSDK
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- CRM 事件必须经 Main 校验（origin / event type / payload size / requestId 去重）

## 8. 相关文档

- `docs/API_CONTRACTS.md` § CRM Desktop Bridge
- `docs/renderer/WORKSPACE_ROUTING.md`
