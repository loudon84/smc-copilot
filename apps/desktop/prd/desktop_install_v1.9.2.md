## 结论

当前不是菜单问题，也不是 `WorkspaceOutlet` 入口缺失。`WorkspaceOutlet` 已经在 `view === "aios-home"` 时挂载 `AIOSHomeScreen`。问题在 `AIOSHomeScreen` 内部：它先判断 runtime `ready`，只有 `ready === true` 才挂载 `WebContentsHost`，导致 `aios-home` 的 WebContentsView 根本没有被创建。

本次应改为：

```txt
进入 aios-home
  -> 直接挂载 WebContentsHost
  -> ShellViewManager lazy create aios-home WebContentsView
  -> 加载 http://127.0.0.1:3000/zh
  -> runtime 状态只作为状态栏 / 启动引导，不作为 WebContentsHost 挂载门禁
```

注意：目标 URL 应使用：

```txt
http://127.0.0.1:3000/zh
```

不是：

```txt
http://127.0.01:3000/zh
```

---

## 当前代码根因

### 1. `AIOSHomeScreen` 的挂载门禁过严

当前 `AIOSHomeScreen` 逻辑：

```tsx
const snapshot = await window.hermesAPI.getAiOsRuntimeSnapshot();
setServices(snapshot.services);
setReady(snapshot.ready);
...
{loading ? ... : ready ? (
  <WebContentsHost layerId="aios-home" className="h-full w-full" />
) : (
  <RuntimeGuard ... />
)}
```

这导致只要 `snapshot.ready === false`，`WebContentsHost` 就不会挂载。

### 2. `snapshot.ready` 要求所有服务 running

`getAiOsRuntimeSnapshot()` 当前定义：

```ts
const ready = services.every((s) => s.status === "running");
```

服务包括：

```txt
hermes-gateway
aios-backend
aios-frontend
```

所以只要 Hermes Gateway 或 Backend 任一项不是 running，即使 `http://127.0.0.1:3000/zh` 可访问，`ready` 仍然是 false，页面不会挂载。

### 3. Renderer 调用的 API 与 preload 实现不一致

`AIOSHomeScreen` 调用的是：

```ts
window.hermesAPI.getAiOsRuntimeSnapshot()
```

但 `preload/aios-api.ts` 暴露的是 `window.aiosRuntime`，里面没有 `getRuntimeSnapshot()`。

Main 侧实际注册的 IPC 是：

```ts
ipcMain.handle("aios:get-runtime-snapshot", () => {
  return getAiOsRuntimeSnapshot();
});
```

也就是说 Main 有 handler，但 Preload 没有完整桥接。

### 4. `WebContentsHost` 本身路径是正确的

`WebContentsHost` 会读取 DOM bounds，然后调用：

```ts
window.shellView.setBounds(layerId, bounds);
```

这个会进入 Main Process 的 `shell:view:set-bounds`，再由 `ShellViewManager` 激活对应 View。

Main 侧 `shell-view-ipc.ts` 已经对 `aios-home` 做了 lazy create，并且 URL 是：

```ts
return `http://127.0.0.1:${config.frontendPort}/zh`;
```

默认端口来自 `DEFAULT_FRONTEND_PORT = 3000`。 

---

# 修复方案

## P0-1：修复 preload API 契约

### 修改文件

```txt
src/shared/aios/aios-contract.ts
```

在 `AiOsAPI` 中增加：

```ts
getRuntimeSnapshot(): Promise<AiOsRuntimeSnapshot>;
```

修改后片段：

```ts
export interface AiOsAPI {
  getRuntimeStatus(): Promise<AiOsRuntimeStatus>;
  getRuntimeSnapshot(): Promise<AiOsRuntimeSnapshot>;

  installAiOs(options: AiOsInstallOptions): Promise<AiOsInstallResult>;
  startAiOs(): Promise<AiOsRuntimeStatus>;
  stopAiOs(): Promise<AiOsRuntimeStatus>;
  restartAiOs(): Promise<AiOsRuntimeStatus>;

