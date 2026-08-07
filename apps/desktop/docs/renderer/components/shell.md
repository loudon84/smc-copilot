# Shell 组件族

> `src/renderer/src/components/shell/`

ShellView / WebContentsView 适配层，负责将 React DOM 位置映射到 Electron 原生 WebContentsView 的 bounds。

## WebContentsHost

**文件**：`WebContentsHost.tsx`

核心适配组件：在 React DOM 中占据一个锚点 `<div>`，通过 `ResizeObserver` + `IntersectionObserver` + `window.resize` 事件持续同步 bounds 到主进程 `window.shellView.setBounds(layerId, bounds)`。

### Props

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `layerId` | `string` | — | ShellView 层 ID（如 `"portal"` / `"web-operator"` / `"external-browser:uuid"`） |
| `className` | `string?` | `"relative flex min-h-0 w-full flex-1 overflow-hidden"` | 容器 className |
| `enabled` | `boolean?` | `true` | `false` 时调用 `shellView.hide()` 并跳过 setBounds（KeepAlive / Tab 切换） |
| — | — | — | **V5.7.8**：读取 `useNativeShellLayerGate().nativeBlocked`，`effectiveEnabled = enabled && !nativeBlocked`；阻塞型 Overlay 打开时自动 hide，关闭后 `syncBoundsWithRetry` 恢复（不 reload） |

### 工作机制

1. **初始定位**：`useLayoutEffect` 中 `syncBoundsWithRetry`，最多重试 8 帧 + 3 次 setTimeout（100/300/600ms）
2. **持续同步**：`ResizeObserver` 监听锚点尺寸变化，16ms 防抖后 `syncBoundsWithRetry`
3. **可见性**：`IntersectionObserver` 检测锚点是否在视口内，不可见时自动 `hideLayer`
4. **卸载**：cleanup 中 `shellView.hide(layerId)`，`hiddenRef` 置 `true`
5. **错误**：API 调用失败时显示红色错误提示 + 重试按钮

## web-contents-host-bounds.ts

**文件**：`web-contents-host-bounds.ts`

bounds 计算工具：

### `getMainPageWorkspaceBottom(): number`

返回 MainPage 工作区底部边界（`.MainPage__status` 元素的 `top`，即状态栏上沿），用于在 flex 布局 under-report 时扩展 WebContentsView 高度。

### `resolveWebContentsHostBounds(anchorRect, workspaceBottomPx): ShellHostBounds | null`

将锚点 `DOMRect` 映射为 `ShellHostBounds { x, y, width, height }`。当 flex 容器高度不足时，以 `workspaceBottomPx - y` 扩展 height。宽度 < 1 或高度 < 1 时返回 `null`（不显示）。
