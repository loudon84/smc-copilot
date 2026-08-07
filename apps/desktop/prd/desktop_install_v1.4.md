# PRD：Hermes Desktop v1.3.1 基于 Chatbox 参考点的 Windows Installer 与 Desktop Shell 优化

文档版本：`v1.3.1-opt-01`
实施方式：方案 A
目标代码库：`loudon84/ai-os-desktop`
Cursor 目标：可直接生成 `.plan` 与文件级任务

---

## 0. 设计决策

采用方案 A：

```text
NSIS Installer
  只负责 Windows 标准安装器能力：
  - 安装目录选择
  - 安装前环境预检查
  - runtime/bin 目录初始化
  - registry 写入
  - User PATH 写入
  - 快捷方式
  - 卸载清理

Electron First Run Wizard
  继续负责 Hermes Agent 来源选择与安装：
  - local zip
  - git clone
  - runtime config 写入
  - hermes.cmd shim 刷新
  - doctor / verify / repair
```

不把 `local zip / git clone / Python venv / pip install / uv sync` 放进 NSIS。

---

## 1. 当前 v1.3.1 源码基线

### 1.1 Installer 已经具备 assisted installer 基础

当前 `electron-builder.yml` 已经配置：

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
  selectPerMachineByDefault: false
  deleteAppDataOnUninstall: false
  include: build/installer.nsh
```

这说明 v1.3.1 已经不是 one-click 安装器，已经允许用户选择安装目录，并且当前策略是 per-user 安装。

当前 `build/installer.nsh` 已经实现：

```text
preInit:
  - 读取 HKCU/HKLM/legacy registry
  - 复用旧安装目录
  - 首次安装默认 $LOCALAPPDATA\Programs\SMC Copilot

customInstall:
  - 创建 $INSTDIR\bin
  - 创建 $INSTDIR\runtime
  - 创建 $INSTDIR\runtime\hermes-agent
  - 创建 logs/cache/downloads
  - 生成 smc-copilot.cmd
  - 生成 hermes-desktop.cmd
  - 生成 hermes.cmd placeholder
  - 写入 desktop-runtime.json
  - 写入 Software\SMC\Copilot registry
  - AddToPathSafe 写入 PATH
  - 清理旧 Hermes 快捷方式

customUnInstall:
  - RemoveFromPathSafe
  - 删除 registry
  - 广播 WM_SETTINGCHANGE
```

这部分已经覆盖 Chatbox 的 assisted installer 基础能力，但缺少安装前环境检查页面/逻辑增强。

---

### 1.2 First Run Wizard 已经适合承接 Agent 来源选择

当前 `first-run-wizard.ts` 已经包含：

```text
detect-agent
select-source
start-install
cancel-install
select-zip-file
on-progress
on-state-change
```

并且安装过程使用：

```text
resolveInstallLocation()
installHermesAgentFromUserSource()
updateHermesShim()
createDefaultRuntimeConfig()
writeRuntimeConfig()
```

说明 Hermes Agent 来源选择和安装闭环已经在 Electron 内部完成，适合继续保留在 Electron First Run Wizard。

---

### 1.3 Enterprise Install Pipeline 已经存在

当前 `enterprise-installer.ts` 已经实现企业安装流水线：

```text
load deployment config
acquire install lock
run preflight
resolve runtime bundle
install hermes-agent source
create/reuse venv
install python dependencies
provision ~/.hermes
bootstrap profiles
install bundled skills
write install marker
run doctor
repair
update
rollback placeholder
open log dir
export doctor report
```

这部分不能被 NSIS 替代。NSIS 只做安装器层，Electron 继续做 runtime/bootstrap 层。

---

### 1.4 安装目录解析已经完成

当前 `install-location-resolver.ts` 已经支持：

```text
SMC_COPILOT_INSTALL_DIR
HERMES_DESKTOP_INSTALL_DIR
HKCU\Software\SMC\Copilot
HKLM\Software\SMC\Copilot
Legacy registry
process.execPath
dev-default
```

并统一输出：

```ts
interface DesktopInstallLocation {
  installDir: string
  runtimeRoot: string
  binDir: string
  agentDir: string
  source: PathResolutionSource
}
```

这说明后续 Installer 与 First Run Wizard 必须继续使用 `resolveInstallLocation()`，不能重新硬编码路径。

---

### 1.5 当前 Layout 是单文件状态机式布局

当前 `Layout.tsx` 负责：

```text
Sidebar
NAV_ITEMS
View state
Profile entries
Remote mode
Update state
Chat messages
Session resume
Screen rendering
Profile workspace rendering
Runtime setup rendering
Web Operator rendering
```

`Layout.tsx` 现在是主入口 + Sidebar + Workspace 渲染集中在一个文件中，已经接入 `RuntimeSetupScreen`、`WebOperatorScreen`、`ProfileRuntimeScreen`、`AIOSWorkspaceScreen`、`ProfileWorkspaceScreen`。

当前 `App.tsx` 负责 Splash / Welcome / Install / Setup / Main 流程切换，并在本地模式下执行 `checkInstall()` 和 `verifyInstall()`，远程/SSH 模式下走远程连接逻辑。 

---

## 2. Chatbox 参考点抽取

### 2.1 Installer 参考点

Chatbox 的 `electron-builder.yml` 使用：

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  include: assets/installer.nsh
```