  openAiOsHome(): Promise<void>;
  reloadAiOsHome(): Promise<void>;
  setAiOsViewBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void>;

  getAiOsLogs(
    service: AiOsServiceId,
    options?: AiOsLogQueryOptions,
  ): Promise<AiOsLogEntry[]>;

  runDoctor(): Promise<AiOsDoctorReport>;
  reconcile(): Promise<AiOsReconcileResult>;
  checkPorts(): Promise<PortCheckResult[]>;

  onAiOsRuntimeChanged(
    callback: (event: RuntimeStatusChangeEvent) => void,
  ): () => void;
}
```

---

## P0-2：补齐 preload 实现

### 修改文件

```txt
src/preload/aios-api.ts
```

增加：

```ts
getRuntimeSnapshot: () => ipcRenderer.invoke("aios:get-runtime-snapshot"),
```

修改后片段：

```ts
export const aiosApi: AiOsAPI = {
  getRuntimeStatus: () => ipcRenderer.invoke("aios:get-runtime-status"),

  getRuntimeSnapshot: () =>
    ipcRenderer.invoke("aios:get-runtime-snapshot"),

  installAiOs: (options) => ipcRenderer.invoke("aios:install", options),

  startAiOs: () => ipcRenderer.invoke("aios:start"),

  stopAiOs: () => ipcRenderer.invoke("aios:stop"),

  restartAiOs: () => ipcRenderer.invoke("aios:restart"),

  openAiOsHome: () => ipcRenderer.invoke("aios:view:load-home"),

  reloadAiOsHome: () => ipcRenderer.invoke("aios:view:reload"),

  setAiOsViewBounds: (bounds) =>
    ipcRenderer.invoke("aios:view:set-bounds", bounds),

  getAiOsLogs: (service, options?) =>
    ipcRenderer.invoke("aios:get-logs", service, options),

  runDoctor: () => ipcRenderer.invoke("aios:doctor"),

  reconcile: () => ipcRenderer.invoke("aios:reconcile"),

  checkPorts: () => ipcRenderer.invoke("aios:check-ports"),

  onAiOsRuntimeChanged: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: RuntimeStatusChangeEvent,
    ) => callback(data);

    ipcRenderer.on("aios:runtime-changed", handler);

    return () => ipcRenderer.removeListener("aios:runtime-changed", handler);
  },
};
```

---

## P0-3：修改 `AIOSHomeScreen`，不要用全局 ready 阻断 WebContentsHost

### 修改文件

```txt
src/renderer/src/screens/AIOSHome/AIOSHomeScreen.tsx
```

### 替换当前实现为下面版本

```tsx
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RuntimeGuard } from "../../components/runtime/RuntimeGuard";
import { RuntimeStatusBar } from "../../components/runtime/RuntimeStatusBar";
import { WebContentsHost } from "../../components/shell/WebContentsHost";
import { Spinner } from "../../assets/icons";
import type { View } from "../../types/desktop-shell";
import type { RuntimeServiceRecord } from "../../../../shared/aios/aios-contract";

export interface AIOSHomeScreenProps {
  onNavigate: (view: View) => void;
}

