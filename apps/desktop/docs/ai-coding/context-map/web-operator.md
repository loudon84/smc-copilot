# Context Map — Web Operator

## 职责

桌面受控浏览器：ShellView `web-operator` layer、DOM 快照、结构化动作、CRM/Host Bridge。

## 入口

| 层 | 路径 |
|----|------|
| Screen | `src/renderer/src/screens/WebOperator/WebOperatorScreen.tsx` |
| 工具栏 | `BrowserToolbar` |
| Main | `src/main/browser/browser-controller.ts` |
| Adapter | `src/main/shell/shell-browser-view-adapter.ts` |
| Preload | `src/preload/browser-api.ts` → `window.aiosBrowser` |

## 分区

`src/shared/shell/browser-partitions.ts`：

- `web-operator` → `persist:web-operator`
- `external-browser:{uuid}` → 独立 partition

## V5.7+ 能力

- Frame tree、DOM snapshot、iframe 定位
- `src/main/browser/browser-v57-core.ts`
- 契约：`docs/API_CONTRACTS.md` § Web Operator

## CRM / Host Bridge

- Main：`src/main/crm-bridge/`、`src/main/crm-bridge/host-*`
- SDK：`resources/crm-bridge/`、`resources/crm-bridge/hermes-crm-bridge-sdk.js`
- Hermes 任务会话：`webOperatorTaskSession` IPC
- PRD：`prd/v5.7.*`、`prd/v6.0_hostBridge-JSSDK.md`

## 延伸阅读

- `docs/renderer/screens/web-operator/`
- `AGENTS.md` § Web Operator / CRM Desktop Bridge

## 注意

阻塞型 Overlay 打开时会 hide WebContentsView（`components/overlay/`）。
