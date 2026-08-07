## 结论

当前 `ai-os-desktop` 的 Portal 页面无法稳定显示，核心不是 `WebContentsView` 本身失效，而是 **主进程启动顺序 + View 管理入口没有完成统一**。

当前代码已经有 `AiOsWebContentsController`、`AiOsWebAppHost`、bounds 上报能力，但还没有真正按 Mattermost Desktop 的方式形成统一的 `ShellViewManager`。Mattermost Desktop 的主进程结构是 `MainWindow + WebContentsManager` 分层管理，主窗口和 WebContents 视图管理是分离的，后续证书、重载、URL 加载等都通过 WebContentsManager 找回对应 View。([GitHub][1])

---

# 一、当前代码断点

## 1. P0-1 未完成：`src/main/index.ts` 还没有进入 AppBootstrap

当前 `src/main/index.ts` 仍然是巨型入口文件，直接在 `app.whenReady().then(...)` 中执行迁移、shim、菜单、IPC、窗口创建、Modal、Tray、WebOperator、Portal Controller 等逻辑。

本轮不应直接大拆 `index.ts`，否则会影响安装、更新、Tray、Profile Runtime、Web Operator 等现有逻辑。正确处理是：

```ts
// P0 只做薄启动器，不做大规模迁移
app.whenReady().then(async () => {
  await bootstrapDesktopApp();
});
```

但 `bootstrapDesktopApp()` 内部可以先复用现有函数，不强行迁移所有 IPC。

---

## 2. P0-2 未完成：菜单没有由 `shell-menu.ts` 接管

当前仓库已经存在 `src/main/shell/shell-menu.ts`，里面有从 `index.ts` 抽出的 `buildAppMenu(getMainWindow)`。

但 `src/main/index.ts` 仍然保留本地 `buildMenu()`，并且启动时调用的是本地 `buildMenu()`。

因此现在有两个菜单实现源，实际运行仍走旧逻辑。

必须改为：

```ts
import { buildAppMenu as setupShellMenu } from "./shell/shell-menu";

// app ready 内
setupShellMenu(() => mainWindow);
```

然后删除或废弃 `index.ts` 内部的 `buildMenu()`。

---

## 3. 直接阻断点：`registerAiosIpc(mainWindow)` 调用时 `mainWindow` 还是 null

当前 `setupIPC()` 里注册 Portal Runtime IPC：

```ts
const { registerAiosIpc } = require("./aios/aios-ipc");
if (mainWindow) registerAiosIpc(mainWindow);
```

但启动顺序是：

```ts
buildMenu();
setupIPC();
createWindow();
```

也就是 `setupIPC()` 执行时 `mainWindow` 尚未创建，`registerAiosIpc()` 实际被跳过。

结果是这些 handler 不存在：

```ts
aios:get-runtime-status
aios:get-runtime-snapshot
aios:start
aios:stop
aios:restart
aios:doctor
aios:reconcile
aios:check-ports
```

而 `AIOSHomeScreen` 会先调用：

```ts
window.hermesAPI.getAiOsRuntimeSnapshot()
```

如果 handler 没注册，catch 后 `ready=false`，页面只会停留在 RuntimeGuard，不会挂载 `AiOsWebAppHost`。

这是当前 Portal 页面不显示的第一优先级问题。

---

## 4. P0-4 已有雏形：Renderer 已经能上报 bounds

`AiOsWebAppHost` 已经通过 `getBoundingClientRect()` 获取容器位置，并调用：

```ts
window.aiosRuntime.setAiOsViewBounds({
  x,
  y,
  width,
  height,
});
```

同时使用 `ResizeObserver` 监听尺寸变化。

这部分可以复用，但需要从 `aiosRuntime` 专用 API 升级成 `shellView` 通用 API。

---

## 5. P0-5 未完成：当前没有 `ShellViewManager.activate("aios-home")`

当前只有单用途 `AiOsWebContentsController`：

```ts
new AiOsWebContentsController(mainWindow);
```

它内部注册：

```ts
aios:view:load-home
aios:view:set-bounds
aios:view:reload
aios:view:hide
aios:view:destroy
```

并创建 `WebContentsView` 加到 `mainWindow.contentView`。

这能跑单个 Portal View，但不符合 Mattermost 壳层升级目标。后续如果再加 `profile-home`、`web-operator-page`、`external-web`，会继续堆多个 Controller。

本轮应把它升级为统一：

```ts
ShellViewManager.activate("aios-home", bounds)
```

