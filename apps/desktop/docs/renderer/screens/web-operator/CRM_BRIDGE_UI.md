# CRM Bridge UI (Renderer 侧)

> CrmEventPanel + CRM Desktop Bridge Renderer 侧边界

## 1. CrmEventPanel

**文件**：`src/renderer/src/screens/WebOperator/CrmEventPanel.tsx`

### 1.1 职责

CRM 桥事件面板，展示最近一次 CRM Desktop Bridge 事件，并提供向 CRM 页面下发命令的能力。

### 1.2 数据来源

| Hook | API | 说明 |
|---|---|---|
| `useCrmBridgeEvents()` | `window.aiosBrowser.onCrmEvent` | 订阅 CRM → Desktop 方向事件（Main 转发） |

Hook 返回：
- `lastEvent`：最近一次 `CrmBridgeEvent`（type、origin、page、payload）
- `error`：订阅错误
- `refresh()`：手动刷新

### 1.3 UI 结构

```
CrmEventPanel
  ├─ Header: "CRM Context" + Refresh + Copy + Send 按钮
  ├─ CRM 调试区（V5.7.6）
  │   ├─ actionKey / selector / jsonSchema / jsonPayload / targetUrl 输入
  │   ├─ 测试点击按钮 / 测试推送 JSON / 测试运行动作
  │   ├─ open_form_with_json 手工 payload（复制给 Hermes）
  │   └─ Command result 展示
  ├─ 事件摘要
  │   ├─ type 标签（sky）
  │   ├─ origin
  │   ├─ entityType / entityId / entityName
  │   └─ page URL
  ├─ [Refresh snapshot] 按钮 → onRefreshSnapshot()
  └─ Raw JSON（pre）
```

### 1.4 操作

| 按钮 | 行为 |
|---|---|
| **Refresh** | 调用 `refresh()` 重新获取最近事件 |
| **Copy** | `navigator.clipboard.writeText(JSON.stringify(lastEvent))` |
| **Send command** | 构造 `CrmDesktopCommand`（type: `"desktop.crm.showToast"`）→ `window.aiosBrowser.sendCrmCommand(command)` |
| **测试点击按钮** | `desktop.crm.clickButton`（expectAck: true） |
| **测试推送 JSON** | `desktop.crm.pushJson`（expectAck: true） |
| **测试运行动作** | `desktop.crm.runAction`（expectAck: true） |
| **Refresh snapshot** | 调用 `onRefreshSnapshot`（透传自 WebOperatorPanels → PageStructurePanel 刷新 snapshot） |

### 1.5 CrmDesktopCommand 构造

```ts
const command: CrmDesktopCommand = {
  commandId: `cmd_${Date.now()}`,
  type: "desktop.crm.showToast",
  payload: { message: `Desktop received ${lastEvent.type}` },
  createdAt: new Date().toISOString(),
};
```

## 2. CRM Desktop Bridge Renderer 侧边界

### 2.1 双向通道

```
CRM 页面 (WebContentsView)
  │
  ├─ CRM → Desktop（CrmBridgeEvent）
  │    preload/crm-bridge-preload.ts → ipcRenderer → Main crm-bridge/
  │    → Main 校验 → mainWindow.send("crm-bridge:event") → Renderer aiosBrowser.onCrmEvent
  │
  └─ Desktop → CRM（CrmDesktopCommand）
       Renderer aiosBrowser.sendCrmCommand()
       → ipcRenderer.invoke → Main crm-bridge/
       → Main 转发到 WebOperator WebContents → preload postMessage → CRM JSSDK
```

### 2.2 Renderer 侧职责

| 职责 | 实现方 |
|---|---|
| 展示 CRM 事件 | `CrmEventPanel` + `useCrmBridgeEvents` |
| 下发 Desktop 命令 | `CrmEventPanel` → `aiosBrowser.sendCrmCommand` |
| 触发 snapshot 刷新 | `CrmEventPanel` → `onRefreshSnapshot` → `BrowserToolbar` → `aiosBrowser.snapshot` |

### 2.3 Main 侧职责（Renderer 不处理）

| 职责 | Main 模块 |
|---|---|
| 校验 origin 白名单 | `src/main/crm-bridge/crm-bridge-validator.ts` |
| 校验 event type 合法性 | 同上 |
| 校验 payload size 上限 | 同上 |
| requestId 去重 | 同上 |
| 用户手势校验（preload 侧） | `src/preload/crm-bridge-preload.ts` |
| 转发命令到 WebContents | `src/main/crm-bridge/crm-bridge-command-sender.ts` |

### 2.4 Preload API

| API | 方向 | IPC channel |
|---|---|---|
| `window.aiosBrowser.onCrmEvent` | Main → Renderer（事件订阅） | `crm-bridge:event`（Main send） |
| `window.aiosBrowser.sendCrmCommand` | Renderer → Main → WebContents | `crm-bridge:send-command`（ipcMain.handle） |

### 2.5 共享类型

- `CrmBridgeEvent`：`src/shared/crm-bridge/crm-bridge-contract.ts`
- `CrmDesktopCommand`：同上

### 2.6 配置

CRM Bridge 行为由 `resources/crm-bridge/crm-bridge.config.json` 控制（打包后位于 `process.resourcesPath`）。Renderer 侧不读取此配置文件。
