# PRD：SMC AI Copilot P0 Shell 接管与 AI-OS WebContentsView 显示修复

版本：v1.7-P0
执行对象：Cursor
目标范围：只完成 P0-1 ~ P0-6，不继续迁移 modal/dropdown/profile switcher。
核心原则：`renderer-root` 不纳入 `ShellViewManager`；`ShellViewManager` 只管理 `WebContentsView`。

---

# 1. 背景

当前已完成部分 shell 目录迁移：

```text
src/main/shell/
├─ app-bootstrap.ts
├─ main-window-controller.ts
├─ shell-layout-controller.ts
├─ shell-menu.ts
├─ window-state-store.ts
├─ views/
└─ overlays/
```

但启动后现象：

```text
- 菜单没有变化
- AI-OS 页面显示没有变化
- WebContentsView 未明显接管 aios-home
```

判断为新 shell 代码未完整接入真实启动链路，或者 Renderer 未上报 bounds，导致 `ShellViewManager.activateView("aios-home")` 没有生效。

---

# 2. 本次目标

完成以下 6 个硬性功能点：

```text
P0-1：src/main/index.ts 确认进入 AppBootstrap
P0-2：菜单由 setupShellMenu 接管
P0-3：WorkspaceOutlet 的 aios-home 改为 WebContentsHost
P0-4：Renderer 能上报 workspace bounds
P0-5：ShellViewManager 能 activate aios-home
P0-6：AI-OS 页面由 WebContentsView 显示
```

---

# 3. 非目标

本次禁止处理以下内容：

```text
- 不迁移 Profile Switcher Dropdown
- 不迁移 Gateway Status Dropdown
- 不迁移 ModalViewManager
- 不迁移 DropdownViewManager
- 不修改 hermes-agent 安装逻辑
- 不修改模型配置逻辑
- 不重构 Chat / Memory / Tools / Gateway
- 不把 renderer-root 纳入 ShellViewManager
```

---

# 4. 架构边界

## 4.1 正确归属

```text
renderer-root
  -> BrowserWindow.webContents
  -> MainWindowController 管理
  -> 承载 React DesktopShell / Sidebar / Header / StatusBar

AI-OS 页面
  -> WebContentsView
  -> ShellViewManager 管理
  -> 由 Renderer 上报 bounds 后显示到 WebContentsHost 区域

bounds/layout
  -> ShellLayoutController 管理
  -> 接收 Renderer workspace host rect
  -> 调用 ShellViewManager.setActiveBounds()

菜单
  -> setupShellMenu 接管
  -> 不再直接使用旧 buildMenu()
```

## 4.2 禁止实现

```ts
// 禁止
type ShellViewKind = "renderer-root" | "aios-home";
```

正确：

```ts
export type ShellViewKind =
  | "aios-home"
  | "web-operator"
  | "profile-page"
  | "external-browser";
```

---

# 5. 文件变更范围

## 5.1 必改文件

```text
src/main/index.ts
src/main/shell/app-bootstrap.ts
src/main/shell/main-window-controller.ts
src/main/shell/shell-menu.ts
src/main/shell/shell-layout-controller.ts
src/main/shell/views/shell-view-manager.ts
src/main/shell/views/managed-webcontents-view.ts
src/preload/index.ts
src/preload/shell-api.ts
src/renderer/src/components/layout/WorkspaceOutlet.tsx
src/renderer/src/components/layout/DesktopShell.tsx
```

## 5.2 必新增文件

```text
src/renderer/src/components/layout/WebContentsHost.tsx
src/shared/shell/shell-view-contract.ts
```

---

# 6. 功能需求

## F-001：src/main/index.ts 必须进入 AppBootstrap

### 目标

主进程启动入口必须进入 `AppBootstrap.start()`。

### 实施要求

`src/main/index.ts` 中 `app.whenReady()` 后不得继续直接调用旧的：

```ts
buildMenu();
setupIPC();
createWindow();
```

应改为：

```ts
app.whenReady().then(async () => {
  const { AppBootstrap } = await import("./shell/app-bootstrap");
  const bootstrap = new AppBootstrap();
  await bootstrap.start();
});
```

