# Layout Agent Spec（Renderer Desktop Shell）

## 1. 文档目标

本规格用于描述 `src/renderer/src/components/layout` 的代码结构、组件职责、布局样式约定与扩展边界，供 AI Agent 在以下场景中执行一致实现：

- 新增主界面视图或导航项
- 调整桌面壳层（Sidebar/Header/Outlet/Status）布局
- 接入窗口控制、全局 Modal/Drawer 容器
- 在不破坏现有路由与状态管理的前提下扩展 UI

---

## 2. 范围与非范围

### 2.1 In Scope

- `DesktopShell` / `DesktopSidebar` / `PageHeader` / `WorkspaceOutlet` / `StatusBar`
- `ModalLayer` / `DrawerLayer` 的挂载点角色
- `Layout.tsx` 对 layout 组件的装配方式
- `main.css` 中与 layout 直接相关的样式类
- `View` / `NavItem` / `UpdateState` 等布局相关类型

### 2.2 Out of Scope

- 各业务 Screen 的内部业务逻辑
- Main/Preload IPC 细节（仅描述已被 layout 消费的能力）
- 安装、配置、聊天流式协议等非布局主题

---

## 3. 代码地图（Code Map）

### 3.1 Layout 装配入口

- `src/renderer/src/screens/Layout/Layout.tsx`
  - 负责将导航、更新状态、remote mode、profile entries 等状态装配到桌面壳层组件。

### 3.2 组件目录

- `src/renderer/src/components/layout/DesktopShell.tsx`
- `src/renderer/src/components/layout/DesktopSidebar.tsx`
- `src/renderer/src/components/layout/PageHeader.tsx`
- `src/renderer/src/components/layout/WorkspaceOutlet.tsx`
- `src/renderer/src/components/layout/StatusBar.tsx`
- `src/renderer/src/components/layout/WindowControls.tsx`
- `src/renderer/src/components/layout/ModalLayer.tsx`
- `src/renderer/src/components/layout/DrawerLayer.tsx`

### 3.3 相关类型与样式

- `src/renderer/src/types/desktop-shell.ts`
- `src/renderer/src/assets/main.css`

---

## 4. 架构总览

布局采用 Shell 组合模式：

1. **DesktopShell** 定义页面骨架（Sidebar + Main Column + Overlay Slots）
2. **DesktopSidebar** 负责全局导航与更新入口
3. **PageHeader** 显示当前视图标题、活跃 Profile、窗口控制区
4. **WorkspaceOutlet** 根据 `view` 条件渲染各业务 Screen
5. **StatusBar** 提供运行态信息摘要
6. **ModalLayer / DrawerLayer** 预留全局浮层挂载点

---

## 5. 组件规格（Component Spec）

## 5.1 DesktopShell

### 职责

- 作为主布局根容器，接收外部注入的 slot：`sidebar/header/outlet/statusBar/modalLayer/drawerLayer`。
- 保持结构稳定，避免在 Shell 内嵌入业务逻辑。

### Props

- `sidebar: React.ReactNode`
- `header: React.ReactNode`
- `outlet: React.ReactNode`
- `modalLayer?: React.ReactNode`
- `drawerLayer?: React.ReactNode`
- `statusBar?: React.ReactNode`

### DOM 结构

- 根：`.layout.desktop-shell`
- 左栏：`aside.desktop-shell__sidebar.sidebar`
- 主区：`section.desktop-shell__main`
  - 顶栏：`header.desktop-shell__header`
  - 内容：`main.desktop-shell__outlet.content`
  - 状态栏：`footer.desktop-shell__status`（可选）
- 浮层：`modalLayer`、`drawerLayer` 作为同级挂载

---

## 5.2 DesktopSidebar

### 职责

- 渲染主导航菜单（`navItems`）
- 渲染 Portal / Experts / Runtime 分组导航（基于 `profileEntries`）
- 渲染更新状态按钮与错误信息
- 显示当前 profile/app 名称

### 输入状态

- 导航状态：`view`、`onNavigate`
- 配置状态：`profileEntries`、`activeProfile`
- 更新状态：`updateState`、`updateVersion`、`downloadPercent`、`updateError`、`onUpdate`

