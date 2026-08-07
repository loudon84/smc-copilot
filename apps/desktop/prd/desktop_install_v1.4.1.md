# P0 修复：Hermes Desktop 打包后必须显示最大化 / 最小化 / 关闭按钮

## 1. 结论

当前问题属于 **Electron 窗口标题栏能力缺失**。

如果主窗口使用了：

```ts
frame: false
```

或：

```ts
titleBarStyle: 'hidden'
```

Windows 打包后不会自动显示系统原生的：

```text
最小化 / 最大化 / 关闭
```

因此必须补上 **Renderer 自定义 WindowControls + Main IPC 窗口控制能力**。

不建议把最终方案改成：

```ts
frame: true
```

原因：

```text
1. 会破坏现有 DesktopShell / Header / 顶部拖拽区域设计
2. 后续 Sidebar + PageHeader + ModalLayer 的桌面壳不统一
3. Web Operator / Runtime 页面需要统一顶栏
```

---

# 2. 必须新增的能力

## 2.1 Main Process IPC

新增文件：

```text
src/main/window/window-ipc.ts
```

内容：

```ts
import { BrowserWindow, ipcMain } from 'electron'

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

export function registerWindowIpc(): void {
  ipcMain.handle('window:minimize', () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    win.minimize()
  })

  ipcMain.handle('window:maximize-or-restore', () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return

    if (win.isMaximized()) {
      win.unmaximize()
      return
    }

    win.maximize()
  })

  ipcMain.handle('window:close', () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    win.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return false
    return win.isMaximized()
  })
}
```

---

## 2.2 Main 注册 IPC

修改：

```text
src/main/index.ts
```

加入：

```ts
import { registerWindowIpc } from './window/window-ipc'
```

在 app ready / IPC 初始化位置注册：

```ts
registerWindowIpc()
```

要求：

```text
1. 只注册一次
2. 不放到 Renderer
3. 不使用 remote
4. 不暴露 BrowserWindow 给 Renderer
```

---

# 3. Preload API

修改：

```text
src/preload/index.ts
```

在 `contextBridge.exposeInMainWorld(...)` 中增加：

```ts
windowControls: {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeOrRestore: () => ipcRenderer.invoke('window:maximize-or-restore'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized')
}
```

如果当前项目统一使用 `window.hermesAPI`，则放入：

```ts
window.hermesAPI.windowControls
```

推荐结构：

```ts
windowControls: {
  minimize(): Promise<void>
  maximizeOrRestore(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
}
```

---

# 4. 类型声明

修改：

```text
src/preload/index.d.ts
```

补充：

```ts
interface WindowControlsAPI {
  minimize(): Promise<void>
  maximizeOrRestore(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
}

interface HermesAPI {
  windowControls: WindowControlsAPI
}
```

如果项目当前是：

```ts
declare global {
  interface Window {
    hermesAPI: HermesAPI
  }
}
```

则追加到现有 `HermesAPI` 中，不新建全局命名。

---

# 5. Renderer 组件

新增：

```text
src/renderer/src/components/layout/WindowControls.tsx
```

内容：

```tsx
import { useEffect, useState } from 'react'

export function WindowControls(): JSX.Element | null {
  const [isMaximized, setIsMaximized] = useState(false)

  const isMac = navigator.platform.toLowerCase().includes('mac')

  useEffect(() => {
    if (isMac) return

    window.hermesAPI.windowControls
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => setIsMaximized(false))
  }, [isMac])

  if (isMac) {
    return null
  }

  return (
    <div className="window-controls no-drag">
      <button
        type="button"
        className="window-control-button"
        aria-label="Minimize"
        onClick={() => window.hermesAPI.windowControls.minimize()}
      >
        —
      </button>

      <button
        type="button"
        className="window-control-button"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={async () => {
          await window.hermesAPI.windowControls.maximizeOrRestore()
          const next = await window.hermesAPI.windowControls.isMaximized()
          setIsMaximized(next)
        }}
      >
        {isMaximized ? '❐' : '□'}
      </button>

      <button
        type="button"
        className="window-control-button window-control-button--close"
        aria-label="Close"
        onClick={() => window.hermesAPI.windowControls.close()}
      >
        ×
      </button>
    </div>
  )
}
```

---

# 6. CSS

修改：

```text
src/renderer/src/assets/main.css
```

增加：

```css
.app-drag-region {
  -webkit-app-region: drag;
}

.no-drag,
.no-drag * {
  -webkit-app-region: no-drag;
}

.window-controls {
  height: 36px;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  flex-shrink: 0;
}

.window-control-button {
  width: 46px;
  height: 36px;
  border: 0;
  background: transparent;
  color: var(--color-text-primary, #e5e7eb);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.window-control-button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.window-control-button--close:hover {
  background: #c42b1c;
  color: #ffffff;
}
```