### 兼容要求

如果旧 `setupIPC()` 内包含大量 Hermes IPC，不允许删除。应由 `AppBootstrap` 调用旧 `setupIPC()`，保证现有功能不丢失。

### 必须输出日志

```text
[SHELL_BOOT] AppBootstrap.start
[SHELL_BOOT] MainWindowController.create
[SHELL_BOOT] ShellViewManager.init
[SHELL_BOOT] ShellLayoutController.init
[SHELL_BOOT] Shell IPC registered
```

---

## F-002：AppBootstrap 接管启动编排

### 目标

`AppBootstrap` 统一创建主窗口、菜单、ShellViewManager、ShellLayoutController、Shell IPC。

### 参考结构

```ts
// src/main/shell/app-bootstrap.ts

import { BrowserWindow } from "electron";
import { MainWindowController } from "./main-window-controller";
import { setupShellMenu } from "./shell-menu";
import { ShellLayoutController } from "./shell-layout-controller";
import { ShellViewManager } from "./views/shell-view-manager";

export class AppBootstrap {
  private mainWindowController: MainWindowController | null = null;
  private shellViewManager: ShellViewManager | null = null;
  private shellLayoutController: ShellLayoutController | null = null;

  async start(): Promise<void> {
    console.info("[SHELL_BOOT] AppBootstrap.start");

    this.mainWindowController = new MainWindowController();
    const mainWindow = this.mainWindowController.create();

    this.shellViewManager = new ShellViewManager(mainWindow);
    console.info("[SHELL_BOOT] ShellViewManager.init");

    this.shellLayoutController = new ShellLayoutController(this.shellViewManager);
    console.info("[SHELL_BOOT] ShellLayoutController.init");

    this.registerShellIpc();

    setupShellMenu(this.mainWindowController);

    // 保留旧 IPC / updater / runtime 初始化
    await this.registerLegacyModules(mainWindow);
  }

  private registerShellIpc(): void {
    if (!this.shellViewManager || !this.shellLayoutController) {
      throw new Error("Shell modules are not ready");
    }

    this.shellViewManager.registerIpc();
    this.shellLayoutController.registerIpc();

    console.info("[SHELL_BOOT] Shell IPC registered");
  }

  private async registerLegacyModules(_mainWindow: BrowserWindow): Promise<void> {
    // Cursor 需要把旧 index.ts 中 setupIPC/setupUpdater/WebOperator/AIOS runtime 初始化迁入这里，
    // 或者保留旧函数并从这里调用。
  }
}
```

### 验收

启动终端必须看到：

```text
[SHELL_BOOT] AppBootstrap.start
```

没有该日志则判定 P0-1 失败。

---

## F-003：菜单由 setupShellMenu 接管

### 目标

启动后的应用菜单必须来自 `src/main/shell/shell-menu.ts`。

### 实施要求

`setupShellMenu()` 必须调用：

```ts
Menu.setApplicationMenu(Menu.buildFromTemplate(template));
```

### 菜单最小内容

```ts
// src/main/shell/shell-menu.ts

import { Menu, shell } from "electron";
import type { MainWindowController } from "./main-window-controller";

export function setupShellMenu(mainWindow: MainWindowController): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "SMC Copilot",
      submenu: [
        {
          label: "AI-OS Home",
          accelerator: "CmdOrCtrl+1",
          click: () => {
            mainWindow.send("shell:navigate", { view: "aios-home" });
          },
        },
        {
          label: "Chat",
          accelerator: "CmdOrCtrl+2",
          click: () => {
            mainWindow.send("shell:navigate", { view: "chat" });
          },
        },
        {
          label: "Web Operator",
          accelerator: "CmdOrCtrl+3",
          click: () => {
            mainWindow.send("shell:navigate", { view: "web-operator" });
          },
        },
        { type: "separator" },
        {
          label: "Runtime Setup",
          click: () => {
            mainWindow.send("shell:navigate", { view: "runtime-setup" });
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "Reload Active WebContent",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            mainWindow.send("shell:view:reload-active");
          },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Hermes Agent",
          click: () => {
            shell.openExternal("https://github.com/NousResearch/hermes-agent");
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  console.info("[SHELL_MENU] setupShellMenu applied");
}
```