这与当前 Hermes Desktop v1.3.1 的安装器方向一致。

Chatbox 的 `installer.nsh` 在 `customInit` 阶段检查 VC++ Runtime，不满足时下载并安装 `vc_redist.x64.exe`，失败则中止安装。该模式可用于 Hermes Desktop 的“安装前环境检查”，但不能照搬为 Python/Git 安装流程。

---

### 2.2 Layout 参考点

Chatbox 的 root layout 包含：

```text
Provider Layer
  - Theme Provider
  - Modal Provider
  - ErrorBoundary

Root Layout
  - Sidebar
  - Outlet
  - Dialogs
  - SearchDialog
  - Toasts
  - SettingsModal
```

同时它在 Root 中使用 `Sidebar + Outlet` 作为主工作区结构，并集中挂载全局 Modal/Dialog/Toast。

Hermes Desktop 不引入 Mantine、MUI、TanStack Router、NiceModal。只吸收结构模式：

```text
Sidebar + WorkspaceOutlet + Page/Header + WindowControls + Modal Layer
```

---

# 3. 优化目标

## 3.1 Installer 目标

在 v1.3.1 现有安装器基础上增强：

```text
1. 保留 assisted installer
2. 保留用户选择安装目录
3. 增强 NSIS customInit 安装前检查
4. 保留 User PATH 写入
5. 保留 runtime/bin 目录结构
6. 保留 legacy install migration
7. 保留 First Run Wizard 承接 Agent 来源选择
8. 增强安装完成后的 runtime handoff
9. 保证安装完成后 Hermes Desktop 能正常启动
```

---

## 3.2 Layout 目标

在不改变 UI 技术栈前提下，将当前单文件 Layout 拆分为：

```text
DesktopShell
  ├─ Sidebar
  ├─ PageHeader
  ├─ WorkspaceOutlet
  ├─ WindowControls
  ├─ ModalLayer
  ├─ DrawerLayer
  └─ StatusBar
```

保留当前 View 状态模型，不强行引入 React Router / TanStack Router。

---

# 4. 非目标

以下内容不在本次变更范围：

```text
1. 不引入 Mantine
2. 不引入 MUI
3. 不引入 TanStack Router
4. 不改 Hermes Gateway API
5. 不改 Web Operator Tool Protocol
6. 不把 Python venv / pip install 放进 NSIS
7. 不把 Git token 暴露到 Renderer
8. 不删除现有 Welcome / Install / Setup / RuntimeSetup 流程
9. 不改变 remote / ssh / local 三种连接模式
10. 不破坏 existing profile workspace / web operator / runtime setup
```

---

# 5. Installer 功能 PRD

