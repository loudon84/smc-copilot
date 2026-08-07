# docs/ 目录树（sync-project-docs 参考）

> 文档同步时用于定位目标文件。辅助目录（code-assets / memory-bank / superpowers）**不由本 skill 自动维护**，除非用户明确要求。

## 核心层（Main / Preload / 契约）

| 路径 | 职责 |
|---|---|
| `docs/INDEX.md` | 项目全景、版本特性、核心目录、Renderer 入口链接 |
| `docs/ARCHITECTURE.md` | 三层进程、Gateway、主界面布局演进 |
| `docs/MODULES.md` | Main / Preload / Renderer 模块边界（**默认不自动同步**） |
| `docs/API_CONTRACTS.md` | IPC 完整契约（单一事实源） |
| `docs/READING_GUIDE.md` | 分阶段 + 功能域阅读链 |
| `docs/DO-NOT-TOUCH.md` | 禁止擅自修改的核心文件 |

## Renderer 层（`docs/renderer/`）

| 路径 | 职责 |
|---|---|
| `docs/renderer/INDEX.md` | Renderer 总入口、Workspace 启用状态、分发逻辑 |
| `docs/renderer/APP_STARTUP.md` | splash → login → main 启动门控 |
| `docs/renderer/MAIN_LAYOUT.md` | Layout / MainPage / MainTopBar / WorkspaceOutlet |
| `docs/renderer/WORKSPACE_ROUTING.md` | workspace-registry / WorkspaceRenderer |
| `docs/renderer/STATE_AND_CONTEXT.md` | mainPageState、Context、KeepAlive |
| `docs/renderer/PRELOAD_API_USAGE.md` | Renderer 侧 `window.*` 使用边界 |
| `docs/renderer/COMPONENTS.md` | 组件族概览 |
| `docs/renderer/HOOKS.md` | Hooks 概览 |
| `docs/renderer/STYLES.md` | 样式策略 |

### `docs/renderer/screens/`

| 路径 | 对应源码 |
|---|---|
| `screens/INDEX.md` | 全部 Screen 的 active / retained 分类 |
| `screens/<Name>.md` | `src/renderer/src/screens/<Name>/` 或等价模块 |
| `screens/web-operator/*.md` | `src/renderer/src/screens/WebOperator/` 子域 |

当前 Screen 详情页：`CrmWorkbench`、`Hermes`、`Install`、`Layout`、`Login`、`MainPage`、`Office`、`Portal`、`SettingsDrawer`、`Setup`、`SplashScreen`、`TaskWorkbench`、`WebOperator`、`Welcome`、`Workspaces`。

WebOperator 子文档：`CRM_BRIDGE_UI`、`FRAME_HTML_INSPECTOR`、`HERMES_TASK_FLOW`、`PAGE_CONTEXT`、`PANELS`。

### `docs/renderer/components/`

| 路径 | 组件族 |
|---|---|
| `components/INDEX.md` | 组件索引 |
| `components/layout.md` | layout 组件 |
| `components/shell.md` | shell / WebContentsHost |
| `components/hermes.md` | Hermes 侧栏 / Chat 组件 |
| `components/workspace.md` | workspace UI |
| `components/install.md` | 安装向导组件 |

### `docs/renderer/workspace/`

| 路径 | 职责 |
|---|---|
| `workspace/INDEX.md` | Workspace 文档索引 |
| `workspace/workspace-registry.md` | registry 与 Tab 规则 |
| `workspace/workspace-renderer.md` | kind 分发 |
| `workspace/secondary-nav.md` | 二级侧栏 panel |

## 辅助层（通常跳过）

| 路径 | 说明 |
|---|---|
| `docs/code-assets/` | API / 组件 / 模式索引 |
| `docs/memory-bank/` | 架构决策、踩坑、项目摘要 |
| `docs/specs/` | UI spec 模板 |
| `docs/superpowers/` | 发布/平台专项计划 |
| `prd/` | 产品需求（版本里程碑，非 docs/ 内） |

## Screen 文档命名对照

| Screen 目录 | 文档文件 |
|---|---|
| `screens/Crm/` | `screens/CrmWorkbench.md` |
| `modules/auth/LoginScreen.tsx` | `screens/Login.md` |
| 其他顶层 `screens/<Dir>/` | `screens/<Dir>.md`（与目录名一致，首字母大写） |