### 行为规则

- `profileEntries.length > 0` 时展示 Portal 分组区块
- 专家工作区仅展示 `entryType === "specialist-workspace"`
- `updateState` 非空时显示更新按钮；按状态文案分支：available/downloading/ready

---

## 5.3 PageHeader

### 职责

- 解析并展示当前视图标题
- 显示活跃 profile 标签
- 承载右侧操作区及窗口控制按钮

### 标题解析策略

- `profile-workspace:{id}` → `Profile: {id}`（无 id 则 fallback）
- `aios-workspace` → `Portal`
- `profile-runtime` → `Profile Runtime`
- 其余通过 `resolveViewTitleKey(view)` + i18n `t(key)`

### 交互边界

- Header 顶层启用拖拽区：`.app-drag-region`
- 交互控件区域标记 `.no-drag`，避免 Electron 拖拽吞掉点击

---

## 5.4 WindowControls

### 职责

- 提供窗口最小化、最大化/还原、关闭操作
- 同步窗口最大化状态并更新按钮图标与 aria-label

### 平台规则

- macOS 直接返回 `null`（依赖系统原生窗口控制）
- 非 macOS 通过 `window.hermesAPI.windowControls` 调用：
  - `minimize()`
  - `maximizeOrRestore()`
  - `close()`
  - `isMaximized()`

### 生命周期

- 初始执行 `syncMaximized()`
- 监听 `window.resize` 再同步最大化状态

---

## 5.5 WorkspaceOutlet

### 职责

- 根据 `view` 渲染对应业务页面
- 将导航层状态（session/profile/messages）向业务 Screen 分发
- 在 remote mode 下对不支持功能渲染 `RemoteNotice`

### 关键输入

- 视图控制：`view`、`onNavigate`
- Profile/Session：`activeProfile`、`currentSessionId`
- 聊天态：`messages`、`setMessages`、`onNewChat`、`onResumeSession`
- Profile 行为：`onSelectProfile`、`onChatWithProfile`
- 可见性状态：`officeVisited`

### 渲染覆盖

- 支持主导航视图（chat/sessions/agents/office/models/...）
- 支持工作台视图：`aios-workspace`、`profile-runtime`
- 支持动态视图：`profile-workspace:{id}`

### 显示策略

- 对部分重量组件采用 `display: view === ... ? "flex" : "none"` 保持容器稳定
- 远程模式下 Sessions/Agents/Providers/Skills/Soul/Memory/Tools/Gateway 等显示受限提示

---

## 5.6 StatusBar

### 职责

- 展示运行摘要信息：
  - `Profile: {activeProfile}`
  - `Mode: local|remote`
  - `Update: {updateState|idle}`

### 可访问性

- 使用 `role="status"` 提示辅助技术该区域为状态输出

---

## 5.7 ModalLayer / DrawerLayer

### 职责

- 当前为占位实现（返回空 Fragment）
- 作为全局弹层/抽屉容器的保留挂载点

### 设计意图

- 保证未来新增全局浮层无需修改 `DesktopShell` 结构
- 统一跨页面浮层生命周期管理入口

---

## 6. 样式规格（Style Spec）

layout 相关样式集中在 `main.css`，采用 design token + BEM/语义类混合命名。

### 6.1 主布局

- `.layout`: `display:flex; flex:1; overflow:hidden;`
- `.sidebar`: 固定宽度 `230px`，纵向 flex，圆角 `16px`
- `.content`: `flex:1`，列布局，隐藏溢出
- `.desktop-shell__main`: 主列容器，`min-width:0` 防止内容撑破
- `.desktop-shell__outlet`: `flex:1; min-height:0` 支持内部滚动

### 6.2 侧边栏

- `.sidebar-nav-item`：按钮化导航项，hover/active 双态
- `.sidebar-nav-divider`：分组分隔线
- `.sidebar-nav-group-label`：组标题（11px、大写、字距增强）
- `.sidebar-footer`：更新操作与信息区

### 6.3 页头与窗口控制

- `.page-header`: 高度约束 + 底边框 + 左右分布
- `.app-drag-region` / `.no-drag`: Electron 拖拽区隔离规则
- `.window-controls`: 高度 `36px`、右对齐
- `.window-control-button--close:hover`: 红色警示背景