不要让 `AiOsWebContentsController` 和 `ShellViewManager` 同时管理 `aios-home`，否则会出现重复 IPC handler、重复 WebContentsView、View 层级冲突。

---

# 二、选择的落地方式

选择：**以 `ShellViewManager` 统一管理 `aios-home`，当前 `AiOsWebContentsController` 停用或迁移为 manager 内部实现。**

不选择继续扩展 `AiOsWebContentsController`，原因：

1. 它只能管理 Portal Home。
2. 后续 Profile 页面、Web Operator 页面、外部 Web 页面都会重复造 Controller。
3. React Renderer 的 `WorkspaceOutlet` 只应该负责占位和 bounds 上报，不应该直接知道某个业务 View Controller。
4. Mattermost Desktop 的壳层模式是 `MainWindow` 和 `WebContentsManager` 分离管理，不是每个页面各自写一个 Controller。([GitHub][1])

---

# 三、AI Coding 执行稿

## P0-A：先修启动顺序阻断

文件：`src/main/index.ts`

新增一次性注册函数：

```ts
let aiosRuntimeIpcRegistered = false;

function setupAiosRuntimeIpcAfterWindowReady(): void {
  if (!mainWindow || aiosRuntimeIpcRegistered) return;

  try {
    const { registerAiosIpc } = require("./aios/aios-ipc");
    registerAiosIpc(mainWindow);
    aiosRuntimeIpcRegistered = true;
    console.log("[AIOS] Runtime IPC registered");
  } catch (err) {
    console.error("[AIOS] Failed to register runtime IPC:", err);
  }
}
```

在启动顺序中改为：

```ts
setupIPC();
createWindow();
setupAiosRuntimeIpcAfterWindowReady();
```

同时保留 `setupIPC()` 内原有通用 IPC，不要大拆。

验收：

```ts
await window.hermesAPI.getAiOsRuntimeSnapshot()
```

不能再报：

```txt
No handler registered for 'aios:get-runtime-snapshot'
```

---

## P0-B：菜单接管

文件：`src/main/index.ts`

新增 import：

```ts
import { buildAppMenu as setupShellMenu } from "./shell/shell-menu";
```

替换：

```ts
buildMenu();
```

为：

```ts
setupShellMenu(() => mainWindow);
```

然后删除 `index.ts` 内部本地 `buildMenu()` 函数，或先保留但不再调用。

验收：

```txt
src/main/index.ts 不再调用本地 buildMenu()
src/main/shell/shell-menu.ts 是唯一菜单入口
```

---

## P0-C：新增 ShellViewManager

新增文件：

```txt
src/main/shell/views/shell-view-manager.ts
```

核心结构：