## 5.1 功能名称

`Windows Assisted Installer Hardening`

---

## 5.2 用户路径

```text
用户运行 setup.exe
  ↓
NSIS 安装器启动
  ↓
customInit 执行安装前检查
  ↓
用户选择安装目录
  ↓
安装 Electron App
  ↓
customInstall 创建 bin/runtime/logs/cache/downloads
  ↓
写 registry + User PATH
  ↓
创建快捷方式
  ↓
启动 Hermes Desktop
  ↓
App.tsx 执行 checkInstall
  ↓
未安装 Hermes Agent 时进入 Welcome / Install / First Run Wizard
  ↓
用户选择 local zip 或 git clone
  ↓
Electron 安装 Hermes Agent 到 resolveInstallLocation().agentDir
  ↓
RuntimeSetupScreen 执行 doctor
```

---

## 5.3 NSIS customInit 增强

### 5.3.1 新增检查项

在 `build/installer.nsh` 的 `customInit` 中新增：

```text
1. Windows 版本检查
2. VC++ Runtime 检查
3. 旧安装目录可写性检查
4. 目标安装目录父目录可写性检查
5. 端口占用只提示，不阻断
6. Git / Python / uv 只提示，不阻断
```

阻断项：

```text
Windows < 10
VC++ Runtime 缺失且用户拒绝安装
目标安装目录不可写
```

非阻断项：

```text
Git 缺失
Python 缺失
uv 缺失
8642 端口占用
旧版 registry 存在
```

原因：

```text
Git/Python/uv 属于 Electron Runtime Doctor 范围，不属于 NSIS 安装器强阻断范围。
```

---

## 5.4 NSIS customInstall 保留项

现有 `customInstall` 中以下能力必须保留：

```text
$INSTDIR\bin
$INSTDIR\runtime
$INSTDIR\runtime\hermes-agent
$INSTDIR\runtime\logs
$INSTDIR\runtime\cache
$INSTDIR\runtime\downloads

smc-copilot.cmd
hermes-desktop.cmd
hermes.cmd placeholder
desktop-runtime.json
HKCU\Software\SMC\Copilot
AddToPathSafe "$INSTDIR\bin"
WM_SETTINGCHANGE
legacy shortcut cleanup
```

不得删除。

---

## 5.5 NSIS customInstall 增强项

新增文件：

```text
$INSTDIR\runtime\installer-precheck.json
$INSTDIR\runtime\logs\nsis-install.log
```

`installer-precheck.json` 示例：

```json
{
  "schemaVersion": "1.3.1",
  "createdAt": "2026-05-17T00:00:00.000Z",
  "windowsVersion": "10.0.19045",
  "vcRuntime": "pass",
  "git": "missing",
  "python": "missing",
  "uv": "missing",
  "port8642": "occupied",
  "installDir": "D:\\AIOS\\SMC Copilot",
  "runtimeRoot": "D:\\AIOS\\SMC Copilot\\runtime",
  "binDir": "D:\\AIOS\\SMC Copilot\\bin",
  "result": "warning"
}
```

Renderer 的 `RuntimeSetupScreen` 读取该文件后展示“安装器预检结果”。

---

## 5.6 Electron Builder 配置目标

保留现有配置：

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
  selectPerMachineByDefault: false
  deleteAppDataOnUninstall: false
  include: build/installer.nsh
```

新增或确认：

```yaml
win:
  executableName: smc-ai-copilot
  target:
    - target: nsis
      arch:
        - x64

