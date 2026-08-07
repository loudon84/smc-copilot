# Hooks 概览

所有 Hooks 位于 `src/renderer/src/hooks/`。

## 1. useStartupGate

**文件**：`useStartupGate.ts`

**职责**：启动门控，决定 App 当前显示的屏幕。

**返回**：
```typescript
{
  screen: AppScreen;           // "splash" | "login" | "welcome" | "installing" | "setup" | "main"
  installError: string | null;
  setInstallError: (error: string | null) => void;
  navigateTo: (screen: AppScreen) => void;
  recheck: () => void;
}
```

**核心流程**：
1. 初始 `screen = "splash"`
2. 调用 `window.smcShell.resolveStartupDecision()` → 获取 `StartupDecision`
3. 保证 splash 最少 1300ms
4. 根据 `decision.nextScreen` 设置目标屏幕
5. `shouldVerifyInBackground` 时异步 `verifyInstall()`
6. `recheck()` 递增 `checkKey` 重新触发决策

**详见**：[APP_STARTUP.md](APP_STARTUP.md)

## 2. useDesktopNavigation

**文件**：`useDesktopNavigation.ts`

**职责**：管理当前活跃视图与 Profile 选择。

**返回**：
```typescript
{
  view: View;                  // 当前活跃视图，默认 "portal"
  activeProfile: string;       // 当前 Profile，默认 "default"
  officeVisited: boolean;
  setOfficeVisited: (visited: boolean) => void;
  handleSelectProfile: (name: string) => void;
  navigateToView: (next: View) => void;
}
```

**注意**：`navigateToView("office")` 会自动标记 `officeVisited = true`（Office 首次延迟渲染）。

## 3. useUpdateState

**文件**：`useUpdateState.ts`

**职责**：监听应用更新事件，管理更新状态机。

**返回**：
```typescript
{
  updateVersion: string | null;
  updateState: UpdateState;    // null | "available" | "downloading" | "ready"
  downloadPercent: number;
  updateError: string | null;
  handleUpdate: () => Promise<void>;
}
```

**事件源**：`window.hermesAPI.onUpdateAvailable` / `onUpdateDownloadProgress` / `onUpdateDownloaded` / `onUpdateError`

**handleUpdate 逻辑**：
- `available` → `downloadUpdate()` + 状态变为 `downloading`
- `ready` → `installUpdate()`

## 4. useRemoteMode

**文件**：`useRemoteMode.ts`

**职责**：判断当前是否为远程模式。

**签名**：`useRemoteMode(view: View): boolean`

**实现**：每次 `view` 变更时调用 `window.hermesAPI.isRemoteOnlyMode()`。

## 5. useProfileEntries

**文件**：`useProfileEntries.ts`

**职责**：获取 Profile 入口列表。

**签名**：`useProfileEntries(): ProfileEntrySummary[]`

**实现**：mount 时调用 `window.profileEntry.listProfileEntries()`，仅查询一次。

## 6. useShellLayerVisibility

**文件**：`useShellLayerVisibility.ts`

**职责**：同步 ShellView 层可见性，确保非活跃层被隐藏。

**签名**：`useShellLayerVisibility(activeView, externalTabIds, enabled): void`

**导出函数**：
- `syncInactiveShellLayers(activeView, externalTabIds)` — 隐藏非活跃层
- `hideAllContentShellLayers()` — 隐藏所有静态层（splash/login 阶段）

**静态 ShellView 层**：`["portal", "web-operator"]`

## 7. useDiscoveredModels

**文件**：`useDiscoveredModels.ts`

**职责**：通过 HTTP `/models` 端点发现可用模型列表。

**签名**：
```typescript
useDiscoveredModels({
  provider, baseUrl?, apiKey?, profile?, enabled?, refreshToken?
}): { models: string[]; status: DiscoveryStatus }
```

**DiscoveryStatus**：`"idle" | "loading" | "ok" | "unsupported" | "no-key" | "error"`

**核心流程**：
1. `provider === "auto"` → 不发现
2. 解析 baseUrl（`resolveBaseUrl`）
3. 解析 API Key（优先传入 → `resolveEnvKey` → `window.hermesAPI.getEnv(profile)`)
4. `fetch(baseUrl/models)` → 提取 `data[].id` → 排序返回

**用途**：Setup 页面模型选择器。