### 验收

```text
- 启动后菜单出现 SMC Copilot
- 点击 AI-OS Home 后 Renderer 收到 shell:navigate
- 终端出现 [SHELL_MENU] setupShellMenu applied
```

---

## F-004：新增 WebContentsHost

### 目标

Renderer 中提供一个真实的 WebContentsView 占位区，并持续上报 bounds。

### 新增文件

```text
src/renderer/src/components/layout/WebContentsHost.tsx
```

### 实现

```tsx
import { useEffect, useLayoutEffect, useRef } from "react";

export interface WebContentsHostProps {
  view: "aios-home" | "web-operator" | "profile-page" | "external-browser";
  url?: string;
  active: boolean;
}

export function WebContentsHost({
  view,
  url,
  active,
}: WebContentsHostProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  const syncBounds = (): void => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();

    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    if (bounds.width <= 0 || bounds.height <= 0) {
      console.warn("[WEB_CONTENTS_HOST] skip zero bounds", bounds);
      return;
    }

    window.smcShell?.layout?.updateWorkspaceBounds(bounds);
  };

  useLayoutEffect(() => {
    syncBounds();

    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      syncBounds();
    });

    observer.observe(el);
    window.addEventListener("resize", syncBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    window.smcShell?.views?.activate({
      kind: view,
      url,
    });

    syncBounds();
  }, [active, view, url]);

  return (
    <div
      ref={ref}
      className="webcontents-host"
      data-view={view}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
      }}
    />
  );
}
```

### 注意

`getBoundingClientRect()` 结果不要乘 `devicePixelRatio`。Electron `WebContentsView.setBounds()` 使用 DIP。

---

## F-005：WorkspaceOutlet 的 aios-home 改为 WebContentsHost

### 目标

`aios-home` 不再直接渲染旧 React AI-OS 页面，而是渲染 `WebContentsHost`。

### 修改位置

```text
src/renderer/src/components/layout/WorkspaceOutlet.tsx
```

### 要求

找到 `aios-home` 分支，将其改为：

```tsx
import { WebContentsHost } from "./WebContentsHost";

// ...

case "aios-home":
  return (
    <WebContentsHost
      view="aios-home"
      url="http://127.0.0.1:3000/zh"
      active={true}
    />
  );
```

如果项目已有 AI-OS URL 配置，可替换为配置读取，但本次 P0 必须保证默认 URL 可运行：

```text
http://127.0.0.1:3000/zh
```

### 验收

打开 AI-OS Home 页面后，Renderer Console 应出现：

```text
[WEB_CONTENTS_HOST] bounds
```

Main Process 终端应出现：

```text
[SHELL_LAYOUT] workspace bounds
[SHELL_VIEW] activate aios-home
```

---

## F-006：Renderer 能上报 workspace bounds

### 目标

通过 `window.smcShell.layout.updateWorkspaceBounds(bounds)` 将 host 坐标传给 Main Process。

### 修改 preload

新增：

```text
src/preload/shell-api.ts
```

### 实现

```ts
import { ipcRenderer } from "electron";

export const smcShellApi = {
  layout: {
    updateWorkspaceBounds: (bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): Promise<void> => {
      return ipcRenderer.invoke("shell-layout:update-workspace-bounds", bounds);
    },
  },

  views: {
    activate: (input: {
      kind: "aios-home" | "web-operator" | "profile-page" | "external-browser";
      url?: string;
    }): Promise<void> => {
      return ipcRenderer.invoke("shell-view:activate", input);
    },

    reloadActive: (): Promise<void> => {
      return ipcRenderer.invoke("shell-view:reload-active");
    },
  },
};
```

修改：

```text
src/preload/index.ts
```

加入：

```ts
import { smcShellApi } from "./shell-api";

// contextBridge expose 中加入
contextBridge.exposeInMainWorld("smcShell", smcShellApi);
```

### 类型声明