export function AIOSHomeScreen({
  onNavigate,
}: AIOSHomeScreenProps): React.JSX.Element {
  const { t } = useTranslation("aiosHome");
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<RuntimeServiceRecord[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const snapshot = await window.aiosRuntime.getRuntimeSnapshot();
      setServices(snapshot.services);
      setStatusError(null);
    } catch (err) {
      console.warn("[AIOSHome] Failed to refresh Portal runtime snapshot:", err);
      setStatusError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();

    const interval = setInterval(() => {
      void refreshStatus();
    }, 10_000);

    return () => clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    try {
      const unsub = window.aiosRuntime.onAiOsRuntimeChanged(() => {
        void refreshStatus();
      });

      return unsub;
    } catch {
      return undefined;
    }
  }, [refreshStatus]);

  const gatewayRecord = services.find(
    (s) => s.service_id === "hermes-gateway",
  );

  const frontendRecord = services.find(
    (s) => s.service_id === "aios-frontend",
  );

  const gatewayStatus =
    gatewayRecord?.status === "running"
      ? "running"
      : gatewayRecord?.status === "error"
        ? "error"
        : "stopped";

  /**
   * 核心规则：
   * 1. WebContentsHost 的挂载只依赖 aios-home 路由，不再依赖 Hermes Gateway / Backend 全部 ready。
   * 2. 如果 snapshot 失败，采用 fail-open，让 ShellViewManager 真实加载 http://127.0.0.1:3000/zh。
   * 3. 只有明确检测到 aios-frontend stopped/error 时，才显示 RuntimeGuard。
   */
  const frontendKnownDown =
    !loading &&
    !statusError &&
    services.length > 0 &&
    frontendRecord?.status !== "running";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RuntimeStatusBar services={services} loading={loading} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={24} className="animate-spin text-zinc-500" />
            <span className="sr-only">{t("loadingRuntime")}</span>
          </div>
        ) : frontendKnownDown ? (
          <RuntimeGuard
            gatewayStatus={gatewayStatus}
            onNavigate={onNavigate}
            onStarted={refreshStatus}
          />
        ) : (
          <WebContentsHost
            layerId="aios-home"
            className="h-full w-full min-h-0"
          />
        )}
      </div>
    </div>
  );
}
```

### 这个改动解决的问题

原逻辑：

```txt
Hermes Gateway 不 running
  -> snapshot.ready = false
  -> WebContentsHost 不挂载
  -> aios-home 永远不加载
```

新逻辑：

```txt
进入 aios-home
  -> 只要没有明确判断 aios-frontend down
  -> 挂载 WebContentsHost
  -> shell:view:set-bounds
  -> Main lazy create aios-home
  -> WebContentsView 加载 http://127.0.0.1:3000/zh
```

---

## P0-4：增强 `shell-view-ipc.ts`，确保 URL 变更时会 reload

当前 `ensureAiosHomeView()` 只在空 URL、`about:blank`、`chrome-error://`、loading、destroyed 时 reload。若之前加载过错误端口、旧 URL 或错误 host，它不会强制切回正确 URL。

### 修改文件

```txt
src/main/shell/shell-view-ipc.ts
```

### 增加 URL 归一化函数

```ts
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}
```

### 修改 `shouldReload`

替换：

```ts
const shouldReload =
  !currentUrl ||
  currentUrl === "about:blank" ||
  currentUrl.startsWith("chrome-error://") ||
  state === "creating" ||
  state === "loading" ||
  state === "destroyed";
```

为：

```ts
const shouldReload =
  !currentUrl ||
  currentUrl === "about:blank" ||
  currentUrl.startsWith("chrome-error://") ||
  normalizeUrl(currentUrl) !== normalizeUrl(url) ||
  state === "creating" ||
  state === "loading" ||
  state === "destroyed";
```

完整局部片段：

```ts
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

async function ensureAiosHomeView(svm: ShellViewManager): Promise<void> {
  const url = getAiOsHomeUrl();
  const existing = svm.getView("aios-home");

  if (!existing) {
    await svm.createView("aios-home", "aios-home", url, {
      layer: "content",
    });

    console.log(`[SHELL-IPC] Lazy created aios-home view: ${url}`);
    return;
  }

  const webContents = existing.getWebContents?.();
  const currentUrl = webContents?.getURL?.() ?? "";
  const state = existing.getState?.() ?? "unknown";

  const shouldReload =
    !currentUrl ||
    currentUrl === "about:blank" ||
    currentUrl.startsWith("chrome-error://") ||
    normalizeUrl(currentUrl) !== normalizeUrl(url) ||
    state === "creating" ||
    state === "loading" ||
    state === "destroyed";

  if (shouldReload) {
    try {
      await existing.load?.(url);
      console.log(`[SHELL-IPC] Reloaded aios-home view: ${url}`);
    } catch (err) {
      console.warn("[SHELL-IPC] Failed to reload aios-home, recreating:", err);

      svm.destroyView?.("aios-home");

      await svm.createView("aios-home", "aios-home", url, {
        layer: "content",
      });

      console.log(`[SHELL-IPC] Recreated aios-home view: ${url}`);
    }
  }
}
```

