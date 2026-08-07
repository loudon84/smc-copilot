## 结论

当前不是 `pnpm run dev` 编译链路问题，而是 **Portal WebContentsView 的生命周期与 Renderer 路由状态没有对齐**。

必须按以下方向修：

1. `aios-home` 不再应用启动时提前创建，改为 **Renderer 上报 bounds 后懒加载创建**。
2. `WebContentsHost` 不再先 `activate()`，只通过 `setBounds()` 激活，避免 WebContentsView 以全窗口覆盖菜单区。
3. `WorkspaceOutlet` 中 `aios-home` 不要长期 `display:none` 挂载，否则 native WebContentsView 不会被 React CSS 隐藏。
4. `RuntimeGuard` 不能只启动 Hermes Gateway，必须启动完整 Portal Runtime。
5. 原生菜单不是没创建，而是当前窗口配置为 frameless + `autoHideMenuBar: true`，Windows 下不会作为可视菜单显示。

---

## 一、当前代码根因定位

### 1. 菜单被隐藏或被 WebContentsView 覆盖

当前窗口配置：

```ts
autoHideMenuBar: true,
frame: false,
titleBarStyle: "hidden"
```

这会导致 Windows / Linux 下原生菜单不可见。代码位置在 `createWindow()`。

同时 `buildAppMenu()` 已经正常调用，菜单模板本身存在。
所以菜单问题不是 `shell-menu.ts` 没生效，而是：

```text
原生菜单被隐藏
+
aios-home WebContentsView 可能用全窗口 bounds 覆盖 Renderer 菜单区
```

---

### 2. `WebContentsHost` 先 activate，再 setBounds，导致全屏覆盖

当前 `WebContentsHost` 的逻辑是：

```ts
await window.shellView.activate(layerId);
await window.shellView.setBounds(layerId, bounds);
```

而 `ShellViewManager.activateView()` 在没有 bounds 时默认使用整个 BrowserWindow 尺寸。

结果：

```text
WebContentsHost 首次挂载
 -> shellView.activate("aios-home")
 -> aios-home WebContentsView 全窗口显示
 -> 覆盖左侧菜单 / header / React UI
 -> 再 setBounds，但过程中或异常时会残留覆盖
```

当前代码证据：`WebContentsHost.tsx` 中先 activate 再 setBounds。

---

### 3. `WorkspaceOutlet` 用 display:none 隐藏 aios-home，但 WebContentsView 不受 CSS 控制

当前 `aios-home` 永远挂载，只是通过 `display: none` 隐藏。

React DOM 被隐藏，不代表 Electron native `WebContentsView` 被隐藏。

因此切换到 Chat / Gateway / Settings 时，`aios-home` 的 native view 可能仍保留旧 bounds，继续覆盖页面。

---

### 4. Portal View 启动时提前 create，容易加载失败后不恢复

当前启动时直接创建：

```ts
await shellViewManager.createView("aios-home", "aios-home", aiosHomeUrl, {
  layer: "content",
});
```

位置在 app ready 后。

问题：

```text
Electron 启动
 -> Portal Frontend 3000/zh 还没启动
 -> WebContentsView loadURL 失败
 -> view 对象可能已存在，但页面是 error / blank
 -> 后续 Runtime ready 后没有强制 reload
```

---

### 5. RuntimeGuard 只启动 Hermes Gateway，不启动 Portal Backend / Frontend

当前 `RuntimeGuard` 点击按钮只执行：

```ts
await window.hermesAPI.startGateway();
```

代码位置：

但 `AIOSHomeScreen` 的 ready 条件依赖 `hermes-gateway + aios-backend + aios-frontend` 全部 running。
所以只启动 gateway，Portal 页面仍然不会显示。

---

## 二、修复主线

### 目标链路

```text
进入 aios-home
 -> AIOSHomeScreen 检测 runtime snapshot
 -> 未 ready：RuntimeGuard 启动 gateway + Portal backend + Portal frontend
 -> ready：WebContentsHost 上报真实 bounds
 -> shell-view-ipc 懒创建 / reload aios-home WebContentsView
 -> ShellViewManager 只按 bounds 显示 WebContentsView
 -> 切换菜单时 hide aios-home WebContentsView
```

---

# 三、Cursor 执行稿

## P0-1：删除启动阶段提前创建 aios-home view

### 文件

```text
src/main/index.ts
```

### 操作

删除以下代码块：

