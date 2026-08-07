# Mattermost Desktop — 架构分析文档

---

## 1. 系统本质

**是什么**：一个 Electron 壳层，将 Mattermost Web 应用嵌入原生桌面窗口，并叠加原生能力（通知、下载、系统托盘、Calls 浮窗、证书管理）。

**不是什么**：不是独立的通信应用，不渲染任何 Mattermost 业务 UI，不持有聊天/频道/消息状态。所有业务逻辑由远端 Mattermost Server 的 Web 应用承载。

---

## 2. 架构分层

```
┌─────────────────────────────────────────────────────────┐
│  Main Process  (Node.js + Electron APIs)                │
│  src/main/  +  src/app/  +  src/common/                 │
│                                                         │
│  Managers: ServerManager · ViewManager · ModalManager   │
│            DownloadsManager · PermissionsManager        │
│            CertificateManager · AuthManager             │
│  Windows:  MainWindow · CallsWidgetWindow               │
│  Views:    MattermostWebContentsView (per tab)          │
│            ServerDropdownView · DownloadsDropdownView   │
│            LoadingScreen · ModalView                    │
├──────────────────────┬──────────────────────────────────┤
│  Preload Bridge      │  两套 preload                    │
│  src/main/preload/   │  internalAPI.js → window.desktop │
│                      │  externalAPI.ts → window.desktopAPI│
├──────────────────────┴──────────────────────────────────┤
│  Renderer Process (React + Chromium)                    │
│  src/renderer/                                          │
│                                                         │
│  主窗口 UI:  index.tsx → Root → MainPage               │
│  独立 HTML:  dropdown / downloadsDropdown /             │
│              downloadsDropdownMenu / 各 modal           │
│  Mattermost WebApp: MattermostWebContentsView 内嵌      │
└─────────────────────────────────────────────────────────┘
```