---

# 7. 接入 PageHeader / Layout

如果已经有 `PageHeader.tsx`，直接放到右侧：

```tsx
import { WindowControls } from './WindowControls'

export function PageHeader(): JSX.Element {
  return (
    <header className="page-header app-drag-region">
      <div className="page-header__left no-drag">
        {/* title / profile / status */}
      </div>

      <div className="page-header__right no-drag">
        {/* actions */}
        <WindowControls />
      </div>
    </header>
  )
}
```

如果还没有 `PageHeader.tsx`，先在当前 `Layout.tsx` 顶部主区域加入：

```tsx
<div className="layout-titlebar app-drag-region">
  <div className="layout-titlebar__left no-drag">
    Hermes Desktop
  </div>

  <WindowControls />
</div>
```

对应 CSS：

```css
.layout-titlebar {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.layout-titlebar__left {
  padding-left: 12px;
  font-size: 13px;
  color: var(--color-text-secondary, #9ca3af);
}
```

---

# 8. BrowserWindow 配置检查

检查主窗口创建位置，确保保留 frameless 时有自定义按钮：

```ts
new BrowserWindow({
  frame: false,
  titleBarStyle: 'hidden',
  webPreferences: {
    preload,
    contextIsolation: true,
    nodeIntegration: false
  }
})
```

如果当前没有顶部按钮，则必须接入 `WindowControls`。

临时救火方案可以改成：

```ts
frame: true
```

但这只作为临时验证，不作为 v1.3.1 正式方案。

---

# 9. Cursor 执行稿

```md
# Cursor Plan: P0 WindowControls 修复

目标：
Hermes Desktop 打包后必须显示顶部最大化、最小化、关闭按钮。

现象：
Windows 打包后顶部窗口控制按钮缺失。

原因：
Electron BrowserWindow 使用 frameless / hidden titlebar 后，系统不会自动显示原生窗口控制按钮。

实施方案：
新增自定义 WindowControls，并通过 preload IPC 调用 Main Process 控制 BrowserWindow。

硬约束：
- 不改 UI 技术栈。
- 不引入 MUI/Mantine。
- Renderer 不允许 import electron。
- Renderer 只能通过 preload API 调用窗口控制。
- 不破坏现有 Layout / RuntimeSetup / WebOperator / ProfileRuntime。
- macOS 不显示自定义按钮。
- Windows/Linux 显示自定义按钮。

文件变更：

1. 新增：
src/main/window/window-ipc.ts

实现：
- window:minimize
- window:maximize-or-restore
- window:close
- window:is-maximized

2. 修改：
src/main/index.ts

实现：
- import registerWindowIpc
- 在 IPC 初始化阶段调用 registerWindowIpc()

3. 修改：
src/preload/index.ts

实现：
- 暴露 window.hermesAPI.windowControls.minimize
- 暴露 window.hermesAPI.windowControls.maximizeOrRestore
- 暴露 window.hermesAPI.windowControls.close
- 暴露 window.hermesAPI.windowControls.isMaximized

4. 修改：
src/preload/index.d.ts

实现：
- 增加 WindowControlsAPI 类型
- 挂到 HermesAPI

5. 新增：
src/renderer/src/components/layout/WindowControls.tsx

实现：
- 最小化按钮
- 最大化/还原按钮
- 关闭按钮
- macOS return null
- Windows/Linux 显示

6. 修改：
src/renderer/src/screens/Layout/Layout.tsx
或
src/renderer/src/components/layout/PageHeader.tsx

实现：
- 顶栏右侧挂载 <WindowControls />

7. 修改：
src/renderer/src/assets/main.css

实现：
- .app-drag-region
- .no-drag
- .window-controls
- .window-control-button
- .window-control-button--close

验收标准：
1. pnpm typecheck 通过。
2. pnpm build 通过。
3. pnpm package:win 通过。
4. Windows 安装后顶部显示最小化、最大化、关闭。
5. 点击最小化，窗口进入任务栏。
6. 点击最大化，窗口最大化。
7. 再次点击最大化按钮，窗口还原。
8. 点击关闭，窗口关闭。
9. 顶部空白区域可拖动窗口。
10. 点击按钮不会触发拖动。
11. Renderer 无 electron import。
12. macOS 不显示 Windows 风格按钮。
```

---

# 10. 本次应作为 v1.3.1-hotfix

建议版本标记：

```text
v1.3.1-hotfix-window-controls
```

验收命令：

```bash
pnpm typecheck
pnpm build
pnpm package:win
```

Windows 打包后必须实测：

```text
安装包启动
主窗口顶部按钮显示
最小化
最大化
还原
关闭
拖拽窗口
```
