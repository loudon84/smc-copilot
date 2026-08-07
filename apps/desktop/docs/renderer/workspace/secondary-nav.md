# 二级导航配置

> `src/renderer/src/workspace/has-global-secondary-nav.ts`
> `src/shared/workspace/workspace-secondary-nav.ts`

## hasGlobalSecondaryNav

**文件**：`has-global-secondary-nav.ts`

```ts
function hasGlobalSecondaryNav(view: View): boolean
```

判断当前视图是否需要显示全局 `DesktopSidebar`（二级导航侧栏）。

逻辑：
1. `view` 非字符串或非静态 Workspace ID → `false`
2. 查询 `SECONDARY_NAV_BY_WORKSPACE[view]`，长度 > 0 → `true`

## SECONDARY_NAV_BY_WORKSPACE

**文件**：`workspace-secondary-nav.ts`

各 Workspace 的二级 panel 列表配置：

| Workspace ID | 二级 Panel 列表 | 说明 |
|---|---|---|
| `portal` | `[]` | 无侧栏 |
| `workspaces` | `[]` | 三栏自包含，不需要全局侧栏 |
| `local-hermes` | `[]` | 三栏自包含 |
| `task-workbench` | `[]` | team_v1.5 三栏自包含 |
| `web-operator` | `["browser-state", "crm-context", "hermes-task", "page-structure", "action-log"]` | 5 个二级面板 |
| `crm-workbench` | `[]` | 无侧栏 |
| `office` | `["office"]` | Office 模块 |

### web-operator 面板说明

| Panel ID | i18n Key | 图标 | 说明 |
|---|---|---|---|
| `browser-state` | `navigation.browserState` | `Monitor` | 浏览器状态 |
| `crm-context` | `navigation.crmContext` | — | CRM 上下文 |
| `hermes-task` | `navigation.hermesTask` | — | Hermes 任务 |
| `page-structure` | `navigation.pageStructure` | — | 页面结构（DOM） |
| `action-log` | `navigation.actionLog` | `ScrollText` | 操作日志 |

## SECONDARY_PANEL_LABEL_KEYS

所有 `WorkspaceSecondaryPanel` 的 i18n 标签映射：

| Panel | i18n Key |
|---|---|
| `chat` | `navigation.chat` |
| `sessions` | `navigation.sessions` |
| `agents` | `navigation.agents` |
| `workspace` | `workspaces.tabs.workspace` |
| `skills` | `workspaces.tabs.skills` |
| `memory` | `workspaces.tabs.memory` |
| `runtime` | `workspaces.tabs.runtime` |
| `browser-state` | `navigation.browserState` |
| `crm-context` | `navigation.crmContext` |
| `hermes-task` | `navigation.hermesTask` |
| `page-structure` | `navigation.pageStructure` |
| `action-log` | `navigation.actionLog` |
| `office` | `navigation.office` |

## 辅助函数

### `defaultSecondaryPanel(workspaceId): string | undefined`

返回指定 Workspace 的默认（第一个）二级面板。

### `isSecondaryPanelForWorkspace(workspaceId, panel): boolean`

判断某个 panel 是否属于指定 Workspace 的二级导航。
