# Workspace 渲染体系

> `src/renderer/src/workspace/` + `src/shared/workspace/`

Workspace 模块负责顶栏 Tab 注册、视图分发和二级导航配置。

## 文档索引

| 文档 | 内容 |
|---|---|
| [workspace-registry.md](workspace-registry.md) | `STATIC_WORKSPACE_MODULES` 定义、字段含义、启用/注释列表 |
| [workspace-renderer.md](workspace-renderer.md) | `WorkspaceRenderer` 分发逻辑：kind → Screen 映射 |
| [secondary-nav.md](secondary-nav.md) | `hasGlobalSecondaryNav` 判定 + 二级 panel 列表 |

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/renderer/src/workspace/workspace-registry.ts` | 静态 Workspace 模块注册表 + 解析函数 |
| `src/renderer/src/workspace/workspace-tabs.ts` | 构建 TopBar Tab 列表（static + external） |
| `src/renderer/src/workspace/resolve-workspace.ts` | 解析 ShellView layerId |
| `src/renderer/src/workspace/has-global-secondary-nav.ts` | 判断是否显示全局 DesktopSidebar |
| `src/shared/workspace/workspace-contract.ts` | WorkspaceModule / WorkspaceKind / WorkspaceSecondaryPanel 类型 |
| `src/shared/workspace/workspace-secondary-nav.ts` | 二级导航配置 + panel 标签映射 |
