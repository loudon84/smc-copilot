# Shell Agent Spec（Renderer Shell Components）

## 1. 文档目标

本规格用于描述 `src/renderer/src/components/shell` 目录的代码结构、组件职责、与主进程 Shell View 系统的交互契约，供 AI Agent 在以下场景中执行一致实现：

- 嵌入外部 Web 内容（BrowserView/WebContentsView）到 Renderer UI
- 管理 Shell View 的生命周期（创建、定位、显示、隐藏、销毁）
- 响应式同步 Renderer 容器 bounds 与主进程 BrowserView 位置
- 处理 View 加载失败与重试机制

---

## 2. 范围与非范围

### 2.1 In Scope

- `WebContentsHost.tsx`：Shell View 的 Renderer 宿主组件
- `window.shellView` API 的使用方式（activate/setBounds/hide）
- ResizeObserver + window resize 事件驱动的 bounds 同步机制
- 错误状态处理（加载失败 UI + 重试）

### 2.2 Out of Scope

- 主进程 Shell View Manager 的具体实现（BrowserView 创建、生命周期管理）
- IPC handler 的注册与实现细节（仅描述调用契约）
- 其他 shell 相关组件（当前目录仅含 WebContentsHost）

---

## 3. 代码地图（Code Map）

### 3.1 Renderer 组件

- `src/renderer/src/components/shell/WebContentsHost.tsx`
  - 作为 Shell View 的 Renderer 侧宿主容器
  - 通过 `window.shellView` API 与主进程通信

### 3.2 Preload API

- `src/preload/shell-view-api.ts`
  - `shellViewApi` 实现，封装 IPC 调用
- `src/preload/index.ts`
  - 通过 `contextBridge.exposeInMainWorld("shellView", shellViewApi)` 暴露
- `src/preload/index.d.ts`
  - `ShellViewAPI` 接口声明

### 3.3 共享契约

- `src/shared/shell/view-contract.ts`
  - 核心类型：`ShellViewKind`, `ShellViewLayer`, `ShellViewState`, `ShellViewBounds`, `ShellViewLayout`
- `src/shared/shell/shell-view-contract.ts`
  - IPC Channels：`shell:view:activate`, `shell:view:set-bounds`, `shell:view:hide`
  - Request/Response 类型定义

---

## 4. 架构总览

```
Renderer (React)
  WebContentsHost (div ref)
    ├─ ResizeObserver ──→ readBounds()
    ├─ window resize ────→ debouncedSync()
    └─ window.shellView.setBounds(layerId, bounds) ──→ Main (BrowserView 定位)

Main (Electron)
  BrowserView/WebContentsView
    ├─ 创建/销毁管理
    ├─ 根据 Renderer 传来的 bounds 设置位置和大小
    └─ hide() 时移出可视区域或隐藏
```

**核心机制**：

- Renderer 负责测量 DOM 容器的位置和尺寸
- 通过 IPC 将 bounds 同步到主进程
- 主进程根据 bounds 更新 BrowserView 的位置，实现"嵌入"效果

---

## 5. 组件规格（Component Spec）

## 5.1 WebContentsHost

### 职责

- 作为 Shell View 在 Renderer 中的宿主容器
- 实时同步容器 bounds 到主进程的 BrowserView
- 处理 View 的显示/隐藏状态转换
- 提供错误状态 UI 和重试机制

### Props

- `layerId: string`（必需）
  - 标识对应的 Shell View Layer，用于 IPC 调用
- `className?: string`
  - 可选的 CSS 类名，默认使用 `"h-full w-full min-h-0"`

### 状态管理

- `error: boolean`
  - 当 `window.shellView.setBounds` 抛出异常时设为 true
  - 显示错误 UI 和重试按钮
- `hiddenRef: boolean`（useRef）
  - 跟踪当前 View 是否处于隐藏状态，避免重复调用 hide

### 核心方法

#### readBounds()

- 读取容器 DOM 的 `getBoundingClientRect()`
- 返回 `{ x, y, width, height }`（均为整数，四舍五入）
- 若容器不存在返回 `null`

#### syncBounds()

- 调用 `readBounds()` 获取当前 bounds
- **边界处理**：
  - 若 bounds 无效（width < 1 或 height < 1）且未隐藏，则调用 `window.shellView.hide(layerId)`
  - 若 bounds 有效，调用 `window.shellView.setBounds(layerId, bounds)`
- 成功时清除 error 状态，失败时设置 error 状态

### 生命周期

#### Mount

- 立即执行一次 `syncBounds()`
- 创建 ResizeObserver 监听容器尺寸变化
- 监听 `window.resize` 事件

#### Update

- 当 `layerId` 变化时，effect 重新执行
- 清理旧的监听器，为新的 layerId 建立监听

#### Resize 处理

- ResizeObserver 触发 → `debouncedSync()`（16ms 防抖）
- window resize 事件 → `debouncedSync()`

#### Unmount

- 设置 `disposed = true` 防止竞态
- 断开 ResizeObserver
- 移除 window resize 监听器
- 调用 `window.shellView.hide(layerId)`