---

## P0-5：不要再走旧的 `aios:view:*` 路径

当前 `aios-api.ts` 里还有旧接口：

```ts
openAiOsHome: () => ipcRenderer.invoke("aios:view:load-home"),
reloadAiOsHome: () => ipcRenderer.invoke("aios:view:reload"),
setAiOsViewBounds: (bounds) => ipcRenderer.invoke("aios:view:set-bounds", bounds),
```

但 `aios-ipc.ts` 当前没有注册这些 handler，只注册了 runtime/status/start/stop/restart/logs/doctor/reconcile/checkPorts。

当前新架构应统一使用：

```txt
Renderer WebContentsHost
  -> window.shellView.setBounds("aios-home", bounds)
  -> shell:view:set-bounds
  -> ensureAiosHomeView()
  -> ShellViewManager.activateView()
```

不再使用：

```txt
aios:view:load-home
aios:view:set-bounds
```

这三个旧接口暂时保留类型兼容可以，但不要在新页面调用。

---

## 验收步骤

### 1. 确认 Portal 前端可访问

在 Windows PowerShell 执行：

```powershell
curl.exe -I http://127.0.0.1:3000/zh
```

预期至少返回：

```txt
HTTP/1.1 200
```

或 Next.js redirect/HTML 响应。不能是 connection refused。

### 2. 启动桌面

```powershell
pnpm run dev
```

### 3. Renderer DevTools 检查

不应再出现：

```txt
window.hermesAPI.getAiOsRuntimeSnapshot is not a function
```

或：

```txt
No handler registered for 'aios:get-runtime-snapshot'
```

### 4. Main Process 日志应出现

```txt
[SHELL-IPC] ShellView IPC handlers registered
[SHELL-IPC] Lazy created aios-home view: http://127.0.0.1:3000/zh
```

或：

```txt
[SHELL-IPC] Reloaded aios-home view: http://127.0.0.1:3000/zh
```

### 5. 页面显示结果

进入应用主页后，左侧菜单选中 `Portal Home`，中间区域应由 Electron `WebContentsView` 真实显示：

```txt
http://127.0.0.1:3000/zh
```

---

## 最小修复清单

```txt
src/shared/aios/aios-contract.ts
  - AiOsAPI 增加 getRuntimeSnapshot()

src/preload/aios-api.ts
  - aiosApi 增加 getRuntimeSnapshot -> aios:get-runtime-snapshot

src/renderer/src/screens/AIOSHome/AIOSHomeScreen.tsx
  - 改用 window.aiosRuntime.getRuntimeSnapshot()
  - WebContentsHost 不再依赖 snapshot.ready
  - 只在明确 aios-frontend down 时显示 RuntimeGuard

src/main/shell/shell-view-ipc.ts
  - ensureAiosHomeView 增加 currentUrl 与目标 URL 对比
  - 目标 URL 固定来自 getAiOsEnvConfig().frontendPort
  - 默认真实加载 http://127.0.0.1:3000/zh
```

执行以上 P0 修复后，`WorkspaceOutlet` 的 `aios-home` 条件挂载链路会打通，Portal 页面由 `WebContentsView` 真实承载，不再被 Hermes Gateway / Backend 的 runtime ready 状态误阻断。
