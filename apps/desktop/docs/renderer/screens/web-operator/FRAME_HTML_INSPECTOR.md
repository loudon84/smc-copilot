# Frame HTML Inspector

> PageStructurePanel / FrameTreePanel / ElementListPanel / ScreenshotPanel / PageFrameHtmlInspector

## 1. PageStructurePanel

**文件**：`src/renderer/src/screens/WebOperator/PageStructurePanel.tsx`

### 1.1 组件树

```
PageStructurePanel
  ├─ Header: "Page Structure" + Refresh Snapshot 按钮
  ├─ FrameTreePanel
  ├─ PageSelectorActionBar
  ├─ PageFrameHtmlInspector
  └─ ElementListPanel
```

### 1.2 数据来源

- `usePageSnapshot()` → `window.aiosBrowser.snapshot({ includeFrames, includeInteractiveElements })`
  - 返回 `BrowserSnapshot`：frames（`BrowserFrameSnapshot[]`）+ elements（`BrowserElementSnapshot[]`）+ errors
  - 维护 `selectedFrameId` + `filteredElements`（按 frame 过滤）
  - `refresh()` 重新获取

### 1.3 Props

| Prop | 类型 | 用途 |
|---|---|---|
| `externalRefreshTrigger` | `number` | 父组件（BrowserToolbar）触发刷新 |
| `onAnalyzeContent` | `() => void` | 切换到 hermes-task 面板 |

### 1.4 元素交互

- `handleTestClick(element)` → `aiosBrowser.clickElement({ elementId, selector, frame })`
- `handleTestType(element, text)` → `aiosBrowser.typeElement({ elementId, selector, placeholder, frame }, text, { clear: true })`

## 2. FrameTreePanel

**文件**：`src/renderer/src/screens/WebOperator/FrameTreePanel.tsx`

### 2.1 职责

展示 Frame Tree 层级结构，支持选中 frame。

### 2.2 Props

| Prop | 类型 | 用途 |
|---|---|---|
| `frames` | `BrowserFrameSnapshot[]` | 所有 frame 快照 |
| `selectedFrameId` | `string \| null` | 当前选中 frame |
| `onSelectFrame` | `(frameId: string) => void` | 选中回调 |
| `errors` | `{ frameId, message }[]` | frame snapshot 错误 |

### 2.3 数据结构

`BrowserFrameSnapshot` 包含：
- `frameId`、`url`、`title`、`name`、`origin`
- `path: number[]` — frame 在树中的路径索引（如 `[0, 1]` 表示第一个 frame 的第二个子 frame）
- `sameOriginWithParent`
- `childFrameCount`

## 3. ElementListPanel

**文件**：`src/renderer/src/screens/WebOperator/ElementListPanel.tsx`

### 3.1 职责

展示当前选中 frame 的交互元素列表，支持 click/type 测试。

### 3.2 Props

| Prop | 类型 | 用途 |
|---|---|---|
| `elements` | `BrowserElementSnapshot[]` | 交互元素列表 |
| `onTestClick` | `(element) => void` | 点击测试 |
| `onTestType` | `(element, text) => void` | 输入测试 |

### 3.3 元素属性

`BrowserElementSnapshot`：elementId、tagName、selector、text、placeholder、type、frameId、name、id。

## 4. ScreenshotPanel

**文件**：`src/renderer/src/screens/WebOperator/ScreenshotPanel.tsx`

### 4.1 职责

页面截图面板（V5.7 遗留，当前已合并到 BrowserStatePanel）。

`normalizeWebOperatorPanelId("screenshot")` 返回 `"browser-state"`，旧 screenshot 入口自动重定向到 browser-state 面板。

## 5. PageFrameHtmlInspector

**文件**：`src/renderer/src/screens/WebOperator/panels/PageFrameHtmlInspector.tsx`

### 5.1 职责

获取并展示选中 frame 的 HTML，构建 `HermesPanelPageContext`，发起 Hermes 分析任务。

### 5.2 Props