如果项目有 `src/renderer/src/vite-env.d.ts` 或 preload 类型文件，补充：

```ts
interface Window {
  smcShell?: {
    layout: {
      updateWorkspaceBounds(bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      }): Promise<void>;
    };
    views: {
      activate(input: {
        kind: "aios-home" | "web-operator" | "profile-page" | "external-browser";
        url?: string;
      }): Promise<void>;
      reloadActive(): Promise<void>;
    };
  };
}
```

---

## F-007：ShellLayoutController 接收 bounds

### 目标

Main Process 接收 Renderer 上报的 bounds，并同步给 `ShellViewManager`。

### 实现

```ts
// src/main/shell/shell-layout-controller.ts

import { ipcMain, type Rectangle } from "electron";
import type { ShellViewManager } from "./views/shell-view-manager";

export class ShellLayoutController {
  private workspaceBounds: Rectangle | null = null;
  private registered = false;

  constructor(private readonly viewManager: ShellViewManager) {}

  registerIpc(): void {
    if (this.registered) return;
    this.registered = true;

    ipcMain.handle(
      "shell-layout:update-workspace-bounds",
      async (_event, bounds: Rectangle) => {
        this.updateWorkspaceBounds(bounds);
      },
    );
  }

  updateWorkspaceBounds(bounds: Rectangle): void {
    if (bounds.width <= 0 || bounds.height <= 0) {
      console.warn("[SHELL_LAYOUT] skip invalid workspace bounds", bounds);
      return;
    }

    this.workspaceBounds = bounds;
    console.info("[SHELL_LAYOUT] workspace bounds", bounds);
    this.viewManager.setActiveBounds(bounds);
  }

  getWorkspaceBounds(): Rectangle | null {
    return this.workspaceBounds;
  }

  reapply(): void {
    if (!this.workspaceBounds) return;
    this.viewManager.setActiveBounds(this.workspaceBounds);
  }
}
```

---

## F-008：ShellViewManager 能 activate aios-home

### 目标

`ShellViewManager.activateView()` 必须创建、加载、显示 `aios-home` WebContentsView。

### 实现

```ts
// src/shared/shell/shell-view-contract.ts

export type ShellViewKind =
  | "aios-home"
  | "web-operator"
  | "profile-page"
  | "external-browser";

export interface ShellViewActivateInput {
  kind: ShellViewKind;
  url?: string;
}
```

```ts
// src/main/shell/views/shell-view-manager.ts

import { BrowserWindow, ipcMain, type Rectangle } from "electron";
import { ManagedWebContentsView } from "./managed-webcontents-view";
import type {
  ShellViewActivateInput,
  ShellViewKind,
} from "../../../shared/shell/shell-view-contract";

export class ShellViewManager {
  private views = new Map<ShellViewKind, ManagedWebContentsView>();
  private activeKind: ShellViewKind | null = null;
  private lastBounds: Rectangle | null = null;
  private registered = false;

  constructor(private readonly mainWindow: BrowserWindow) {
    console.info("[SHELL_VIEW] init");
  }

  registerIpc(): void {
    if (this.registered) return;
    this.registered = true;

    ipcMain.handle("shell-view:activate", async (_event, input: ShellViewActivateInput) => {
      await this.activateView(input);
    });

    ipcMain.handle("shell-view:reload-active", async () => {
      this.reloadActive();
    });
  }

  async activateView(input: ShellViewActivateInput): Promise<void> {
    console.info("[SHELL_VIEW] activate", input.kind, input.url);

    let view = this.views.get(input.kind);

    if (!view) {
      view = new ManagedWebContentsView(this.mainWindow, {
        kind: input.kind,
        partition: `persist:smc-${input.kind}`,
      });

      this.views.set(input.kind, view);
      this.mainWindow.contentView.addChildView(view.getView());

      console.info("[SHELL_VIEW] create", input.kind);
    }

    for (const [kind, item] of this.views.entries()) {
      if (kind !== input.kind) {
        item.hide();
      }
    }

    if (input.url) {
      await view.loadURL(input.url);
    }

    if (this.lastBounds) {
      view.setBounds(this.lastBounds);
    }

    view.show();
    this.activeKind = input.kind;

    this.mainWindow.contentView.removeChildView(view.getView());
    this.mainWindow.contentView.addChildView(view.getView());
  }

  setActiveBounds(bounds: Rectangle): void {
    this.lastBounds = bounds;

    if (!this.activeKind) {
      console.info("[SHELL_VIEW] bounds cached, no active view", bounds);
      return;
    }

    const active = this.views.get(this.activeKind);
    if (!active) return;

    console.info("[SHELL_VIEW] setBounds", this.activeKind, bounds);
    active.setBounds(bounds);
  }

  reloadActive(): void {
    if (!this.activeKind) return;
    this.views.get(this.activeKind)?.reload();
  }
}
```

