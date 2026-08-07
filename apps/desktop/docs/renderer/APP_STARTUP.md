# 启动门控与 App 路由

## 1. App.tsx 屏幕路由

`App.tsx` 是 Renderer 入口，通过 `useStartupGate()` 决定当前显示的屏幕。

```text
App
  → ThemeProvider
    → ErrorBoundary
      → AuthProvider (onLogoutComplete → recheck)
        → AppContent
```

**屏幕分支**（`AppScreen` 类型）：

| screen | 组件 | 触发条件 |
|---|---|---|
| `splash` | `<SplashScreen>` | 初始状态，等待 Main Process 返回决策 |
| `login` | `<LoginScreen>` | V3.3 起登录在安装之前（`reason: "auth-required"`） |
| `welcome` | `<Welcome>` | 未安装 Agent / 安装失败 / 背景校验失败 |
| `installing` | `<Install>` | 首次安装 / 重新安装 |
| `setup` | `<Setup>` | 安装完成，进入运行时配置 |
| `main` | `<Layout>` | 一切就绪，进入主界面 |

**非 main 屏幕**自动隐藏所有 ShellView 层（`hideAllContentShellLayers()`），确保 splash/login 不显示底层 WebContentsView。

### macOS 拖拽区域

非 `main` 屏幕时渲染 `<div className="drag-region" />`（macOS 标题栏拖拽）。主界面拖拽由 `MainTopBar` 的 `app-drag-region` CSS 类处理。

### 安装完成流转

```text
Install.onComplete
  → sessionStorage 设置 smc-v13-navigate-runtime-setup / smc-v13-run-doctor
  → navigateTo("setup")

Setup.onComplete
  → sessionStorage 设置 smc-v13-navigate-runtime-setup
  → navigateTo("main")
```

## 2. useStartupGate Hook

**文件**：`src/renderer/src/hooks/useStartupGate.ts`

**核心逻辑**：

1. 初始 `screen = "splash"`
2. 调用 `window.smcShell.resolveStartupDecision()` → 返回 `StartupDecision`
3. 保证 splash 最少显示 `SPLASH_MIN_MS = 1300ms`
4. 根据 `decision.nextScreen` 设置目标屏幕
5. 若 `decision.error` 存在，设置 `installError`
6. 若 `decision.shouldVerifyInBackground`，异步调用 `window.hermesAPI.verifyInstall()`
7. 校验失败且非 updateMode → 回退到 `welcome`

**返回接口**：

```typescript
interface UseStartupGateResult {
  screen: AppScreen;
  installError: string | null;
  setInstallError: (error: string | null) => void;
  navigateTo: (screen: AppScreen) => void;
  recheck: () => void;  // 重置 checkKey，重新触发 useEffect
}
```

**错误降级**：若 `resolveStartupDecision()` 本身抛异常，默认 `nextScreen = "login"`、`connectionMode = "local"`。

### recheck 机制

`recheck()` 递增内部 `checkKey`，触发 `useEffect` 重新执行 `runDecision()`。用于：

- 登录成功后（`LoginScreen.onSuccess = recheck`）
- AuthProvider 登出完成后
- 手动重试安装

## 3. 启动门控 IPC 链路

```text
Renderer: window.smcShell.resolveStartupDecision()
  → Preload: shell-api.ts → ipcRenderer.invoke("startup:resolve-decision")
    → Main: startup-ipc.ts → startup-decision.ts
      → 依次检查：auth → bootstrap → Hermes 安装/配置
      → 返回 StartupDecision { nextScreen, runtime, connectionMode, ... }
```

`StartupDecision` 类型定义于 `src/shared/startup/startup-contract.ts`。

## 4. AuthProvider

包裹整个 `App` 内容，提供：

- 登录状态管理
- `pendingBootstrapDiff` — 配置差异确认
- `onLogoutComplete` → 触发 `recheck()` 重新走门控

## 5. LoginScreen

**文件**：`src/renderer/src/modules/auth/LoginScreen.tsx`

- 调用 `window.desktopAuth.saveEndpointConfig()` + `window.desktopAuth.login({ email, password })`
- 成功后调用 `window.desktopUserConfig.bootstrap()` 合成本地配置
- 完成后调用 `onSuccess` (= `recheck`)