```ts
// Initialize Portal View via ShellViewManager (V1.9: AiOsWebContentsController deprecated)
if (shellViewManager) {
  try {
    const envConfig = getAiOsEnvConfig();
    if (envConfig && envConfig.frontendPort > 0) {
      const aiosHomeUrl = `http://127.0.0.1:${envConfig.frontendPort}/zh`;
      await shellViewManager.createView("aios-home", "aios-home", aiosHomeUrl, {
        layer: "content",
      });
      console.log(`[SHELL] aios-home view created with URL: ${aiosHomeUrl}`);
    } else {
      console.warn("[SHELL] Portal env config invalid, aios-home view not created");
    }
  } catch (err) {
    console.error("[SHELL] Failed to create aios-home view:", err);
  }
}
```

保留：

```ts
shellViewManager = new ShellViewManager(mainWindow);
registerShellViewIpc(shellViewManager);
```

---

## P0-2：ShellView IPC 增加 aios-home 懒加载

### 文件

```text
src/main/shell/shell-view-ipc.ts
```

### 替换为

```ts
import { ipcMain } from "electron";
import type { ShellViewManager } from "./views/shell-view-manager";
import type { ShellViewBoundsIPC } from "../../shared/shell/shell-view-contract";
import { ShellViewChannels } from "../../shared/shell/shell-view-contract";
import { getAiOsEnvConfig } from "../aios/aios-config";

function getAiOsHomeUrl(): string {
  const config = getAiOsEnvConfig();
  return `http://127.0.0.1:${config.frontendPort}/zh`;
}

async function ensureAiosHomeView(svm: ShellViewManager): Promise<void> {
  const url = getAiOsHomeUrl();
  const existing = svm.getView("aios-home");

  if (!existing || !existing.getWebContents() || existing.getWebContents()?.isDestroyed()) {
    await svm.createView("aios-home", "aios-home", url, {
      layer: "content",
    });
    console.log(`[SHELL-IPC] Lazy created aios-home view: ${url}`);
    return;
  }

  const webContents = existing.getWebContents();
  const currentUrl = webContents?.getURL() ?? "";
  const state = existing.getState();

  const shouldReload =
    !currentUrl ||
    currentUrl === "about:blank" ||
    currentUrl.startsWith("chrome-error://") ||
    state === "creating" ||
    state === "loading" ||
    state === "destroyed";

  if (shouldReload) {
    await existing.load(url);
    console.log(`[SHELL-IPC] Reloaded aios-home view: ${url}`);
  }
}

async function ensureKnownView(svm: ShellViewManager, layerId: string): Promise<void> {
  if (layerId === "aios-home") {
    await ensureAiosHomeView(svm);
    return;
  }

  if (!svm.hasView(layerId)) {
    throw new Error(`Layer not found: ${layerId}`);
  }
}

export function registerShellViewIpc(svm: ShellViewManager): void {
  ipcMain.handle(
    ShellViewChannels.ACTIVATE,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      await ensureKnownView(svm, layerId);
      svm.activateView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.SET_BOUNDS,
    async (
      _event,
      layerId: string,
      bounds: ShellViewBoundsIPC,
    ): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      if (
        !bounds ||
        typeof bounds.x !== "number" ||
        typeof bounds.y !== "number" ||
        typeof bounds.width !== "number" ||
        typeof bounds.height !== "number" ||
        bounds.width < 1 ||
        bounds.height < 1
      ) {
        throw new Error(
          "Invalid bounds: x/y must be numbers, width/height must be positive integers",
        );
      }

      await ensureKnownView(svm, layerId);
      svm.activateView(layerId, bounds);
    },
  );

  ipcMain.handle(
    ShellViewChannels.HIDE,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      svm.deactivateView(layerId);
    },
  );

  console.log("[SHELL-IPC] ShellView IPC handlers registered");
}

export function destroyShellViews(): void {
  try {
    const { viewEventBus } = require("./views/view-events");
    viewEventBus.emit("destroy-all" as never);
  } catch {
    /* best effort */
  }
}
```

---

## P0-3：WebContentsHost 禁止 activate 全屏，改为 setBounds 单一入口

### 文件

```text
src/renderer/src/components/shell/WebContentsHost.tsx
```

### 核心修改

删除：

```ts
const activatedRef = useRef(false);
```

删除：

```ts
if (!activatedRef.current) {
  await window.shellView.activate(layerId);
  activatedRef.current = true;
}
```

修改后的关键逻辑：

```ts
const hiddenRef = useRef(true);