---

## F-009：ManagedWebContentsView 最小实现

### 目标

封装 `WebContentsView` 的加载、bounds、show/hide、日志。

### 实现

```ts
// src/main/shell/views/managed-webcontents-view.ts

import {
  BrowserWindow,
  WebContentsView,
  type Rectangle,
} from "electron";
import type { ShellViewKind } from "../../../shared/shell/shell-view-contract";

export interface ManagedWebContentsViewOptions {
  kind: ShellViewKind;
  partition: string;
  preload?: string;
}

export class ManagedWebContentsView {
  private readonly view: WebContentsView;
  private lastUrl: string | null = null;

  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly options: ManagedWebContentsViewOptions,
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: options.partition,
        ...(options.preload ? { preload: options.preload } : {}),
      },
    });

    this.view.webContents.on("did-finish-load", () => {
      console.info("[MANAGED_VIEW] did-finish-load", this.options.kind);
    });

    this.view.webContents.on("did-fail-load", (_event, code, desc, url) => {
      console.error("[MANAGED_VIEW] did-fail-load", {
        kind: this.options.kind,
        code,
        desc,
        url,
      });
    });

    this.view.webContents.setWindowOpenHandler(({ url }) => {
      console.info("[MANAGED_VIEW] block window open", {
        kind: this.options.kind,
        url,
      });
      return { action: "deny" };
    });
  }

  getView(): WebContentsView {
    return this.view;
  }

  async loadURL(url: string): Promise<void> {
    if (this.lastUrl === url && !this.view.webContents.isLoading()) {
      return;
    }

    this.lastUrl = url;
    console.info("[MANAGED_VIEW] loadURL", {
      kind: this.options.kind,
      url,
    });

    await this.view.webContents.loadURL(url);
  }

  setBounds(bounds: Rectangle): void {
    this.view.setBounds(bounds);
  }

  show(): void {
    const bounds = this.view.getBounds();

    if (bounds.width <= 0 || bounds.height <= 0) {
      console.info("[MANAGED_VIEW] show waiting for bounds", this.options.kind);
      return;
    }

    this.view.webContents.focus();
  }

  hide(): void {
    this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  reload(): void {
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.reload();
    }
  }

  destroy(): void {
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.close();
    }
  }
}
```

---

# 7. CSS / Layout 要求

## 7.1 DesktopShell 必须保证 outlet 有高度

检查：

```text
src/renderer/src/components/layout/DesktopShell.tsx
```

确保：

```css
.desktop-shell {
  height: 100vh;
  min-height: 0;
}

.desktop-shell__main {
  min-height: 0;
}

.desktop-shell__outlet {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.webcontents-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
```

如果当前 CSS 不在单独 css 文件，由 Cursor 在现有样式文件补齐。

---

# 8. 验收标准

## 8.1 启动日志验收

启动后 Main terminal 必须出现：

```text
[SHELL_BOOT] AppBootstrap.start
[SHELL_BOOT] MainWindowController.create
[SHELL_BOOT] ShellViewManager.init
[SHELL_BOOT] ShellLayoutController.init
[SHELL_BOOT] Shell IPC registered
[SHELL_MENU] setupShellMenu applied
```

## 8.2 菜单验收

```text
- 应用菜单出现 SMC Copilot
- SMC Copilot 菜单下有 AI-OS Home / Chat / Web Operator / Runtime Setup
- 点击 AI-OS Home 不报错
```