asarUnpack:
  - resources/**
  - node_modules/better-sqlite3/**
```

保持当前 `perMachine: false`。企业内部 Windows 10 Home 环境下，per-user 安装风险低于 Program Files per-machine 安装。

---

## 5.7 First Run Wizard 衔接要求

`first-run-wizard.ts` 保持为 Hermes Agent 来源选择唯一入口：

```text
local zip
git clone
cancel
progress
state change
runtime config
shim refresh
```

不得新增 NSIS 版 Git clone 页面。

增强项：

```text
1. detect-agent 读取 installer-precheck.json
2. start-install 前检查 resolveInstallLocation().agentDir 是否可写
3. start-install 完成后写入 desktop-runtime.json 的 agentSource
4. start-install 完成后自动调用 enterprise:run-doctor
5. 失败时保留 install log path
```

---

## 5.8 Installer 验收标准

```text
A. 全新安装
  1. setup.exe 显示标准安装向导
  2. 用户可以选择安装目录
  3. 安装完成后 $INSTDIR\bin 存在
  4. 安装完成后 $INSTDIR\runtime 存在
  5. 安装完成后 HKCU\Software\SMC\Copilot 存在
  6. User PATH 包含 $INSTDIR\bin
  7. 启动 App 后进入现有 Welcome / Install / Setup / Main 流程

B. 覆盖安装
  1. preInit 能读取旧 InstallLocation
  2. 不删除 ~/.hermes
  3. 不删除 runtime\hermes-agent
  4. 不删除 desktop-runtime.json
  5. 旧快捷方式被清理
  6. 新快捷方式可启动

C. 卸载
  1. 从 PATH 移除 $INSTDIR\bin
  2. 删除 HKCU\Software\SMC\Copilot
  3. deleteAppDataOnUninstall=false
  4. 用户数据不被删除

D. 缺 Git/Python/uv
  1. NSIS 不阻断
  2. RuntimeSetupScreen 显示缺失项
  3. First Run Wizard 可以继续显示安装源选择
```

---

# 6. Desktop Shell 功能 PRD

## 6.1 功能名称

`Desktop Shell Layout Refactor`

---

## 6.2 当前问题

当前 `Layout.tsx` 同时承担：

```text
1. View 类型定义
2. Sidebar 渲染
3. Navigation 渲染
4. Update 状态
5. Profile 状态
6. Remote mode 状态
7. Workspace 渲染
8. Session resume
9. Chat state
10. Runtime/Profile/WebOperator 页面挂载
```

该结构继续扩展 WindowControls、Modal Layer、Drawer Layer 后会继续膨胀。

---

## 6.3 目标结构

新增：

```text
src/renderer/src/components/layout/
  DesktopShell.tsx
  Sidebar.tsx
  PageHeader.tsx
  WorkspaceOutlet.tsx
  WindowControls.tsx
  ModalLayer.tsx
  DrawerLayer.tsx
  StatusBar.tsx

src/renderer/src/hooks/
  useDesktopNavigation.ts
  useUpdateState.ts
  useRemoteMode.ts
  useProfileEntries.ts

src/renderer/src/types/
  desktop-shell.ts
```

保留：

```text
src/renderer/src/screens/Layout/Layout.tsx
```

`Layout.tsx` 改为编排层，不再直接包含全部 JSX。

---

## 6.4 DesktopShell

### 输入

```ts
interface DesktopShellProps {
  sidebar: React.ReactNode
  header: React.ReactNode
  outlet: React.ReactNode
  modalLayer?: React.ReactNode
  drawerLayer?: React.ReactNode
  statusBar?: React.ReactNode
}
```

### DOM 结构

```tsx
<div className="desktop-shell">
  <aside className="desktop-shell__sidebar">{sidebar}</aside>
  <section className="desktop-shell__main">
    <header className="desktop-shell__header">{header}</header>
    <main className="desktop-shell__outlet">{outlet}</main>
    <footer className="desktop-shell__status">{statusBar}</footer>
  </section>
  {modalLayer}
  {drawerLayer}
</div>
```

### 要求

```text
1. 不引入第三方 UI 库
2. 使用现有 CSS / Tailwind / shadcn/ui
3. 保持现有 .layout / .sidebar / .content 样式兼容期
4. 首轮不改页面视觉，只改结构
5. 不改 Chat/Sessions/Agents/Gateway 等业务组件
```

---

## 6.5 Sidebar

从当前 `Layout.tsx` 抽离：

```text
sidebar-brand
NAV_ITEMS
Portal group
Experts group
Runtime group
update button
update error
active profile footer
```

### Props

```ts
interface DesktopSidebarProps {
  view: View
  navItems: NavItem[]
  profileEntries: ProfileEntrySummary[]
  activeProfile: string
  updateState: UpdateState | null
  updateError: string | null
  updateVersion: string | null
  downloadPercent: number
  onNavigate: (view: View) => void
  onUpdate: () => Promise<void>
}
```

### 保留行为

```text
1. office 首次访问 lazy mount 标记
2. profile-workspace:${profileId}
3. Portal / Experts / Runtime 分组
4. update available/downloading/ready
5. active item 样式
```

---

## 6.6 WorkspaceOutlet

替代当前 `main.content` 内的大量条件渲染。

### Props

```ts
interface WorkspaceOutletProps {
  view: View
  remoteMode: boolean
  activeProfile: string
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  currentSessionId: string | null
  officeVisited: boolean
  onNewChat: () => void
  onResumeSession: (sessionId: string) => Promise<void>
  onSelectProfile: (name: string) => void
  onChatWithProfile: (name: string) => void
}
```

### 渲染职责

```text
chat
sessions
agents
office
models
providers
skills
soul
memory
tools
schedules
gateway
web-operator
runtime-setup
profile-runtime
aios-workspace
profile-workspace:${profileId}
settings
```

### 保留行为

```text
1. Chat 使用 display none 保持挂载
2. Office lazy mount 后保持挂载
3. Providers 使用 visible prop
4. Settings 使用 display none 保持挂载
5. remoteMode 下显示 RemoteNotice
```

---

## 6.7 PageHeader

新增统一桌面 Header，但第一阶段只在 Shell 层使用，不强制改所有 Screen。

### 内容

```text
Sidebar toggle placeholder
Current view title
Current profile
Runtime status placeholder
Actions slot
WindowControls
```

### Props

```ts
interface PageHeaderProps {
  view: View
  activeProfile: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}
```

---

## 6.8 WindowControls

### 目标

为 Windows/Linux 提供自定义窗口按钮：

```text
minimize
maximize / restore
close
```

### Renderer 规则

```text
Renderer 不能直接 import electron。
Renderer 只能调用 window.hermesAPI 或 window.desktopWindowAPI。
```

### Preload API

新增：

```ts
window.desktopWindow = {
  minimize(): Promise<void>
  maximizeOrRestore(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizedChange(callback): () => void
}
```

也可以合并进现有 `window.hermesAPI`，但必须保持类型声明。

### Main IPC

新增：

```text
window:minimize
window:maximize-or-restore
window:close
window:is-maximized
window:on-maximized-change
```

### 显示规则

```text
Windows: 显示
Linux: 显示
macOS: 不显示，保留当前 drag-region
```

`App.tsx` 当前已经对 macOS 注入 `drag-region`，该行为必须保留。

---

## 6.9 ModalLayer

### 目标

统一挂载全局 modal，不替换现有页面内弹窗。

第一阶段新增空壳：

```tsx
export function ModalLayer(): React.JSX.Element {
  return (
    <>
      <RuntimeErrorModal />
      <InstallWizardModalMount />
      <AboutModal />
    </>
  )
}
```

### 初始内容

```text
RuntimeErrorModal: 暂不启用
InstallWizardModalMount: 对接 first-run-wizard 后再启用
AboutModal: 暂不启用
```

### 禁止

```text
1. 不引入 NiceModal
2. 不引入 Mantine Modal
3. 不改现有 Settings 业务逻辑
```

---

## 6.10 DrawerLayer

第一阶段只保留结构：

```text
LogsDrawer
RunTimelineDrawer
TaskDrawer
```

默认关闭，不影响现有页面。

---

## 6.11 StatusBar

新增底部状态条：

```text
Profile: default
Gateway: unknown / running / stopped
Port: 8642
Mode: local / remote / ssh
Update: idle / available / downloading / ready
```

第一阶段只显示：

```text
activeProfile
remoteMode
updateState
```

Gateway 状态后续接入现有 Gateway API。

---

## 6.12 Layout 验收标准

```text
1. Layout.tsx 行数明显下降
2. Sidebar 独立组件
3. WorkspaceOutlet 独立组件
4. WindowControls 独立组件
5. ModalLayer / DrawerLayer / StatusBar 独立组件
6. Chat 页面可正常发送消息
7. Sessions 可正常恢复会话
8. Agents 可切换 profile
9. RuntimeSetupScreen 可正常打开
10. WebOperatorScreen 可正常打开
11. ProfileRuntimeScreen 可正常打开
12. AIOSWorkspaceScreen 可正常打开
13. profile-workspace:${profileId} 可正常打开
14. remote mode 下 RemoteNotice 行为不变
15. auto update 事件监听 cleanup 不变
16. 不引入 Mantine/MUI/TanStack Router
```

---

# 7. 文件级变更清单

## 7.1 Installer

修改：

```text
electron-builder.yml
build/installer.nsh
```

新增：

```text
build/nsis/Include/RuntimePrecheck.nsh
build/nsis/Include/VCRuntimeCheck.nsh
```

可选新增：

```text
build/nsis/Include/PortCheck.nsh
build/nsis/Include/ToolCheck.nsh
```

---

## 7.2 Main Process

修改：

```text
src/main/index.ts
src/preload/index.ts
src/preload/index.d.ts
```

新增：

```text
src/main/window/window-ipc.ts
src/main/window/window-state.ts
src/main/enterprise/installer-precheck-reader.ts
```

保持不动：

```text
src/main/enterprise/enterprise-installer.ts
src/main/enterprise/first-run-wizard.ts
src/main/enterprise/hermes-agent-source-installer.ts
src/main/enterprise/windows/install-location-resolver.ts
```

只允许做兼容性小改，不重写。

---

## 7.3 Renderer

修改：

```text
src/renderer/src/screens/Layout/Layout.tsx
src/renderer/src/assets/main.css
```

新增：

```text
src/renderer/src/components/layout/DesktopShell.tsx
src/renderer/src/components/layout/DesktopSidebar.tsx
src/renderer/src/components/layout/PageHeader.tsx
src/renderer/src/components/layout/WorkspaceOutlet.tsx
src/renderer/src/components/layout/WindowControls.tsx
src/renderer/src/components/layout/ModalLayer.tsx
src/renderer/src/components/layout/DrawerLayer.tsx
src/renderer/src/components/layout/StatusBar.tsx

src/renderer/src/hooks/useDesktopNavigation.ts
src/renderer/src/hooks/useUpdateState.ts
src/renderer/src/hooks/useRemoteMode.ts
src/renderer/src/hooks/useProfileEntries.ts

src/renderer/src/types/desktop-shell.ts
```

---

# 8. Cursor 实施计划

## Phase 1：Installer Precheck 增强

### 任务

```text
1. 在 build/installer.nsh 增加 customInit 检查逻辑
2. 抽离 VC Runtime 检查到 build/nsis/Include/VCRuntimeCheck.nsh
3. 抽离 runtime precheck 到 build/nsis/Include/RuntimePrecheck.nsh
4. 生成 $INSTDIR\runtime\installer-precheck.json
5. 保留现有 customInstall 和 customUnInstall 主逻辑
```

### 验收

```text
pnpm build
pnpm package:win

安装器：
- 显示 assisted installer
- 可选择安装目录
- VC Runtime 缺失时提示安装
- Git/Python/uv 缺失不阻断
- 安装后 PATH 正常
- 卸载后 PATH 清理
```

---

## Phase 2：WindowControls IPC

### 任务

```text
1. 新增 src/main/window/window-ipc.ts
2. 在 src/main/index.ts 注册 window IPC
3. 在 src/preload/index.ts 暴露 window control API
4. 在 src/preload/index.d.ts 补类型
5. 新增 WindowControls.tsx
6. Windows/Linux 显示，macOS 隐藏
```

### 验收

```text
1. 点击 minimize 最小化
2. 点击 maximize 最大化
3. 再次点击 restore
4. 点击 close 关闭窗口
5. Renderer 无 electron import
6. macOS drag-region 行为不变
```

---

## Phase 3：Layout 拆分

### 任务

```text
1. 新增 desktop-shell.ts 类型
2. 抽离 NAV_ITEMS / View 类型
3. 新增 DesktopShell.tsx
4. 新增 DesktopSidebar.tsx
5. 新增 WorkspaceOutlet.tsx
6. Layout.tsx 改为状态编排层
7. 保留现有页面行为
```

### 验收

```text
1. 所有导航项可正常切换
2. Chat 状态不丢失
3. Office lazy mount 不变
4. Providers visible 行为不变
5. Settings keep mounted 行为不变
6. Profile entries 正常渲染
7. Update button 行为不变
```

---

## Phase 4：PageHeader + StatusBar + ModalLayer

### 任务

```text
1. 新增 PageHeader.tsx
2. 新增 StatusBar.tsx
3. 新增 ModalLayer.tsx
4. 新增 DrawerLayer.tsx
5. 接入 DesktopShell
6. 保持默认视觉克制，不改变主页面样式
```

### 验收

```text
1. Header 显示当前 view title
2. Header 显示 active profile
3. Windows/Linux Header 显示 WindowControls
4. StatusBar 显示 profile/mode/update
5. ModalLayer 不影响现有页面
6. DrawerLayer 不影响现有页面
```

---

## Phase 5：RuntimeSetup 读取 installer-precheck

### 任务

```text
1. 新增 installer-precheck-reader.ts
2. 新增 IPC: enterprise:get-installer-precheck
3. Preload 暴露 getInstallerPrecheck()
4. RuntimeSetupScreen 展示 NSIS precheck summary
```

### 验收

```text
1. 安装后 RuntimeSetup 可以显示安装器预检结果
2. Git/Python/uv 缺失显示 warning
3. VC Runtime 缺失不会进入 App，因为 NSIS 已阻断
4. installer-precheck.json 缺失时不报错
```

---

# 9. Cursor 执行提示词

直接给 Cursor 使用：

```md
# Cursor Plan Request

目标：
基于 Hermes Desktop v1.3.1，对 Windows Installer 与 Desktop Shell 做结构化增强。

采用方案：
NSIS 只负责标准 Windows 安装器能力；Hermes Agent 来源选择继续放在 Electron First Run Wizard。

硬约束：
- 不改变 UI 技术栈。
- 不引入 Mantine。
- 不引入 MUI。
- 不引入 TanStack Router。
- 不改 Hermes Gateway API。
- 不改 Web Operator Tool Protocol。
- 不把 git clone / zip extract / Python venv / pip install 放进 NSIS。
- Renderer 禁止 import electron/fs/path/child_process。
- Renderer 只能通过 preload API 调用 Main。
- 保证现有安装、Welcome、Install、Setup、RuntimeSetup、Chat、Sessions、Agents、WebOperator、ProfileRuntime 正常使用。

参考实现：
1. Chatbox electron-builder:
   - nsis.oneClick=false
   - nsis.allowToChangeInstallationDirectory=true
   - nsis.include=assets/installer.nsh
2. Chatbox Layout:
   - Sidebar + Outlet
   - Header / WindowControls
   - Modal/Dialog/Toast 全局挂载

当前源码基线：
- electron-builder.yml 已有 nsis assisted installer 配置
- build/installer.nsh 已有 preInit/customInstall/customUnInstall
- first-run-wizard.ts 已有 local zip / git source install
- enterprise-installer.ts 已有 install pipeline
- Layout.tsx 当前是单文件状态机式主 Layout
- App.tsx 当前负责 Splash/Welcome/Install/Setup/Main 流程

请生成实施 plan，按以下 Phase 拆分：

Phase 1:
Installer Precheck 增强
- 修改 build/installer.nsh
- 新增 build/nsis/Include/VCRuntimeCheck.nsh
- 新增 build/nsis/Include/RuntimePrecheck.nsh
- 生成 runtime/installer-precheck.json
- 保留现有 PATH/registry/bin/runtime/shim 逻辑

Phase 2:
WindowControls IPC
- 新增 src/main/window/window-ipc.ts
- 修改 src/main/index.ts
- 修改 src/preload/index.ts
- 修改 src/preload/index.d.ts
- 新增 src/renderer/src/components/layout/WindowControls.tsx

Phase 3:
DesktopShell Layout 拆分
- 新增 src/renderer/src/types/desktop-shell.ts
- 新增 DesktopShell.tsx
- 新增 DesktopSidebar.tsx
- 新增 WorkspaceOutlet.tsx
- 修改 Layout.tsx 为编排层
- 保留全部现有 view 行为

Phase 4:
PageHeader / StatusBar / ModalLayer / DrawerLayer
- 新增 PageHeader.tsx
- 新增 StatusBar.tsx
- 新增 ModalLayer.tsx
- 新增 DrawerLayer.tsx
- 接入 DesktopShell

Phase 5:
RuntimeSetup 读取 installer-precheck
- 新增 src/main/enterprise/installer-precheck-reader.ts
- 新增 IPC enterprise:get-installer-precheck
- Preload 暴露 getInstallerPrecheck
- RuntimeSetupScreen 展示预检结果

输出要求：
1. 先输出文件变更清单。
2. 再输出每个 Phase 的任务。
3. 再输出每个文件的修改点。
4. 再输出验收标准。
5. 不直接开始写代码，先生成 plan。
```

---

# 10. 回归测试清单

## 10.1 安装回归

```text
1. 全新 Windows 10 安装
2. 自定义安装目录安装
3. 覆盖安装
4. 卸载
5. 无 Git 环境安装
6. 无 Python 环境安装
7. 旧 HermesDesktop registry 存在时安装
8. PATH 已存在 $INSTDIR\bin 时安装
9. 安装目录包含空格
10. 安装目录包含中文
```

---

## 10.2 App 启动回归

```text
1. Splash 正常显示
2. 未安装时进入 Welcome
3. 本地安装后进入 Setup
4. setup 完成后进入 Main
5. remote mode 不执行本地 verifyInstall
6. ssh mode 可启动 tunnel
7. installBroken 时回到 Welcome
```

---

## 10.3 Layout 回归

```text
1. Chat 可发送消息
2. Sessions 可恢复会话
3. Agents 可切换 Profile
4. Models 可打开
5. Providers 可打开
6. Skills 可打开
7. Soul 可打开
8. Memory 可打开
9. Tools 可打开
10. Schedules 可打开
11. Gateway 可打开
12. RuntimeSetup 可打开
13. WebOperator 可打开
14. ProfileRuntime 可打开
15. AIOSWorkspace 可打开
16. Specialist Profile Workspace 可打开
17. Settings 可打开
```

---

## 10.4 IPC 回归

```text
1. update available 事件 cleanup
2. update progress 事件 cleanup
3. update downloaded 事件 cleanup
4. update error 事件 cleanup
5. menu new chat 事件 cleanup
6. menu search sessions 事件 cleanup
7. first-run-wizard progress 事件 cleanup
8. window controls IPC 可用
```

---

# 11. 交付边界

本次交付完成后，应达到：

```text
Installer:
  - 标准 Windows assisted installer
  - 安装目录选择
  - 安装前环境检查
  - registry/PATH/runtime/bin/shim 稳定
  - Agent 来源选择继续由 Electron First Run Wizard 承接

Layout:
  - Layout.tsx 从大文件拆为 DesktopShell 架构
  - Sidebar 独立
  - WorkspaceOutlet 独立
  - PageHeader 独立
  - WindowControls 独立
  - ModalLayer / DrawerLayer / StatusBar 具备扩展位
  - 现有核心页面行为不变
```

验收命令：

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm package:win
```

Windows 验收产物：

```text
dist/smc-copilot-<version>-setup.exe
```
