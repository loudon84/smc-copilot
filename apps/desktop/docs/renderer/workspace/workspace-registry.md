# Workspace Registry

> `src/renderer/src/workspace/workspace-registry.ts`

## STATIC_WORKSPACE_MODULES

静态 Workspace 模块注册表，定义顶栏 Tab 和视图分发的元数据。

### 字段含义

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `StaticWorkspaceId` | 唯一标识，也是顶栏 Tab ID 和路由 key |
| `titleKey` | `string` | i18n 翻译 key（如 `"navigation.webOperator"`） |
| `kind` | `"webview" \| "react" \| "composite"` | 渲染方式，决定 `WorkspaceRenderer` 分发路径 |
| `closeable` | `boolean` | 是否可关闭（当前全部 `false`） |
| `draggable` | `boolean` | 是否可拖拽排序（当前全部 `false`，仅 `external-browser:*` 可拖） |
| `persistable` | `boolean` | 是否持久化 Tab 顺序到 `main-page-state.json` |
| `showInTabBar` | `boolean?` | 为 `false` 时不在顶栏显示，但仍可通过导航访问（默认 `true`） |
| `shellLayerId` | `string?` | ShellView 层 ID，用于 `WebContentsHost.setBounds()`；仅 webview/composite 需要 |
| `source` | `WorkspaceSource` | 来源分类（`system` / `local` / `hermes` / `operator` / `crm` / `office` / `external`），影响 Tab 样式 |

### 启用列表

| id | kind | shellLayerId | source | showInTabBar | 说明 |
|---|---|---|---|---|---|
| `web-operator` | `composite` | `"web-operator"` | `operator` | — | WebOperator 浏览器自动化 |
| `crm-workbench` | `react` | — | `crm` | `false` | CRM 工作台（不在 Tab 栏显示） |
| `local-hermes` | `react` | — | `hermes` | — | Local Hermes 三栏操作模块 |

### 注释列表（已禁用）

| id | kind | shellLayerId | source | 说明 |
|---|---|---|---|---|
| `workspaces` | `react` | — | `local` | Workspaces 三栏（原 Portal 入口） |
| `portal` | `webview` | `"portal"` | `system` | Portal WebView（嵌入 :3000） |
| `task-workbench` | `react` | — | `local` | 本地任务三栏 |
| `office` | `react` | — | `office` | Office 模块 |

## 辅助函数

### `resolveWorkspaceModule(workspaceId: string): WorkspaceModule | null`

- `external-browser:*` 前缀 → 返回 `null`（动态 Tab，不走静态注册表）
- 否则从 `staticById` Map 查找

### `isStaticWorkspaceId(id: string): boolean`

判断是否为注册表中的静态 Workspace ID。