### 错误处理

当 `error === true` 时渲染：

- 错误提示：`t("viewLoadFailed")`
- 重试按钮：点击后清除 error 并重新调用 `syncBounds()`

---

## 6. 外部契约（Preload API Contract）

Renderer 通过 `window.shellView` 与主进程交互：

### ShellViewAPI 接口

```typescript
interface ShellViewAPI {
  activate: (layerId: string) => Promise<void>;
  setBounds: (layerId: string, bounds: ShellViewBoundsIPC) => Promise<void>;
  hide: (layerId: string) => Promise<void>;
}
```

### IPC Channels

| Channel | Direction | 用途 |
|---------|-----------|------|
| `shell:view:activate` | Renderer → Main | 激活指定 layer 的 view |
| `shell:view:set-bounds` | Renderer → Main | 更新 view 的位置和尺寸 |
| `shell:view:hide` | Renderer → Main | 隐藏 view |

### 类型定义

- `ShellViewBoundsIPC: { x: number; y: number; width: number; height: number }`

---

## 7. 数据流（Data Flow Spec）

```
WebContentsHost Mount
  ├─→ syncBounds()
  │    ├─→ readBounds() → DOM rect
  │    └─→ window.shellView.setBounds(layerId, bounds)
  │         └─→ Main: 更新 BrowserView 位置
  ├─→ ResizeObserver.observe(container)
  │    └─→ on resize → debouncedSync()
  └─→ window.addEventListener("resize", debouncedSync)

Container Resized
  └─→ ResizeObserver callback
       └─→ debouncedSync()
            └─→ syncBounds()
                 └─→ setBounds/hide

Window Resized
  └─→ debouncedSync()
       └─→ syncBounds()

Unmount
  ├─→ observer.disconnect()
  ├─→ removeEventListener("resize")
  └─→ window.shellView.hide(layerId)
```

---

## 8. 扩展规范（Agent Execution Rules）

### 8.1 使用 WebContentsHost

- 必须提供有效的 `layerId`，对应主进程已创建的 Shell View
- 容器需要有明确的尺寸（父级需设置 flex/height/width）
- 避免在隐藏状态下持续调用 setBounds（已用 hiddenRef 优化）

### 8.2 新增 Shell View 类型

如需支持新的 View 类型：

1. `src/shared/shell/view-contract.ts`
   - 在 `ShellViewKind` 中添加新类型
2. 主进程实现对应的 View 创建逻辑
3. Renderer 使用 `WebContentsHost` 嵌入，传入对应的 `layerId`

### 8.3 修改 IPC 契约

如需新增 IPC 方法：

1. `src/shared/shell/shell-view-contract.ts`
   - 添加新的 Channel 常量
   - 添加 Request/Response 类型
2. `src/preload/shell-view-api.ts`
   - 实现 IPC 调用封装
3. `src/preload/index.d.ts`
   - 更新 `ShellViewAPI` 接口
4. 主进程实现对应的 IPC handler

---

## 9. 安全与性能

### 9.1 安全约束

- `window.shellView` 仅暴露有限的控制接口（activate/setBounds/hide）
- 不暴露 BrowserView 的 WebContents 直接操作
- 所有 bounds 数据经过整数化处理，避免浮点精度问题

### 9.2 性能优化

- 使用 16ms 防抖（约 60fps）处理 resize 事件，避免频繁 IPC
- 使用 `hiddenRef` 避免重复调用 hide
- ResizeObserver 仅在容器元素存在时创建
- 组件 unmount 时彻底清理监听器和定时器

---

## 10. 验收清单（Acceptance Checklist）

- [ ] WebContentsHost 能正确渲染为全屏容器
- [ ] Mount 时立即同步 bounds 到主进程
- [ ] 容器尺寸变化时触发 debouncedSync（16ms 防抖）
- [ ] 窗口 resize 时触发同步
- [ ] 容器尺寸无效（< 1px）时自动调用 hide
- [ ] 尺寸恢复有效时自动显示
- [ ] IPC 调用失败时显示错误 UI 和重试按钮
- [ ] Unmount 时正确清理监听器并调用 hide
- [ ] layerId 变化时重新建立监听

---

## 11. 快速参考（For Agent）

### 关键文件

- `src/renderer/src/components/shell/WebContentsHost.tsx`
- `src/preload/shell-view-api.ts`
- `src/preload/index.d.ts`（ShellViewAPI 接口）
- `src/shared/shell/view-contract.ts`
- `src/shared/shell/shell-view-contract.ts`

### 使用示例

```tsx
import { WebContentsHost } from "../components/shell/WebContentsHost";

function MyScreen() {
  return (
    <div className="flex h-full">
      <div className="w-64">Sidebar</div>
      <WebContentsHost layerId="my-view-layer" className="flex-1" />
    </div>
  );
}
```

### 注意事项

- 确保父容器有明确的尺寸，否则 bounds 可能为 0
- 不要直接调用 `window.shellView.activate()`，使用 `setBounds` 即可同时激活和定位
- 错误处理已内置，无需额外包裹 Error Boundary