**关键分界**：`src/common/` 是唯一可被 main 和 renderer 双侧 import 的代码，包含 IPC channel 常量、类型定义、`ServerManager`、`Config`、`View` 抽象。 [1](#0-0) [2](#0-1) 

---

## 3. 稳定抽象层（不应随意修改）

**`MattermostView` 接口** — 所有 tab 类型（Messaging/Focalboard/Playbooks）的统一契约。新增 tab 类型必须实现此接口。 [3](#0-2) 

**`communication.ts` IPC channel 常量** — 全系统的神经系统。main/preload/renderer 三侧共享同一份字符串常量，任何重命名都是破坏性变更。 [4](#0-3) 

**`CombinedConfig` / `ConfigV3` 类型** — 配置的公开契约，renderer 通过 `GET_CONFIGURATION` 获取此结构。字段删除或类型变更会破坏 settings UI。 [5](#0-4) 

**`window.desktop` / `window.desktopAPI` contextBridge 接口** — 两套 preload 暴露的 API 是 renderer 与 main 的唯一合法通信路径。`internalAPI.js` 服务于内部 renderer（主窗口/modal），`externalAPI.ts` 服务于嵌入的 Mattermost WebApp。 [6](#0-5) [7](#0-6) 

---

## 4. 易变实现细节

- `src/main/views/` 中各 dropdown/loading view 的布局计算（像素常量集中在 `common/utils/constants.ts`）
- `src/renderer/components/SettingsModal/definition.tsx` — 设置项的声明式定义，新增设置项改这里
- `src/main/menus/` — 原生菜单构建，平台差异逻辑集中于此
- `src/main/notifications/` — 通知拦截与分发
- `src/main/autoUpdater.ts` — 自动更新流程

---

## 5. 显式扩展点

**新增 Tab 类型**：在 `src/common/views/View.ts` 添加 `ViewType`，在 `ServerManager.getNewView()` 添加 case，实现 `MattermostView` 接口。 [8](#0-7) 

**新增 Modal**：在 `webpack.config.renderer.js` 注册新 entry，在 `src/renderer/modals/` 创建对应目录，通过 `ModalManager.addModal()` 从 main 侧触发。 [9](#0-8) [10](#0-9) 

**新增 IPC channel**：在 `communication.ts` 声明常量 → main 侧 `ipcMain.handle/on` 注册 → preload 侧暴露到 `window.desktop` → renderer 侧调用。 [11](#0-10) 

**新增设置项**：在 `ConfigV3` 添加字段 → `SettingsModal/definition.tsx` 添加声明 → `UPDATE_CONFIGURATION` 通道持久化。

**新增原生能力（Calls 模式）**：参考 `CallsWidgetWindow`，创建独立 `BrowserWindow`，通过专属 IPC channel 与 main 通信。 [12](#0-11) 

---

## 6. 不变式规则

- `TAB_MESSAGING`（Channels）**不可关闭**，`canCloseView()` 硬编码此规则。 [13](#0-12) 

- `ServerManager` 是单例，`serverOrder` 数组决定服务器显示顺序，必须与 `Config.localServers` 保持同步。 [14](#0-13) 

- `MattermostWebContentsView` 加载时必须使用 `externalAPI.js` preload（除非 `developerMode.browserOnly`），否则 `window.desktopAPI` 不存在，WebApp 无法与桌面端通信。 [15](#0-14) 

- 所有 renderer 进程必须通过 contextBridge 暴露的接口通信，**不得**直接 require electron 模块（沙箱隔离）。

- `ConfigV3.version = 3` 是当前版本，降级迁移路径 `V0→V1→V2→V3` 必须保持完整，否则旧用户配置丢失。 [16](#0-15) 

- `MainWindow` 是所有 `WebContentsView`（tab/dropdown/modal）的宿主容器，它销毁则所有子 view 销毁。 [17](#0-16) 

---

## 7. 系统生命周期

```
app.ready
  → initialize.ts: Config.init → ServerManager.reloadFromConfig
  → MainWindow.init → emit MAIN_WINDOW_CREATED
  → ViewManager.init → ServerViewState.init → loadServer(currentServer)
  → LoadingScreen.show
  → MattermostWebContentsView.load(url)
  → REACT_APP_INITIALIZED (from WebApp)
  → LOADSCREEN_END → LoadingScreen.hide
  → 正常运行: IPC 驱动状态变更
  → app.before-quit: 保存窗口状态 → 清理 views
```

`ServerManager.SERVERS_UPDATE` 事件是配置变更的广播信号，`ViewManager`、`MainWindow`、菜单系统均监听此事件做响应式更新。 [18](#0-17) 

---

## 8. Layout 文件 Spec（供 Agent 快速读取 UI 设计）

**主窗口 DOM 结构**（`src/renderer/components/MainPage.tsx`）：

```
.MainPage                          // 全屏容器，onClick → focusOnWebView
  .topBar[.macOS][.darkMode][.fullScreen]   // height: 40px, z-index: 9
    .topBar-bg                     // flex row, background: #efefef / #2e2e2e(dark)
      button.three-dot-menu        // flex: 0 0 40px，仅非 macOS 显示图标
      ServerDropdownButton         // 服务器名 + 未读 badge
      TabBar#tabBar                // 当前服务器的 tab 列表，支持 DnD
      DeveloperModeIndicator       // 开发模式标识
      DownloadsDropdownButton      // 仅 hasDownloads 时渲染
      .full-screen-button          // 仅非 darwin + fullScreen 时渲染
  .MainPage__body[.darkMode]       // 错误视图占位区（FAILED/INCOMPATIBLE 状态）
    ConnectionErrorView | IncompatibleErrorView | null
```

**关键尺寸常量**（`src/common/utils/constants.ts`）：

| 常量 | 值 |
|---|---|
| `TAB_BAR_HEIGHT` | 40px |
| `DEFAULT_WINDOW_WIDTH/HEIGHT` | 1280×800 |
| `MINIMUM_WINDOW_WIDTH/HEIGHT` | 600×240 |
| `DOWNLOADS_DROPDOWN_WIDTH/HEIGHT` | 280×360 |
| `DOWNLOADS_DROPDOWN_MENU_WIDTH/HEIGHT` | 200×260 |
| `MINIMUM_CALLS_WIDGET_WIDTH/HEIGHT` | 284×90 | [19](#0-18) 

**独立渲染进程 HTML 入口**（每个都是独立 Chromium 进程）：

| entry | 用途 |
|---|---|
| `index` | 主窗口 topBar + 错误视图 |
| `dropdown` | 服务器切换下拉（`ServerDropdown`） |
| `downloadsDropdown` | 下载列表面板 |
| `downloadsDropdownMenu` | 下载项右键菜单 |
| `settings` | 设置窗口 |
| `loadingScreen` | 启动/切换服务器加载动画 |
| `welcomeScreen` | 首次启动欢迎页 |
| `newServer/editServer/removeServer` | 服务器管理 modal |
| `loginModal` | HTTP Basic Auth modal |
| `permissionModal` | 协议/权限请求 modal |
| `certificateModal` | 客户端证书选择 modal |
| `urlView` | 悬停链接预览条 | [9](#0-8) 

---

## 9. UI 组件清单

**`src/renderer/components/`**

| 组件 | 职责 |
|---|---|
| `MainPage` | 主窗口根组件，持有全局 UI 状态 |
| `TabBar` | 当前服务器 tab 列表，支持 DnD 排序 |
| `ServerDropdownButton` | 服务器名称按钮，触发 dropdown |
| `DownloadsDropdown/DownloadsDropdownButton` | 下载按钮 + badge |
| `ConfigureServer` | 服务器 URL/名称输入表单（首次配置/新增） |
| `WelcomeScreen` | 首次启动欢迎页 |
| `NewServerModal` | 新增服务器 modal 内容 |
| `RemoveServerModal` | 删除服务器确认 modal |
| `DestructiveConfirmModal` | 通用危险操作确认 modal |
| `Modal` | 基础 modal 容器（所有 modal 的底层组件） |
| `ConnectionErrorView` | 服务器连接失败视图 |
| `IncompatibleErrorView` | 服务器版本不兼容视图 |
| `ErrorView` | 通用错误展示（被上两者复用） |
| `DeveloperModeIndicator` | 开发模式标识条 |
| `Input` | 通用输入框（带 status/error 状态） |
| `Toggle` | 开关控件 |
| `SaveButton` | 带 saving 状态的提交按钮 |
| `Logo` | Mattermost logo |
| `Header` | 欢迎/配置页顶部 header |
| `showCertificateModal` | 证书详情展示 |
| `urlDescription` | URL 悬停预览文本 |
| `LoadingScreen/` | 加载动画（含 `LoadingBackground`、`LoadingAnimation`） |
| `Carousel/` | 欢迎页轮播 |
| `WithTooltip/` | tooltip HOC |
| `SettingsModal/` | 设置面板（`index.tsx` + `definition.tsx` 声明式配置） |
| `Images/` | SVG 图标组件（`alert`、`ServerImage` 等） | [20](#0-19) [21](#0-20) 

---

## 10. 高风险修改类型

- **修改 `communication.ts` 中已有 channel 字符串** — 三侧同时失效，无编译报错
- **修改 `CombinedConfig` / `ConfigV3` 结构** — 破坏 settings UI 和配置迁移链
- **修改 `MattermostView` 接口** — 所有三个 View 实现类必须同步更新
- **修改 `internalAPI.js` / `externalAPI.ts` 暴露的 API 签名** — renderer 侧 TypeScript 类型不会自动感知 JS 侧变更
- **在 `MattermostWebContentsView` 中修改 preload 加载逻辑** — 影响所有嵌入 WebApp 的 `desktopAPI` 可用性
- **修改 `ServerManager.persistServers()`** — 直接影响用户配置持久化，数据丢失风险 [15](#0-14) [14](#0-13)

### Citations

**File:** src/common/communication.ts (L1-50)
```typescript
// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const GET_APP_INFO = 'get-app-info';

export const SWITCH_SERVER = 'switch-server';
export const SWITCH_TAB = 'switch-tab';
export const CLOSE_VIEW = 'close-view';
export const OPEN_VIEW = 'open-view';
export const SET_ACTIVE_VIEW = 'set-active-view';
export const FOCUS_BROWSERVIEW = 'focus-browserview';
export const HISTORY = 'history';

export const QUIT = 'quit';

export const GET_CONFIGURATION = 'get-configuration';
export const UPDATE_CONFIGURATION = 'update-configuration';
export const GET_LOCAL_CONFIGURATION = 'get-local-configuration';
export const RELOAD_CONFIGURATION = 'reload-config';
export const EMIT_CONFIGURATION = 'emit-configuration';

export const DARK_MODE_CHANGE = 'dark_mode_change';
export const GET_DARK_MODE = 'get-dark-mode';
export const USER_ACTIVITY_UPDATE = 'user-activity-update';
export const UPDATE_SHORTCUT_MENU = 'update-shortcut-menu';

export const OPEN_APP_MENU = 'open-app-menu';
export const APP_MENU_WILL_CLOSE = 'app-menu-will-close';

export const LOAD_RETRY = 'load_retry';
export const LOAD_SUCCESS = 'load_success';
export const LOAD_FAILED = 'load_fail';
export const LOAD_INCOMPATIBLE_SERVER = 'load_incompatible_server';

export const MAXIMIZE_CHANGE = 'maximized_change';

export const DOUBLE_CLICK_ON_WINDOW = 'double_click';

export const SHOW_NEW_SERVER_MODAL = 'show_new_server_modal';
export const SHOW_EDIT_SERVER_MODAL = 'show-edit-server-modal';
export const SHOW_REMOVE_SERVER_MODAL = 'show-remove-server-modal';

export const RETRIEVE_MODAL_INFO = 'retrieve-modal-info';
export const MODAL_CANCEL = 'modal-cancel';
export const MODAL_RESULT = 'modal-result';
export const MODAL_OPEN = 'modal-open';
export const MODAL_CLOSE = 'modal-close';
export const NOTIFY_MENTION = 'notify_mention';
export const EXIT_FULLSCREEN = 'exit-fullscreen';
export const GET_FULL_SCREEN_STATUS = 'get-full-screen-status';
```

**File:** src/common/views/View.ts (L1-23)
```typescript
// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {MattermostServer} from 'common/servers/MattermostServer';

import type {UniqueView, Server} from 'types/config';

export const TAB_MESSAGING = 'TAB_MESSAGING';
export const TAB_FOCALBOARD = 'TAB_FOCALBOARD';
export const TAB_PLAYBOOKS = 'TAB_PLAYBOOKS';
export type ViewType = typeof TAB_MESSAGING | typeof TAB_FOCALBOARD | typeof TAB_PLAYBOOKS;

export interface MattermostView {
    id: string;
    server: MattermostServer;
    isOpen?: boolean;

    get type(): ViewType;
    get url(): URL;
    get shouldNotify(): boolean;

    toUniqueView(): UniqueView;
}
```

**File:** src/common/views/View.ts (L63-65)
```typescript
export function canCloseView(viewType: ViewType) {
    return viewType !== TAB_MESSAGING;
}
```

**File:** src/types/config.ts (L35-63)
```typescript
export type ConfigV3 = {
    version: 3;
    teams: ConfigServer[];
    showTrayIcon: boolean;
    trayIconTheme: string;
    minimizeToTray: boolean;
    notifications: {
        flashWindow: number;
        bounceIcon: boolean;
        bounceIconType: '' | 'critical' | 'informational';
    };
    showUnreadBadge: boolean;
    useSpellChecker: boolean;
    enableHardwareAcceleration: boolean;
    autostart: boolean;
    hideOnStart: boolean;
    spellCheckerLocales: string[];
    darkMode: boolean;
    downloadLocation?: string;
    spellCheckerURL?: string;
    lastActiveTeam?: number;
    startInFullscreen?: boolean;
    autoCheckForUpdates?: boolean;
    alwaysMinimize?: boolean;
    alwaysClose?: boolean;
    logLevel?: string;
    appLanguage?: string;
    enableMetrics?: boolean;
}
```

**File:** src/types/config.ts (L65-104)
```typescript
export type ConfigV2 =
    Omit<ConfigV3,
    'version' |
    'teams' |
    'hideOnStart' |
    'spellCheckerLocales' |
    'lastActiveTeam' |
    'startInFullscreen' |
    'autoCheckForUpdates' |
    'alwaysMinimize' |
    'alwaysClose' |
    'logLevel' |
    'appLanguage'
    > & {
        version: 2;
        teams: Array<{
            name: string;
            url: string;
            order: number;
        }>;
        spellCheckerLocale: string;
    }

export type ConfigV1 =
    Omit<ConfigV2,
    'version' |
    'teams' |
    'darkMode' |
    'downloadLocation'
    > & {
        version: 1;
        teams: Array<{
            name: string;
            url: string;
        }>;
    }

export type ConfigV0 = {version: 0; url: string};

export type AnyConfig = ConfigV3 | ConfigV2 | ConfigV1 | ConfigV0;
```

**File:** src/main/preload/externalAPI.ts (L54-118)
```typescript
const desktopAPI: DesktopAPI = {

    // Initialization
    isDev: () => ipcRenderer.invoke(GET_IS_DEV_MODE),
    getAppInfo: () => ipcRenderer.invoke(GET_APP_INFO),
    reactAppInitialized: () => ipcRenderer.send(REACT_APP_INITIALIZED),

    // Session
    setSessionExpired: (isExpired) => ipcRenderer.send(SESSION_EXPIRED, isExpired),
    onUserActivityUpdate: (listener) => createListener(USER_ACTIVITY_UPDATE, listener),

    onLogin: () => ipcRenderer.send(TAB_LOGIN_CHANGED, true),
    onLogout: () => ipcRenderer.send(TAB_LOGIN_CHANGED, false),

    // Unreads/mentions/notifications
    sendNotification: (title, body, channelId, teamId, url, silent, soundName) =>
        ipcRenderer.invoke(NOTIFY_MENTION, title, body, channelId, teamId, url, silent, soundName),
    onNotificationClicked: (listener) => createListener(NOTIFICATION_CLICKED, listener),
    setUnreadsAndMentions: (isUnread, mentionCount) => ipcRenderer.send(UNREADS_AND_MENTIONS, isUnread, mentionCount),

    // Navigation
    requestBrowserHistoryStatus: () => ipcRenderer.invoke(REQUEST_BROWSER_HISTORY_STATUS),
    onBrowserHistoryStatusUpdated: (listener) => createListener(BROWSER_HISTORY_STATUS_UPDATED, listener),
    onBrowserHistoryPush: (listener) => createListener(BROWSER_HISTORY_PUSH, listener),
    sendBrowserHistoryPush: (path) => ipcRenderer.send(BROWSER_HISTORY_PUSH, path),

    // Calls
    joinCall: (opts) => ipcRenderer.invoke(CALLS_JOIN_CALL, opts),
    leaveCall: () => ipcRenderer.send(CALLS_LEAVE_CALL),

    callsWidgetConnected: (callID, sessionID) => ipcRenderer.send(CALLS_JOINED_CALL, callID, sessionID),
    resizeCallsWidget: (width, height) => ipcRenderer.send(CALLS_WIDGET_RESIZE, width, height),

    sendCallsError: (err, callID, errMsg) => ipcRenderer.send(CALLS_ERROR, err, callID, errMsg),
    onCallsError: (listener) => createListener(CALLS_ERROR, listener),

    getDesktopSources: (opts) => ipcRenderer.invoke(GET_DESKTOP_SOURCES, opts),
    openScreenShareModal: () => ipcRenderer.send(DESKTOP_SOURCES_MODAL_REQUEST),
    onOpenScreenShareModal: (listener) => createListener(DESKTOP_SOURCES_MODAL_REQUEST, listener),

    shareScreen: (sourceID, withAudio) => ipcRenderer.send(CALLS_WIDGET_SHARE_SCREEN, sourceID, withAudio),
    onScreenShared: (listener) => createListener(CALLS_WIDGET_SHARE_SCREEN, listener),

    sendJoinCallRequest: (callId) => ipcRenderer.send(CALLS_JOIN_REQUEST, callId),
    onJoinCallRequest: (listener) => createListener(CALLS_JOIN_REQUEST, listener),

    openLinkFromCalls: (url) => ipcRenderer.send(CALLS_LINK_CLICK, url),

    focusPopout: () => ipcRenderer.send(CALLS_POPOUT_FOCUS),

    openThreadForCalls: (threadID) => ipcRenderer.send(CALLS_WIDGET_OPEN_THREAD, threadID),
    onOpenThreadForCalls: (listener) => createListener(CALLS_WIDGET_OPEN_THREAD, listener),

    openStopRecordingModal: (channelID) => ipcRenderer.send(CALLS_WIDGET_OPEN_STOP_RECORDING_MODAL, channelID),
    onOpenStopRecordingModal: (listener) => createListener(CALLS_WIDGET_OPEN_STOP_RECORDING_MODAL, listener),

    openCallsUserSettings: () => ipcRenderer.send(CALLS_WIDGET_OPEN_USER_SETTINGS),
    onOpenCallsUserSettings: (listener) => createListener(CALLS_WIDGET_OPEN_USER_SETTINGS, listener),

    onSendMetrics: (listener) => createListener(METRICS_SEND, listener),

    // Utility
    unregister: (channel) => ipcRenderer.removeAllListeners(channel),
};
contextBridge.exposeInMainWorld('desktopAPI', desktopAPI);
```

**File:** src/main/preload/internalAPI.js (L119-176)
```javascript
contextBridge.exposeInMainWorld('desktop', {
    quit: (reason, stack) => ipcRenderer.send(QUIT, reason, stack),
    openAppMenu: () => ipcRenderer.send(OPEN_APP_MENU),
    closeServersDropdown: () => ipcRenderer.send(CLOSE_SERVERS_DROPDOWN),
    openServersDropdown: () => ipcRenderer.send(OPEN_SERVERS_DROPDOWN),
    switchTab: (viewId) => ipcRenderer.send(SWITCH_TAB, viewId),
    closeView: (viewId) => ipcRenderer.send(CLOSE_VIEW, viewId),
    exitFullScreen: () => ipcRenderer.send(EXIT_FULLSCREEN),
    doubleClickOnWindow: (windowName) => ipcRenderer.send(DOUBLE_CLICK_ON_WINDOW, windowName),
    focusCurrentView: () => ipcRenderer.send(FOCUS_BROWSERVIEW),
    openServerExternally: () => ipcRenderer.send(OPEN_SERVER_EXTERNALLY),
    openServerUpgradeLink: () => ipcRenderer.send(OPEN_SERVER_UPGRADE_LINK),
    openChangelogLink: () => ipcRenderer.send(OPEN_CHANGELOG_LINK),
    closeDownloadsDropdown: () => ipcRenderer.send(CLOSE_DOWNLOADS_DROPDOWN),
    closeDownloadsDropdownMenu: () => ipcRenderer.send(CLOSE_DOWNLOADS_DROPDOWN_MENU),
    openDownloadsDropdown: () => ipcRenderer.send(OPEN_DOWNLOADS_DROPDOWN),
    goBack: () => ipcRenderer.send(HISTORY, -1),
    checkForUpdates: () => ipcRenderer.send(CHECK_FOR_UPDATES),
    updateConfiguration: (saveQueueItems) => ipcRenderer.send(UPDATE_CONFIGURATION, saveQueueItems),
    getNonce: () => ipcRenderer.invoke(GET_NONCE),
    isDeveloperModeEnabled: () => ipcRenderer.invoke(IS_DEVELOPER_MODE_ENABLED),

    updateServerOrder: (serverOrder) => ipcRenderer.send(UPDATE_SERVER_ORDER, serverOrder),
    updateTabOrder: (serverId, viewOrder) => ipcRenderer.send(UPDATE_TAB_ORDER, serverId, viewOrder),
    getLastActive: () => ipcRenderer.invoke(GET_LAST_ACTIVE),
    getOrderedServers: () => ipcRenderer.invoke(GET_ORDERED_SERVERS),
    getOrderedTabsForServer: (serverId) => ipcRenderer.invoke(GET_ORDERED_TABS_FOR_SERVER, serverId),
    onUpdateServers: (listener) => ipcRenderer.on(SERVERS_UPDATE, () => listener()),
    validateServerURL: (url, currentId) => ipcRenderer.invoke(VALIDATE_SERVER_URL, url, currentId),
    getUniqueServersWithPermissions: () => ipcRenderer.invoke(GET_UNIQUE_SERVERS_WITH_PERMISSIONS),
    addServer: (server) => ipcRenderer.send(ADD_SERVER, server),
    editServer: (server, permissions) => ipcRenderer.send(EDIT_SERVER, server, permissions),
    removeServer: (serverId) => ipcRenderer.send(REMOVE_SERVER, serverId),

    getConfiguration: () => ipcRenderer.invoke(GET_CONFIGURATION),
    getVersion: () => ipcRenderer.invoke(GET_APP_INFO),
    getDarkMode: () => ipcRenderer.invoke(GET_DARK_MODE),
    requestHasDownloads: () => ipcRenderer.invoke(REQUEST_HAS_DOWNLOADS),
    getFullScreenStatus: () => ipcRenderer.invoke(GET_FULL_SCREEN_STATUS),
    getAvailableSpellCheckerLanguages: () => ipcRenderer.invoke(GET_AVAILABLE_SPELL_CHECKER_LANGUAGES),
    getAvailableLanguages: () => ipcRenderer.invoke(GET_AVAILABLE_LANGUAGES),
    getLocalConfiguration: () => ipcRenderer.invoke(GET_LOCAL_CONFIGURATION),
    getDownloadLocation: (downloadLocation) => ipcRenderer.invoke(GET_DOWNLOAD_LOCATION, downloadLocation),
    getLanguageInformation: () => ipcRenderer.invoke(GET_LANGUAGE_INFORMATION),

    onSynchronizeConfig: (listener) => ipcRenderer.on('synchronize-config', () => listener()),
    onReloadConfiguration: (listener) => {
        ipcRenderer.on(RELOAD_CONFIGURATION, () => listener());
        return () => ipcRenderer.off(RELOAD_CONFIGURATION, listener);
    },
    onDarkModeChange: (listener) => ipcRenderer.on(DARK_MODE_CHANGE, (_, darkMode) => listener(darkMode)),
    onLoadRetry: (listener) => ipcRenderer.on(LOAD_RETRY, (_, viewId, retry, err, loadUrl) => listener(viewId, retry, err, loadUrl)),
    onLoadSuccess: (listener) => ipcRenderer.on(LOAD_SUCCESS, (_, viewId) => listener(viewId)),
    onLoadFailed: (listener) => ipcRenderer.on(LOAD_FAILED, (_, viewId, err, loadUrl) => listener(viewId, err, loadUrl)),
    onLoadIncompatibleServer: (listener) => ipcRenderer.on(LOAD_INCOMPATIBLE_SERVER, (_, viewId, loadUrl) => listener(viewId, loadUrl)),
    onSetActiveView: (listener) => ipcRenderer.on(SET_ACTIVE_VIEW, (_, serverId, viewId) => listener(serverId, viewId)),
    onMaximizeChange: (listener) => ipcRenderer.on(MAXIMIZE_CHANGE, (_, maximize) => listener(maximize)),
    onEnterFullScreen: (listener) => ipcRenderer.on('enter-full-screen', () => listener()),
```

**File:** src/common/servers/serverManager.ts (L306-318)
```typescript
    private persistServers = async (lastActiveServer?: number) => {
        this.emit(SERVERS_UPDATE);

        const localServers = [...this.servers.values()].
            reduce((servers, srv) => {
                if (srv.isPredefined) {
                    return servers;
                }
                servers.push(this.toConfigServer(srv));
                return servers;
            }, [] as ConfigServer[]);
        await Config.setServers(localServers, lastActiveServer);
    };
```

**File:** src/common/servers/serverManager.ts (L352-363)
```typescript
    private getNewView = (srv: MattermostServer, viewName: string, isOpen?: boolean) => {
        switch (viewName) {
        case TAB_MESSAGING:
            return new MessagingView(srv, isOpen);
        case TAB_FOCALBOARD:
            return new FocalboardView(srv, isOpen);
        case TAB_PLAYBOOKS:
            return new PlaybooksView(srv, isOpen);
        default:
            throw new Error('Not implemeneted');
        }
    };
```

**File:** webpack.config.renderer.js (L14-29)
```javascript
    entry: {
        index: './src/renderer/index.tsx',
        settings: './src/renderer/modals/settings/settings.tsx',
        dropdown: './src/renderer/dropdown.tsx',
        downloadsDropdownMenu: './src/renderer/downloadsDropdownMenu.tsx',
        downloadsDropdown: './src/renderer/downloadsDropdown.tsx',
        urlView: './src/renderer/modals/urlView/urlView.tsx',
        newServer: './src/renderer/modals/newServer/newServer.tsx',
        editServer: './src/renderer/modals/editServer/editServer.tsx',
        removeServer: './src/renderer/modals/removeServer/removeServer.tsx',
        loginModal: './src/renderer/modals/login/login.tsx',
        permissionModal: './src/renderer/modals/permission/permission.tsx',
        certificateModal: './src/renderer/modals/certificate/certificate.tsx',
        loadingScreen: './src/renderer/modals/loadingScreen/index.tsx',
        welcomeScreen: './src/renderer/modals/welcomeScreen/welcomeScreen.tsx',
    },
```

**File:** src/main/views/modalManager.ts (L50-66)
```typescript
    addModal = <T, T2>(key: string, html: string, preload: string, data: T, win: BrowserWindow, uncloseable = false) => {
        const foundModal = this.modalQueue.find((modal) => modal.key === key);
        if (!foundModal) {
            const modalPromise = new Promise((resolve: (value: T2) => void, reject) => {
                const mv = new ModalView<T, T2>(key, html, preload, data, resolve, reject, win, uncloseable);
                this.modalQueue.push(mv);
            });

            if (this.modalQueue.length === 1) {
                this.showModal();
            }

            this.modalPromises.set(key, modalPromise);
            return modalPromise;
        }
        return this.modalPromises.get(key) as Promise<T2>;
    };
```

**File:** src/main/app/initialize.ts (L261-289)
```typescript
function initializeInterCommunicationEventListeners() {
    ipcMain.handle(NOTIFY_MENTION, handleMentionNotification);
    ipcMain.handle(GET_APP_INFO, handleAppVersion);
    ipcMain.on(UPDATE_SHORTCUT_MENU, handleUpdateMenuEvent);
    ipcMain.on(FOCUS_BROWSERVIEW, ViewManager.focusCurrentView);

    if (process.platform !== 'darwin') {
        ipcMain.on(OPEN_APP_MENU, handleOpenAppMenu);
    }

    ipcMain.on(QUIT, handleQuit);

    ipcMain.handle(GET_AVAILABLE_SPELL_CHECKER_LANGUAGES, () => session.defaultSession.availableSpellCheckerLanguages);
    ipcMain.on(START_UPDATE_DOWNLOAD, handleStartDownload);
    ipcMain.on(START_UPGRADE, handleStartUpgrade);
    ipcMain.handle(PING_DOMAIN, handlePingDomain);
    ipcMain.handle(GET_CONFIGURATION, handleGetConfiguration);
    ipcMain.handle(GET_LOCAL_CONFIGURATION, handleGetLocalConfiguration);
    ipcMain.on(UPDATE_CONFIGURATION, updateConfiguration);

    ipcMain.handle(GET_DARK_MODE, handleGetDarkMode);
    ipcMain.on(DOUBLE_CLICK_ON_WINDOW, handleDoubleClick);

    ipcMain.on(TOGGLE_SECURE_INPUT, handleToggleSecureInput);

    if (process.env.NODE_ENV === 'test') {
        ipcMain.on(SHOW_SETTINGS_WINDOW, handleShowSettingsModal);
    }
}
```

**File:** src/main/windows/callsWidgetWindow.ts (L1-1)
```typescript
// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
```

**File:** src/main/views/MattermostWebContentsView.ts (L60-78)
```typescript
    constructor(view: MattermostView, options: WebContentsViewConstructorOptions) {
        super();
        this.view = view;

        const preload = getLocalPreload('externalAPI.js');
        this.options = Object.assign({}, options);
        this.options.webPreferences = {
            preload: DeveloperMode.get('browserOnly') ? undefined : preload,
            additionalArguments: [
                `version=${app.getVersion()}`,
                `appName=${app.name}`,
            ],
            ...options.webPreferences,
        };
        this.isVisible = false;
        this.loggedIn = false;
        this.atRoot = true;
        this.webContentsView = new WebContentsView(this.options);
        this.resetLoadingStatus();
```

**File:** src/main/windows/mainWindow.ts (L46-65)
```typescript
export class MainWindow extends EventEmitter {
    private win?: BrowserWindow;

    private savedWindowState?: Partial<SavedWindowState>;
    private ready: boolean;

    constructor() {
        super();

        // Create the browser window.
        this.ready = false;

        ipcMain.handle(GET_FULL_SCREEN_STATUS, () => this.win?.isFullScreen());
        ipcMain.on(EMIT_CONFIGURATION, this.handleUpdateTitleBarOverlay);
        ipcMain.on(EXIT_FULLSCREEN, this.handleExitFullScreen);

        ServerManager.on(SERVERS_UPDATE, this.handleUpdateConfig);

        AppState.on(UPDATE_APPSTATE_FOR_VIEW_ID, this.handleUpdateAppStateForViewId);
    }
```

**File:** src/main/views/viewManager.ts (L73-97)
```typescript
    constructor() {
        this.views = new Map(); // keep in mind that this doesn't need to hold server order, only views on the renderer need that.
        this.closedViews = new Map();

        MainWindow.on(MAIN_WINDOW_CREATED, this.init);
        MainWindow.on(MAIN_WINDOW_RESIZED, this.handleSetCurrentViewBounds);
        MainWindow.on(MAIN_WINDOW_FOCUSED, this.focusCurrentView);
        ipcMain.handle(GET_VIEW_INFO_FOR_TEST, this.handleGetViewInfoForTest);
        ipcMain.handle(GET_IS_DEV_MODE, () => isDev);
        ipcMain.handle(REQUEST_BROWSER_HISTORY_STATUS, this.handleRequestBrowserHistoryStatus);
        ipcMain.on(HISTORY, this.handleHistory);
        ipcMain.on(REACT_APP_INITIALIZED, this.handleReactAppInitialized);
        ipcMain.on(BROWSER_HISTORY_PUSH, this.handleBrowserHistoryPush);
        ipcMain.on(TAB_LOGIN_CHANGED, this.handleTabLoginChanged);
        ipcMain.on(OPEN_SERVER_EXTERNALLY, this.handleOpenServerExternally);
        ipcMain.on(OPEN_SERVER_UPGRADE_LINK, this.handleOpenServerUpgradeLink);
        ipcMain.on(OPEN_CHANGELOG_LINK, this.handleOpenChangelogLink);
        ipcMain.on(UNREADS_AND_MENTIONS, this.handleUnreadsAndMentionsChanged);
        ipcMain.on(SESSION_EXPIRED, this.handleSessionExpired);

        ipcMain.on(SWITCH_TAB, (event, viewId) => this.showById(viewId));

        ServerManager.on(SERVERS_UPDATE, this.handleReloadConfiguration);
        DeveloperMode.on(DEVELOPER_MODE_UPDATED, this.handleDeveloperModeUpdated);
    }
```

**File:** src/common/utils/constants.ts (L16-43)
```typescript
export const TAB_BAR_HEIGHT = 40;
export const TAB_BAR_PADDING = 4;
export const THREE_DOT_MENU_WIDTH = 40;
export const THREE_DOT_MENU_WIDTH_MAC = 80;
export const MENU_SHADOW_WIDTH = 24;

export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 800;
export const MINIMUM_WINDOW_WIDTH = 600;
export const MINIMUM_WINDOW_HEIGHT = 240;

// Calls
export const MINIMUM_CALLS_WIDGET_WIDTH = 284;
export const MINIMUM_CALLS_WIDGET_HEIGHT = 90;
export const CALLS_PLUGIN_ID = 'com.mattermost.calls';

export const DOWNLOADS_DROPDOWN_HEIGHT = 360;
export const DOWNLOADS_DROPDOWN_WIDTH = 280;
export const DOWNLOADS_DROPDOWN_PADDING = 24;
export const DOWNLOADS_DROPDOWN_MENU_HEIGHT = 260;
export const DOWNLOADS_DROPDOWN_MENU_WIDTH = 200;
export const DOWNLOADS_DROPDOWN_MENU_PADDING = 12;

// In  order to display the box-shadow & radius on the left + right, use this WIDTH in the webContentsView for downloadsDropdown
export const DOWNLOADS_DROPDOWN_FULL_WIDTH = DOWNLOADS_DROPDOWN_PADDING + DOWNLOADS_DROPDOWN_WIDTH + TAB_BAR_PADDING;
export const DOWNLOADS_DROPDOWN_MENU_FULL_WIDTH = (DOWNLOADS_DROPDOWN_MENU_PADDING * 2) + DOWNLOADS_DROPDOWN_MENU_WIDTH;
export const DOWNLOADS_DROPDOWN_MENU_FULL_HEIGHT = DOWNLOADS_DROPDOWN_MENU_HEIGHT + TAB_BAR_PADDING; // only bottom padding included for better positioning
export const DOWNLOADS_DROPDOWN_MAX_ITEMS = 50;
```

**File:** src/renderer/components/MainPage.tsx (L391-565)
```typescript
    render() {
        const {intl} = this.props;
        let currentTabs: UniqueView[] = [];
        if (this.state.activeServerId) {
            currentTabs = this.state.tabs.get(this.state.activeServerId) ?? [];
        }

        const tabsRow = (
            <TabBar
                id='tabBar'
                isDarkMode={this.props.darkMode}
                tabs={currentTabs}
                sessionsExpired={this.state.sessionsExpired}
                unreadCounts={this.state.unreadCounts}
                mentionCounts={this.state.mentionCounts}
                activeServerId={this.state.activeServerId}
                activeTabId={this.state.activeTabId}
                onSelect={this.handleSelectTab}
                onCloseTab={this.handleCloseTab}
                onDrop={this.handleDragAndDrop}
                tabsDisabled={this.state.modalOpen}
                isMenuOpen={this.state.isMenuOpen || this.state.isDownloadsDropdownOpen}
            />
        );

        const topBarClassName = classNames('topBar', {
            macOS: window.process.platform === 'darwin',
            darkMode: this.props.darkMode,
            fullScreen: this.state.fullScreen,
        });

        const downloadsDropdownButton = this.state.hasDownloads ? (
            <DownloadsDropdownButton
                darkMode={this.props.darkMode}
                isDownloadsDropdownOpen={this.state.isDownloadsDropdownOpen}
                showDownloadsBadge={this.state.showDownloadsBadge}
                closeDownloadsDropdown={this.closeDownloadsDropdown}
                openDownloadsDropdown={this.openDownloadsDropdown}
            />
        ) : null;

        const totalMentionCount = Object.keys(this.state.mentionCounts).reduce((sum, key) => {
            // Strip out current server from unread and mention counts
            if (this.state.tabs.get(this.state.activeServerId!)?.map((tab) => tab.id).includes(key)) {
                return sum;
            }
            return sum + this.state.mentionCounts[key];
        }, 0);
        const hasAnyUnreads = Object.keys(this.state.unreadCounts).reduce((sum, key) => {
            if (this.state.tabs.get(this.state.activeServerId!)?.map((tab) => tab.id).includes(key)) {
                return sum;
            }
            return sum || this.state.unreadCounts[key];
        }, false);

        const activeServer = this.state.servers.find((srv) => srv.id === this.state.activeServerId);

        const topRow = (
            <div
                className={topBarClassName}
                onDoubleClick={this.handleDoubleClick}
            >
                <div
                    ref={this.topBar}
                    className={'topBar-bg'}
                >
                    {window.process.platform !== 'linux' && this.state.servers.length === 0 && (
                        <div className='app-title'>
                            {intl.formatMessage({id: 'renderer.components.mainPage.titleBar', defaultMessage: '{appName}'}, {appName: this.props.appName})}
                        </div>
                    )}
                    <button
                        ref={this.threeDotMenu}
                        className='three-dot-menu'
                        onClick={this.openMenu}
                        onMouseOver={this.focusThreeDotsButton}
                        onMouseOut={this.unFocusThreeDotsButton}
                        tabIndex={0}
                        aria-label={intl.formatMessage({id: 'renderer.components.mainPage.contextMenu.ariaLabel', defaultMessage: 'Context menu'})}
                    >
                        <i
                            className={classNames('icon-dots-vertical', {
                                isFocused: this.state.threeDotsIsFocused,
                            })}
                        />
                    </button>
                    {activeServer && (
                        <ServerDropdownButton
                            isDisabled={this.state.modalOpen}
                            activeServerName={activeServer.name}
                            totalMentionCount={totalMentionCount}
                            hasUnreads={hasAnyUnreads}
                            isMenuOpen={this.state.isMenuOpen}
                            darkMode={this.props.darkMode}
                        />
                    )}
                    {tabsRow}
                    <DeveloperModeIndicator
                        darkMode={this.props.darkMode}
                        developerMode={this.state.developerMode}
                    />
                    {downloadsDropdownButton}
                    {window.process.platform !== 'darwin' && this.state.fullScreen && (
                        <div
                            className={`button full-screen-button${this.props.darkMode ? ' darkMode' : ''}`}
                            onClick={this.handleExitFullScreen}
                        >
                            <i className='icon icon-arrow-collapse'/>
                        </div>
                    )}
                    {window.process.platform !== 'darwin' && !this.state.fullScreen && (
                        <span style={{width: `${window.innerWidth - (window.navigator.windowControlsOverlay?.getTitlebarAreaRect().width ?? 0)}px`}}/>
                    )}
                </div>
            </div>
        );

        const views = () => {
            if (!activeServer) {
                return null;
            }
            let component;
            const tabStatus = this.getTabViewStatus();
            if (!tabStatus) {
                if (this.state.activeTabId) {
                    console.error(`Not tabStatus for ${this.state.activeTabId}`);
                }
                return null;
            }
            switch (tabStatus.status) {
            case Status.FAILED:
                component = (
                    <ConnectionErrorView
                        darkMode={this.props.darkMode}
                        errorInfo={tabStatus.extra?.error}
                        url={tabStatus.extra ? tabStatus.extra.url : ''}
                        appName={this.props.appName}
                        handleLink={this.openServerExternally}
                    />);
                break;
            case Status.INCOMPATIBLE:
                component = (
                    <IncompatibleErrorView
                        darkMode={this.props.darkMode}
                        url={tabStatus.extra ? tabStatus.extra.url : ''}
                        appName={this.props.appName}
                        handleLink={this.openServerExternally}
                        handleUpgradeLink={() => window.desktop.openServerUpgradeLink()}
                    />);
                break;
            case Status.LOADING:
            case Status.RETRY:
            case Status.DONE:
                component = null;
            }
            return component;
        };

        const viewsRow = (
            <Fragment>
                <div className={classNames('MainPage__body', {darkMode: this.props.darkMode})}>
                    {views()}
                </div>
            </Fragment>);

        return (
            <div
                className='MainPage'
                onClick={this.focusOnWebView}
            >
                {topRow}
                {viewsRow}
            </div>
        );
    }
```

**File:** src/renderer/components/TabBar.tsx (L17-32)
```typescript
type Props = {
    activeTabId?: string;
    activeServerId?: string;
    id: string;
    isDarkMode: boolean;
    onSelect: (id: string) => void;
    onCloseTab: (id: string) => void;
    tabs: UniqueView[];
    sessionsExpired: Record<string, boolean>;
    unreadCounts: Record<string, boolean>;
    mentionCounts: Record<string, number>;
    onDrop: (result: DropResult) => void;
    tabsDisabled?: boolean;
    isMenuOpen?: boolean;
    intl: IntlShape;
};
```