| Prop | 类型 | 用途 |
|---|---|---|
| `selectedFrameId` | `string \| null` | 当前选中 frame |
| `frames` | `BrowserFrameSnapshot[]` | 所有 frame（用于 derivePageUrl） |
| `onAnalyzeContent` | `() => void` | 切换到 hermes-task 面板 |

### 5.3 UI 结构

```
PageFrameHtmlInspector
  ├─ Header: "Frame HTML" + [Get HTML] + [分析内容] 按钮
  ├─ Frame meta（JSON pre）：frameId/name/title/url/origin/path/sameOriginWithParent
  ├─ 参数行
  │   ├─ selector 输入（可选，空 = 整个 document）
  │   ├─ outer 复选框
  │   └─ maxLength 数字输入（1000–500000，默认 100000）
  └─ Result 区
      ├─ 状态：OK/ERROR + capturedAt + source + truncated
      ├─ [Copy] 按钮
      └─ HTML 内容（pre）或错误 JSON
```

### 5.4 核心操作

#### Get HTML（`run()`）

1. `fetchFrameHtml()` → `aiosBrowser.getFrameHtml({ frameId, selector, outer, maxLength })`
2. `applyPageContextFromResult(result)`：
   - `extractBodyInnerHtml(result.html)` — DOMParser 提取 `<body>` innerHTML，无 body 则返回原文
   - `derivePageUrl({ frame, frames, result })` — 生成稳定 pageUrl
   - `buildPageContextFromFrameHtml({ frame, result, htmlExcerpt, pageUrl })` — 构建 `HermesPanelPageContext`
   - `setPageContext(ctx)` — 写入 WebOperatorPageContext

#### 分析内容（`runAnalyze()`）

1. 若无已有 result 或 result 不 ok → 先 `fetchFrameHtml()`
2. 同 Get HTML 的 pageContext 构建流程
3. `onAnalyzeContent?.()` — 通知切换到 hermes-task 面板
4. `requestHermesAnalysis({ pageUrl, pageContext })` — 发起 Hermes 分析请求

### 5.5 extractBodyInnerHtml

`DOMParser` 解析 HTML 文档，取 `doc.body.innerHTML`。若文档无 `<body>` 标签或解析失败，回退正则 `/<body[^>]*>([\s\S]*?)<\/body>/i`。仍失败则返回原始 HTML。

## 6. PageSelectorActionBar

**文件**：`src/renderer/src/screens/WebOperator/panels/PageSelectorActionBar.tsx`

### 6.1 职责

CSS selector 即时测试工具条，支持 Find / Click / Type 操作。

### 6.2 UI 结构

```
PageSelectorActionBar
  ├─ Row 1: Search icon + selector input + [Find] + [Click] 按钮
  └─ Row 2: Keyboard icon + text input + clear 复选框 + [Type] 按钮
```

### 6.3 操作

| 按钮 | API | 参数 |
|---|---|---|
| Find | `aiosBrowser.findElement({ selector, frame })` | selector, selectedFrameId |
| Click | `aiosBrowser.clickElement({ selector, frame })` | selector, selectedFrameId |
| Type | `aiosBrowser.typeElement({ selector, frame }, text, { clear })` | selector, selectedFrameId, text, clearFirst |

## 7. 数据流总结

```
BrowserToolbar [Refresh Snapshot]
  → handleRefreshSnapshot()
  → aiosBrowser.snapshot({ includeFrames, includeInteractiveElements })
  → snapshotRefreshTrigger++
  → PageStructurePanel externalRefreshTrigger 变化
  → usePageSnapshot.refresh()

PageStructurePanel
  → usePageSnapshot() → aiosBrowser.snapshot() → frames + elements
  → FrameTreePanel 展示 + 选中
  → selectedFrameId 变化
  → PageFrameHtmlInspector / ElementListPanel 更新

PageFrameHtmlInspector [Get HTML]
  → aiosBrowser.getFrameHtml()
  → buildPageContextFromFrameHtml() → setPageContext()

PageFrameHtmlInspector [分析内容]
  → getFrameHtml() + derivePageUrl() + buildPageContextFromFrameHtml()
  → requestHermesAnalysis()
  → HermesTaskPanel resolve → Dialog/Chat
```
