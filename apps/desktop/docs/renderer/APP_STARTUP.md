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

**屏幕分支**（`AppScreen` 类型，PRD v1.3.1）：

| screen | 组件 | 触发条件 |
|---|---|---|
| `splash` | `<SplashScreen>` | 初始状态，等待 Main Process 返回决策 |
| `login` | `<LoginScreen>` | 未登录或 bootstrap 待完成 |
| `runtime-recovery` | `<RuntimeRecoveryScreen>` | Runtime 未就绪 / Pairing / Incompatible |
| `main` | `<Layout>` | Runtime Ready 或 Degraded |

**非 main 屏幕**自动隐藏所有 ShellView 层（`hideAllContentShellLayers()`），确保 splash/login/recovery 不显示底层 WebContentsView。

### macOS 拖拽区域

非 `main` 屏幕时渲染 `<div className="drag-region" />`（macOS 标题栏拖拽）。主界面拖拽由 `MainTopBar` 的 `app-drag-region` CSS 类处理。

## 2. useStartupGate Hook

**文件**：`src/renderer/src/hooks/useStartupGate.ts`

**核心逻辑**：

1. 初始 `screen = "splash"`
2. 调用 `window.smcShell.resolveStartupDecision()` → 返回 `StartupDecision`
3. 保证 splash 最少显示 `SPLASH_MIN_MS = 1300ms`
4. 根据 `decision.nextScreen` 设置目标屏幕
5. 若 `decision.error` 存在，设置恢复页错误文案
6. **不**调用 `hermesAPI.verifyInstall` 或任何 Hermes Install IPC

**返回接口**：

```typescript
interface UseStartupGateResult {
  screen: AppScreen;
  installError: string | null;
  setInstallError: (error: string | null) => void;
  navigateTo: (screen: AppScreen) => void;
  recheck: () => void;
}
```

**错误降级**：若 `resolveStartupDecision()` 本身抛异常，默认 `nextScreen = "login"`。

### recheck 机制

`recheck()` 递增内部 `checkKey`，触发 `useEffect` 重新执行 `runDecision()`。用于登录成功、登出、Recovery 重试等。

## 3. 启动门控 IPC 链路

```text
useStartupGate
  → window.smcShell.resolveStartupDecision()
  → IPC startup:resolve-decision
  → desktopBootCoordinator.bootstrap() + resolveStartupDecisionFromRuntime()
```

Desktop 仅连接 Copilot Runtime（默认 `http://127.0.0.1:8765`）。Legacy `~/.hermes/desktop.json` 的 remote/ssh 配置不参与启动路由。