```ts
import { BrowserWindow, WebContentsView } from "electron";
import { getAiOsEnvConfig } from "../../aios/aios-config";

export type ShellViewId = "aios-home";

export interface ShellViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ShellViewManager {
  private views = new Map<ShellViewId, WebContentsView>();
  private activeViewId: ShellViewId | null = null;

  constructor(private readonly mainWindow: BrowserWindow) {}

  async activate(viewId: ShellViewId, bounds: ShellViewBounds): Promise<void> {
    const view = this.ensureView(viewId);

    this.hideInactiveViews(viewId);

    if (!this.mainWindow.contentView.children.includes(view)) {
      this.mainWindow.contentView.addChildView(view);
    }

    view.setBounds(bounds);
    this.activeViewId = viewId;

    const targetUrl = this.resolveUrl(viewId);
    const currentUrl = view.webContents.getURL();

    if (!currentUrl) {
      await view.webContents.loadURL(targetUrl);
    }
  }

  setBounds(viewId: ShellViewId, bounds: ShellViewBounds): void {
    const view = this.views.get(viewId);
    if (!view || view.webContents.isDestroyed()) return;
    view.setBounds(bounds);
  }

  hide(viewId: ShellViewId): void {
    const view = this.views.get(viewId);
    if (!view || view.webContents.isDestroyed()) return;
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    if (this.activeViewId === viewId) {
      this.activeViewId = null;
    }
  }

  destroyAll(): void {
    for (const view of this.views.values()) {
      try {
        this.mainWindow.contentView.removeChildView(view);
        if (!view.webContents.isDestroyed()) {
          view.webContents.close();
        }
      } catch {
        // best effort
      }
    }
    this.views.clear();
    this.activeViewId = null;
  }

  private ensureView(viewId: ShellViewId): WebContentsView {
    const existing = this.views.get(viewId);
    if (existing && !existing.webContents.isDestroyed()) {
      return existing;
    }

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: this.resolvePartition(viewId),
      },
    });

    this.views.set(viewId, view);
    return view;
  }

  private resolveUrl(viewId: ShellViewId): string {
    if (viewId === "aios-home") {
      const config = getAiOsEnvConfig();
      return `http://127.0.0.1:${config.frontendPort}/zh`;
    }

    throw new Error(`Unsupported shell view: ${viewId}`);
  }

  private resolvePartition(viewId: ShellViewId): string {
    return `persist:smc-shell-${viewId}`;
  }

  private hideInactiveViews(activeViewId: ShellViewId): void {
    for (const [id, view] of this.views.entries()) {
      if (id === activeViewId) continue;
      if (!view.webContents.isDestroyed()) {
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
  }
}
```

---

## P0-D：新增 ShellView IPC

新增文件：

```txt
src/main/shell/views/shell-view-ipc.ts
```

```ts
import { ipcMain, BrowserWindow } from "electron";
import { ShellViewManager, type ShellViewId, type ShellViewBounds } from "./shell-view-manager";

let manager: ShellViewManager | null = null;
let registered = false;

export function setupShellViewIpc(mainWindow: BrowserWindow): ShellViewManager {
  manager = new ShellViewManager(mainWindow);

  if (!registered) {
    ipcMain.handle(
      "shell:view:activate",
      async (_event, viewId: ShellViewId, bounds: ShellViewBounds) => {
        if (!manager) throw new Error("ShellViewManager is not initialized");
        await manager.activate(viewId, bounds);
      },
    );

    ipcMain.handle(
      "shell:view:set-bounds",
      (_event, viewId: ShellViewId, bounds: ShellViewBounds) => {
        manager?.setBounds(viewId, bounds);
      },
    );

    ipcMain.handle("shell:view:hide", (_event, viewId: ShellViewId) => {
      manager?.hide(viewId);
    });

    registered = true;
  }

  return manager;
}

export function destroyShellViews(): void {
  manager?.destroyAll();
  manager = null;
}
```

文件：`src/main/index.ts`

在 `createWindow()` 后初始化：

```ts
let shellViewManager: import("./shell/views/shell-view-manager").ShellViewManager | null = null;

function setupShellViewsAfterWindowReady(): void {
  if (!mainWindow || shellViewManager) return;

  const { setupShellViewIpc } = require("./shell/views/shell-view-ipc");
  shellViewManager = setupShellViewIpc(mainWindow);
}
```

启动时：

```ts
setupIPC();
createWindow();
setupAiosRuntimeIpcAfterWindowReady();
setupShellViewsAfterWindowReady();
```

`before-quit` 中补充：

```ts
try {
  const { destroyShellViews } = require("./shell/views/shell-view-ipc");
  destroyShellViews();
} catch {
  // best effort
}
```

同时删除或停用：

```ts
const { AiOsWebContentsController } = require("./aios/aios-webcontents-controller");
new AiOsWebContentsController(mainWindow);
```

---

## P0-E：新增 Preload API

新增文件：

```txt
src/preload/shell-view-api.ts
```

```ts
import { ipcRenderer } from "electron";

export type ShellViewId = "aios-home";

export interface ShellViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const shellViewApi = {
  activate: (viewId: ShellViewId, bounds: ShellViewBounds): Promise<void> =>
    ipcRenderer.invoke("shell:view:activate", viewId, bounds),

  setBounds: (viewId: ShellViewId, bounds: ShellViewBounds): Promise<void> =>
    ipcRenderer.invoke("shell:view:set-bounds", viewId, bounds),

  hide: (viewId: ShellViewId): Promise<void> =>
    ipcRenderer.invoke("shell:view:hide", viewId),
};
```

文件：`src/preload/index.ts`

增加：

```ts
import { shellViewApi } from "./shell-view-api";
```

暴露：

```ts
contextBridge.exposeInMainWorld("shellView", shellViewApi);
```

非隔离分支也补充：

```ts
window.shellView = shellViewApi;
```

文件：`src/preload/index.d.ts`

增加：

```ts
import type { shellViewApi } from "./shell-view-api";

declare global {
  interface Window {
    shellView: typeof shellViewApi;
  }
}
```

---

## P0-F：新增 Renderer WebContentsHost

新增文件：

```txt
src/renderer/src/components/layout/WebContentsHost.tsx
```

```tsx
import { useCallback, useEffect, useRef } from "react";

export interface WebContentsHostProps {
  viewId: "aios-home";
  className?: string;
}

export function WebContentsHost({
  viewId,
  className,
}: WebContentsHostProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const activatedRef = useRef(false);

  const readBounds = useCallback(() => {
    const el = ref.current;
    if (!el) return null;

    const rect = el.getBoundingClientRect();

    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }, []);

  const syncBounds = useCallback(async () => {
    const bounds = readBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    if (!activatedRef.current) {
      await window.shellView.activate(viewId, bounds);
      activatedRef.current = true;
      return;
    }

    await window.shellView.setBounds(viewId, bounds);
  }, [readBounds, viewId]);

  useEffect(() => {
    let disposed = false;

    const run = async (): Promise<void> => {
      if (disposed) return;
      await syncBounds();
    };

    void run();

    const el = ref.current;
    if (!el) {
      return () => {
        disposed = true;
      };
    }

    const observer = new ResizeObserver(() => {
      void syncBounds();
    });

    observer.observe(el);
    window.addEventListener("resize", syncBounds);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
      activatedRef.current = false;
      void window.shellView.hide(viewId);
    };
  }, [syncBounds, viewId]);

  return <div ref={ref} className={className ?? "h-full w-full min-h-0"} />;
}
```

---

## P0-G：替换 Portal Home 的 WebContents 承载组件

文件：

```txt
src/renderer/src/screens/AIOSHome/AIOSHomeScreen.tsx
```

把：

```tsx
import { AiOsWebAppHost } from "../../components/aios/AiOsWebAppHost";
```

替换为：

```tsx
import { WebContentsHost } from "../../components/layout/WebContentsHost";
```

把：

```tsx
<AiOsWebAppHost className="h-full w-full" />
```

替换为：

```tsx
<WebContentsHost viewId="aios-home" className="h-full w-full" />
```

说明：不直接把 `WorkspaceOutlet` 字面替换成 `WebContentsHost`，因为当前 `AIOSHomeScreen` 内还有 `RuntimeStatusBar` 和 `RuntimeGuard`。直接替换会丢失运行态检查。正确做法是保留 `AIOSHomeScreen`，只替换内部承载层。

---

# 四、安装 / 更新跳过逻辑不受影响

现有 `App.tsx` 已经有硬性验收逻辑：

```ts
if (runtime.runtimeReady && runtime.modelConfigured) {
  next = "main";
} else if (runtime.runtimeReady && !runtime.modelConfigured) {
  next = "setup";
} else {
  next = "welcome";
}
```

也就是：

```txt
smc-ai-copilot 安装 / 更新完成
-> 检测 hermes-agent 状态
-> runtimeReady + modelConfigured
-> 直接进入 main
```

这部分在 `App.tsx` 中已经存在。

本轮改动只处理 Electron Shell、Menu、WebContentsView，不改 `getRuntimeState()`、安装器、模型配置判断，不会破坏“已初始化 + 模型已配置 -> 跳过安装与模型配置 -> 进主页”的验收链路。

---

# 五、验收标准

执行：

```bash
npm run typecheck
npm run lint
npm run dev
```

项目脚本已定义 `typecheck`、`lint`、`dev`、`build:win`。

运行验收：

```txt
1. 启动后进入 main，不回到 welcome / setup
2. 控制台无 No handler registered for 'aios:get-runtime-snapshot'
3. 菜单由 src/main/shell/shell-menu.ts 接管
4. 点击 aios-home 后，Renderer 挂载 WebContentsHost
5. Renderer 上报 workspace bounds
6. Main Process 收到 shell:view:activate("aios-home", bounds)
7. ShellViewManager 创建 WebContentsView
8. Portal 页面显示在 workspace 区域
9. 调整窗口大小后，Portal 页面跟随 workspace bounds
10. 切换到 chat / memory / tools 后，aios-home WebContentsView 被 hide
11. 切回 aios-home 后，WebContentsView 不重复创建、不重复 load
```

本轮最先提交的补丁顺序：

```txt
commit 1: fix aios runtime ipc registration after mainWindow created
commit 2: route menu to shell-menu buildAppMenu
commit 3: add ShellViewManager + shell:view IPC
commit 4: expose shellView preload API
commit 5: replace AiOsWebAppHost with WebContentsHost inside AIOSHomeScreen
commit 6: disable legacy AiOsWebContentsController registration
```

[1]: https://github.com/mattermost/desktop/blob/master/src/main/app/app.ts "desktop/src/main/app/app.ts at master · mattermost/desktop · GitHub"