const syncBounds = useCallback(async () => {
  const bounds = readBounds();

  if (!bounds || bounds.width < 1 || bounds.height < 1) {
    if (!hiddenRef.current) {
      await window.shellView.hide(layerId).catch(() => {});
      hiddenRef.current = true;
    }
    return;
  }

  try {
    await window.shellView.setBounds(layerId, bounds);
    hiddenRef.current = false;
    setError(false);
  } catch (err) {
    console.error("[WebContentsHost] shellView API error:", err);
    setError(true);
  }
}, [readBounds, layerId]);
```

cleanup 中保留 hide：

```ts
return () => {
  disposed = true;
  observer.disconnect();
  window.removeEventListener("resize", debouncedSync);
  if (debounceTimer) clearTimeout(debounceTimer);
  hiddenRef.current = true;
  void window.shellView.hide(layerId).catch(() => {});
};
```

重试按钮中删除 `activatedRef.current = false`。

---

## P0-4：WorkspaceOutlet 对 aios-home 改为条件挂载

### 文件

```text
src/renderer/src/components/layout/WorkspaceOutlet.tsx
```

### 替换当前 aios-home 块

当前是：

```tsx
<div
  style={{
    display: view === "aios-home" ? "flex" : "none",
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  }}
>
  <AIOSHomeScreen onNavigate={onNavigate} />
</div>
```

替换为：

```tsx
{view === "aios-home" && (
  <div
    style={{
      display: "flex",
      flex: 1,
      flexDirection: "column",
      overflow: "hidden",
      minHeight: 0,
    }}
  >
    <AIOSHomeScreen onNavigate={onNavigate} />
  </div>
)}
```

目的：

```text
切出 aios-home
 -> AIOSHomeScreen 卸载
 -> WebContentsHost cleanup
 -> shellView.hide("aios-home")
 -> native WebContentsView bounds 清零
 -> 不再覆盖菜单和其它页面
