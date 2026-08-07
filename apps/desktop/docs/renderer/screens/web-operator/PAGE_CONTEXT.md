# WebOperator Page Context

> WebOperatorPageContext（全局共享状态）+ derive-page-url.ts（稳定 URL 派生）

## 1. WebOperatorPageContext

### 1.1 架构

```
WebOperatorPageContextProvider（顶层）
  ├─ WebOperatorPageContextReact（React Context）
  ├─ WebOperatorScreenInner（消费 context）
  └─ WebOperatorTaskStartDialogHost（消费 context）
```

### 1.2 Context 单例防 HMR

**文件**：`context/web-operator-page-context-instance.ts`

React `createContext()` 在 Vite HMR 时会创建新实例，导致 Provider 与 Consumer 不匹配。解决方案：

```ts
const GLOBAL_KEY = "__smcWebOperatorPageContext__";
function getContext(): Context<WebOperatorPageContextValue | null> {
  const g = globalThis as GlobalWithContext;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createContext<WebOperatorPageContextValue | null>(null);
  }
  return g[GLOBAL_KEY];
}
```

将 Context 实例挂在 `globalThis` 上，HMR 时复用同一实例。

### 1.3 状态字段

| 字段 | 类型 | 设置者 | 消费者 |
|---|---|---|---|
| `pageContext` | `HermesPanelPageContext \| null` | `PageFrameHtmlInspector`（setPageContext） | `HermesTaskPanel`、`WebOperatorHermesChatPanel` |
| `pageUrl` | `string \| null` | `requestHermesAnalysis` 内部 | （预留） |
| `analysisRequest` | `WebOperatorHermesAnalysisRequest \| null` | `PageFrameHtmlInspector`（requestHermesAnalysis） | `HermesTaskPanel`、`WebOperatorTaskStartDialogHost` |
| `taskStartDialog` | `WebOperatorTaskStartDialogState \| null` | `HermesTaskPanel`（openStartDialog/closeStartDialog） | `WebOperatorTaskStartDialogHost`、`WebOperatorScreenInner` |
| `taskStartDialogHandlers` | `WebOperatorTaskStartDialogHandlers \| null` | `HermesTaskPanel` | `WebOperatorTaskStartDialogHost` |

### 1.4 关键方法

#### `requestHermesAnalysis({ pageUrl, pageContext })`

1. 设置 `pageContext` 和 `pageUrl`
2. 生成 `analysisRequest`（包含 `requestId: "wo-analysis-{ts}-{rand}"`、`createdAt`）
3. HermesTaskPanel 监听 `analysisRequest.requestId` 变化触发 resolve 流

#### `setPageContext(ctx)`

由 `PageFrameHtmlInspector` 在 "Get HTML" 成功后调用，将 `HermesPanelPageContext` 存入 context，供后续 "分析内容" 使用。

### 1.5 类型定义

**文件**：`context/web-operator-page-context-types.ts`

```ts
WebOperatorHermesAnalysisRequest = {
  requestId: string;
  pageUrl: string;
  pageContext: HermesPanelPageContext;
  createdAt: string;
}

WebOperatorTaskStartDialogState = {
  requestId: string;
  taskId: string;
  pageUrl: string;
  pageContext: HermesPanelPageContext;
}

WebOperatorTaskStartDialogHandlers = {
  onConfirm: (input: { userPrompt: string; skill: string }) => void;
  onCancel: () => void;
}
```

## 2. derive-page-url.ts

**文件**：`utils/derive-page-url.ts`

### 2.1 问题

iframe 的 `url` 常为 `about:srcdoc` 或 `about:blank`，不能作为任务会话的稳定标识。同一 `about:srcdoc` iframe 在不同页面加载后 URL 完全相同，无法区分。

### 2.2 策略

`derivePageUrl({ frame, frames, result })` 按以下优先级派生稳定 URL：

1. **frame 自身 URL 可用**（非 `about:blank`/`about:srcdoc`）→ 返回 `origin + pathname + search`
2. **父 frame URL 可用** → 取父 frame URL + 追加 `#framePath=...&frameTitle=...` hash fragment
3. **result.url 可用** → 直接使用
4. **兜底** → `unknown://web-operator-frame/{frameId}`

### 2.3 父 frame 查找

`findParentFrame(frame, frames)` 遍历所有 frame，找 `candidate.path` 是 `frame.path` 前缀（长度差 1，逐位相等）的 frame。

### 2.4 hash fragment 格式

```
{parentUrl}#framePath=0.1&frameTitle=iframeName
```

`framePath` 为 frame.path 数组 join(".")，`frameTitle` 为 title 或 name。

### 2.5 使用场景

- `PageFrameHtmlInspector.runAnalyze()` 中调用，作为 `requestHermesAnalysis({ pageUrl })` 的入参
- `HermesTaskPanel` 用 `pageUrl` 调用 `webOperatorTaskSession.resolve({ pageUrl })` 查找已有任务
- `buildPageContextFromFrameHtml()` 中 `buildScopeKey(url, frameId)` 用 URL + frameId 构建会话持久化 key