## 8.3 Renderer bounds 验收

进入 `aios-home` 后 Main terminal 必须出现：

```text
[SHELL_LAYOUT] workspace bounds { x, y, width, height }
```

并且：

```text
width > 0
height > 0
```

## 8.4 View 激活验收

Main terminal 必须出现：

```text
[SHELL_VIEW] activate aios-home http://127.0.0.1:3000/zh
[SHELL_VIEW] create aios-home
[SHELL_VIEW] setBounds aios-home
[MANAGED_VIEW] loadURL
```

## 8.5 AI-OS WebContentsView 显示验收

启动本地 AI-OS 前端后：

```text
http://127.0.0.1:3000/zh
```

应用内 AI-OS Home 区域必须显示该页面。

如果 AI-OS 服务未启动，应看到：

```text
[MANAGED_VIEW] did-fail-load
```

而不是静默无反应。

---

# 9. 手工 smoke test

Renderer DevTools Console 执行：

```js
await window.smcShell.layout.updateWorkspaceBounds({
  x: 80,
  y: 80,
  width: 1000,
  height: 700,
});

await window.smcShell.views.activate({
  kind: "aios-home",
  url: "http://127.0.0.1:3000/zh",
});
```

预期 Main terminal：

```text
[SHELL_LAYOUT] workspace bounds
[SHELL_VIEW] activate aios-home
[SHELL_VIEW] create aios-home
[MANAGED_VIEW] loadURL
[MANAGED_VIEW] did-finish-load
```

---

# 10. Cursor 执行顺序

```text
Step 1：确认 src/main/index.ts 改为 AppBootstrap.start()
Step 2：实现 MainWindowController.create() 并保留旧 BrowserWindow 参数
Step 3：实现 setupShellMenu() 并替换旧 buildMenu()
Step 4：实现 smcShell preload API
Step 5：实现 ShellLayoutController IPC
Step 6：实现 ShellViewManager IPC
Step 7：实现 ManagedWebContentsView
Step 8：新增 WebContentsHost
Step 9：修改 WorkspaceOutlet aios-home 分支
Step 10：补齐 CSS 高度
Step 11：运行 npm run typecheck
Step 12：运行 npm run dev 做 smoke test
```

---

# 11. 失败处理规则

## 11.1 没有 `[SHELL_BOOT]`

处理：

```text
检查 src/main/index.ts 是否仍执行旧 app.whenReady().then(...)
检查 AppBootstrap 是否被 import
```

## 11.2 菜单没变化

处理：

```text
检查旧 buildMenu() 是否仍被调用
检查 setupShellMenu() 是否调用 Menu.setApplicationMenu()
```

## 11.3 没有 bounds 日志

处理：

```text
检查 WebContentsHost 是否渲染
检查 WorkspaceOutlet 是否进入 aios-home 分支
检查 .desktop-shell__outlet 是否高度为 0
检查 window.smcShell 是否注入成功
```

## 11.4 有 bounds 但没有 View

处理：

```text
检查 shell-view:activate IPC 是否注册
检查 WebContentsHost useEffect 是否执行
检查 ShellViewManager.activateView 是否打印日志
```

## 11.5 View 创建但不可见

处理：

```text
检查 setBounds 是否 width/height > 0
检查 addChildView 是否执行
检查 active view 是否 remove 后重新 addChildView
检查 hide() 是否在 show() 后被调用
```

---

# 12. 最终完成定义

本 PRD 完成后，必须满足：

```text
P0-1：src/main/index.ts 确认进入 AppBootstrap          PASS
P0-2：菜单由 setupShellMenu 接管                      PASS
P0-3：WorkspaceOutlet 的 aios-home 改为 WebContentsHost PASS
P0-4：Renderer 能上报 workspace bounds                PASS
P0-5：ShellViewManager 能 activate aios-home           PASS
P0-6：AI-OS 页面由 WebContentsView 显示                PASS
```

交付时附带：

```text
- 变更文件列表
- 启动日志截图或日志片段
- Renderer smoke test 结果
- AI-OS WebContentsView 显示结果
```