### 6.4 状态栏

- `.status-bar`: 高度 `24px`，小字号弱化文本
- `.status-bar__item`: `white-space: nowrap` 防换行

---

## 7. 类型契约（Type Contract）

位于 `src/renderer/src/types/desktop-shell.ts`：

- `View`: layout 的核心视图联合类型，含模板字面量 `profile-workspace:${string}`
- `NavItem`: `view + icon + labelKey`
- `UpdateState`: `"available" | "downloading" | "ready" | null`
- `resolveViewTitleKey(view)`: 视图到 i18n key 的映射入口

Agent 在新增视图时需同时更新：

1. `View` 联合类型
2. `VIEW_TITLE_KEYS`
3. `Layout.tsx` 的 `NAV_ITEMS`（若需要导航入口）
4. `WorkspaceOutlet` 对应渲染分支

---

## 8. 状态与数据流（Data Flow Spec）

`Layout.tsx` 是唯一装配层，状态来源如下：

- `useDesktopNavigation()`：view、profile、chat/session、导航动作
- `useUpdateState()`：版本更新状态与更新动作
- `useRemoteMode(view)`：远程模式判定
- `useProfileEntries()`：Portal/Experts 入口数据

流向关系：

- `Layout` -> `DesktopSidebar`: 导航、更新、profile entries
- `Layout` -> `PageHeader`: 当前 view + activeProfile
- `Layout` -> `WorkspaceOutlet`: 业务屏幕渲染所需全部状态与回调
- `Layout` -> `StatusBar`: profile/mode/update 摘要

---

## 9. 扩展规范（Agent Execution Rules）

### 9.1 新增一个主导航视图

必须同步修改：

1. `types/desktop-shell.ts` 的 `View` 与 `VIEW_TITLE_KEYS`
2. `screens/Layout/Layout.tsx` 的 `NAV_ITEMS`
3. `components/layout/WorkspaceOutlet.tsx` 渲染分支
4. i18n `navigation.*` 文案

### 9.2 新增全局浮层

- 优先复用 `modalLayer` / `drawerLayer` slot 挂载
- 不在业务 Screen 内分散创建全局层根节点

### 9.3 修改窗口控制能力

- Renderer 仅通过 `window.hermesAPI.windowControls` 调用
- 不在 Renderer 直接引入 Node/Electron API
- 如需新增能力，遵循 Main -> Preload -> d.ts 的 IPC 扩展链

---

## 10. 风险与兼容性

### 10.1 主要风险

- `View` 与 `WorkspaceOutlet` 分支不一致，导致不可达页面
- Header 拖拽区覆盖交互控件，导致按钮不可点击
- 动态视图字符串处理不当，造成标题或路由显示异常
- 远程模式分支遗漏，出现不可用功能入口

### 10.2 兼容性要求

- 保持现有 `DesktopShell` slot API 兼容
- 不破坏 `.layout/.sidebar/.content` 样式语义
- 非 mac 平台继续显示自定义窗口按钮；mac 保持隐藏

---

## 11. 验收清单（Acceptance Checklist）

- [ ] Sidebar、Header、Outlet、StatusBar 均正常渲染
- [ ] 导航切换后 `WorkspaceOutlet` 对应 Screen 正确显示
- [ ] `profile-workspace:{id}` 标题与页面路由一致
- [ ] WindowControls 在 Windows 可用，在 macOS 隐藏
- [ ] Remote mode 下限制页面显示 `RemoteNotice`
- [ ] 更新按钮在 available/downloading/ready 三态文案正确
- [ ] 状态栏 profile/mode/update 信息正确

---

## 12. 快速参考（For Agent）

### 关键文件

- `src/renderer/src/screens/Layout/Layout.tsx`
- `src/renderer/src/components/layout/*`
- `src/renderer/src/types/desktop-shell.ts`
- `src/renderer/src/assets/main.css`

### 最小改动原则

- 先改类型，再改导航，再改 outlet 分支
- 布局层只做装配，不沉淀业务逻辑
- 优先复用已有样式类，避免新增破碎命名