```

---

## P0-5：RuntimeGuard 启动完整 Portal Runtime

### 文件

```text
src/renderer/src/components/runtime/RuntimeGuard.tsx
```

### 修改 Props

```ts
export interface RuntimeGuardProps {
  gatewayStatus: string;
  onNavigate: (view: View) => void;
  onStarted?: () => void | Promise<void>;
}
```

### 修改组件签名

```ts
export function RuntimeGuard({
  gatewayStatus,
  onNavigate,
  onStarted,
}: RuntimeGuardProps): React.JSX.Element {
```

### 替换启动函数

```ts
const handleStartRuntime = useCallback(async () => {
  setStarting(true);
  try {
    await window.hermesAPI.startGateway();
    await window.aiosRuntime.startAiOs();
    await onStarted?.();
  } catch (err) {
    console.error("[RuntimeGuard] Failed to start Portal runtime:", err);
  } finally {
    setStarting(false);
  }
}, [onStarted]);
```

### 替换按钮事件

```tsx
onClick={handleStartRuntime}
```

按钮文案可以继续复用：

```tsx
{t("runtimeGuard.startGateway")}
```

后续再改 i18n key 为：

```text
runtimeGuard.startRuntime
```

---

## P0-6：AIOSHomeScreen 启动完成后刷新状态

### 文件

```text
src/renderer/src/screens/AIOSHome/AIOSHomeScreen.tsx
```

### 替换 RuntimeGuard 调用

```tsx
<RuntimeGuard
  gatewayStatus={gatewayStatus}
  onNavigate={onNavigate}
  onStarted={refreshStatus}
/>
```

---

## P0-7：Portal Runtime Snapshot 不要硬编码 3000 / 8000

### 文件

```text
src/main/aios/aios-runtime-supervisor.ts
```

当前 snapshot 固定：

```ts
port: 8000
port: 3000
WEB_APP_URL = "http://127.0.0.1:3000/zh"
```

这会绕过 `getAiOsEnvConfig()`。当前配置文件里端口本身是可配置的。

### 修改方式

把 `SNAPSHOT_SERVICE_DEFS` 常量改为函数：

```ts
function getSnapshotServiceDefs(): Array<{
  id: AiOsServiceId;
  displayName: string;
  port: number;
  baseUrl: string;
  healthUrl: string;
}> {
  const config = getAiOsEnvConfig();

  return [
    {
      id: "hermes-gateway",
      displayName: "Hermes Gateway",
      port: 8642,
      baseUrl: config.hermesGatewayUrl,
      healthUrl: `${config.hermesGatewayUrl}/health`,
    },
    {
      id: "aios-backend",
      displayName: "Portal Backend",
      port: config.backendPort,
      baseUrl: `http://127.0.0.1:${config.backendPort}`,
      healthUrl: `http://127.0.0.1:${config.backendPort}/health`,
    },
    {
      id: "aios-frontend",
      displayName: "Portal Frontend",
      port: config.frontendPort,
      baseUrl: `http://127.0.0.1:${config.frontendPort}`,
      healthUrl: `http://127.0.0.1:${config.frontendPort}/zh`,
    },
  ];
}
```

然后把：

```ts
SNAPSHOT_SERVICE_DEFS.map(...)
```

替换为：

```ts
getSnapshotServiceDefs().map(...)
```

最后 webAppUrl 改为：

```ts
const config = getAiOsEnvConfig();
const webAppUrl = `http://127.0.0.1:${config.frontendPort}/zh`;

return {
  services,
  ready,
  ...(ready ? { webAppUrl } : {}),
};
```

---

## P0-8：菜单处理口径

当前按 Mattermost 壳层模式，菜单分两层：

```text
Electron Application Menu:
  用于快捷键、系统菜单、开发调试、窗口命令

Renderer Sidebar / Header:
  用于产品主导航
```

因此本轮不恢复 Windows 原生菜单栏。否则要把 `frame: false` 改为 `frame: true`，会破坏当前自定义标题栏和窗口按钮布局。

保留当前 Mattermost 式方向：

```text
frame: false
自定义 titlebar
自定义 sidebar navigation
Application Menu 只做系统级 menu + accelerator
```

但需要加一个调试开关，方便验证菜单模板是否正常。

### 文件

```text
src/main/index.ts
```

### 修改

```ts
const showNativeMenuBar =
  process.env.SMC_SHOW_NATIVE_MENU_BAR === "1";
```

BrowserWindow 配置中改为：

```ts
autoHideMenuBar: !showNativeMenuBar,
...(process.platform === "darwin"
  ? {
      titleBarStyle: "hiddenInset" as const,
      trafficLightPosition: { x: 16, y: 16 },
    }
  : showNativeMenuBar
    ? {
        frame: true,
      }
    : {
        frame: false,
        titleBarStyle: "hidden" as const,
      }),
```

验证命令：

```bash
set SMC_SHOW_NATIVE_MENU_BAR=1
pnpm run dev
```

正式产品包默认仍然使用 frameless。

---

# 四、验收项

## 1. 启动验收

```bash
pnpm run typecheck:node
pnpm run typecheck:web
pnpm run dev
```

必须无以下错误：

```text
Layer not found: aios-home
WebContentsHost shellView API error
Failed to create aios-home view
```

---

## 2. Portal 显示验收

操作：

```text
启动 smc-ai-copilot
进入 aios-home
若 runtime 未启动，点击 RuntimeGuard 按钮
等待 Hermes Gateway / Portal Backend / Portal Frontend running
```

期望：

```text
Portal 页面通过 WebContentsView 显示在工作区
不覆盖左侧菜单
不覆盖 header
```

---

## 3. 菜单覆盖验收

操作：

```text
进入 aios-home
切换到 Chat
切换到 Gateway
切换到 Settings
再切回 aios-home
```

期望：

```text
切出 aios-home 后，Portal WebContentsView 隐藏
其它 React 页面可正常点击
左侧菜单不被透明 native view 覆盖
切回 aios-home 后，WebContentsView 重新按 bounds 显示
```

---

## 4. 更新 / 初始化链路验收

保持之前硬性需求：

```text
smc-ai-copilot 安装 / 更新完成
 -> 检测当前 hermes-agent 状态
 -> 已初始化 + 模型已配置
 -> 跳过 hermes-agent 安装
 -> 跳过大模型配置
 -> 进入应用主页
 -> Portal Runtime 未运行时由 RuntimeGuard 启动 runtime
 -> Runtime ready 后显示 Portal WebContentsView
```

---

## 五、优先提交顺序

```text
1. WebContentsHost 去掉 activate，全量改 setBounds
2. WorkspaceOutlet 条件挂载 aios-home
3. shell-view-ipc 增加 aios-home lazy create / reload
4. 删除 index.ts 启动时提前 create aios-home
5. RuntimeGuard 改为启动完整 runtime
6. Snapshot 使用 getAiOsEnvConfig 动态端口
7. 增加 SMC_SHOW_NATIVE_MENU_BAR 调试开关
```

这 7 个改完后，当前“菜单与 webcontent 显示 ai-os”的问题链路基本闭合。
