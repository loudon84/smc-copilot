# 文档段落映射（sync-project-docs）

按变更类型定位应更新的段落。编辑前先 `Read` 目标文件，保持现有 Markdown 风格。

完整目录树见 [doc-tree.md](doc-tree.md)。

---

## AGENTS.md

| 段落 | 何时更新 | 典型内容 |
|---|---|---|
| 顶部版本表 | 版本号或里程碑变化 | `0.3.x（V3.x …）` |
| 架构三层 ASCII | 新 Preload 全局对象或后端依赖 | `window.*` 列表 |
| 硬性规则 | 新强制约束（如 IPC 流程） | bullet |
| 目录地图 | 新/改 `src/main|preload|renderer|shared` 目录职责 | 表格行 |
| **文档体系** | 新增 docs 子树或 Renderer 文档页 | 表格行 + 链接 |
| Preload 暴露的全局 API | 新 API 文件或方法面变化 | 表格行 |
| 应用路由与 UI 结构 | splash/login/main 路由、MainPage 结构 | ASCII + bullet |
| 主界面视图表 | 新 workspace tab / screen | 表格 |
| 核心数据流 | 新端到端链路（聊天/Auth/Bootstrap 等） | 代码块流程 |
| 配置文件位置 | 新持久化路径 | 表格行 |
| 新增/修改功能 checklist | 新领域 checklist 条目 | 子节 |
| 主进程模块速查 | 新 main 模块 | 表格行 |
| 按功能跳转 | 新常见任务入口 | 表格行 |
| 版本特性索引 | 每个版本里程碑 | 表格行 |
| 功能/计划完成后：同步文档 | rule / skill 流程变化 | bullet 清单 |

---

## docs/INDEX.md

| 段落 | 何时更新 | 典型内容 |
|---|---|---|
| 顶部版本表 | 与 AGENTS 同步 | 版本字符串 |
| V1.x–V5.x 特性 bullet | 当前版本增量能力 | 新 bullet 或新 `**Vx.x**` 段 |
| 核心目录 | 新目录或职责变化 | 表格行 |
| **Renderer 文档** | 新增 renderer 顶层/子索引页 | bullet 链接 |
| 开发前必须阅读 | rarely | 链接列表 |
| 技术栈 | 新依赖 | 表格行 |
| 禁止行为 | 新安全/架构禁令 | bullet |

---

## docs/READING_GUIDE.md

| 段落 | 何时更新 | 典型内容 |
|---|---|---|
| 第一阶段–第七阶段编号列表 | 新核心文件进入主阅读链 | 插入有序条目 |
| **第六阶段 Renderer** | 新增 renderer 阅读入口 | 指向 `docs/renderer/*.md` |
| 功能阅读顺序各小节 | 新功能域（Auth、Bootstrap、Workspace 等） | 新 `### 阅读 X` + 编号路径 |
| 输出要求 | rarely | 保持不动 |

**功能阅读小节模板：**

```markdown
### 阅读 <Domain>

1. `src/renderer/...` — UI 入口
2. `docs/renderer/screens/<Screen>.md` — Screen 文档（若有）
3. `src/preload/...` — Preload API
4. `src/main/...` — Main 逻辑
5. `src/main/*-ipc.ts` — IPC handler
6. `docs/API_CONTRACTS.md` — <相关 IPC 段>
```

---

## docs/ARCHITECTURE.md

| 段落 | 何时更新 | 典型内容 |
|---|---|---|
| 顶部版本行 | 版本 bump | `> 版本: …` |
| 架构概述 ASCII | 重大分层变化 | 图 |
| 进程模型 / 三层架构 | Renderer 禁则、Preload 桥、Main 职责变化 | bullet |
| 主界面布局 V2.x / V3.x 增量 | MainPage、Workspace、Auth 嵌入 | `### Vx.x 增量` |
| 核心模块 | 新 Shell/Feature 模块 | `### N. …` |
| IPC 契约（架构内摘要） | 新 IPC 类别 | 表格（摘要，详情在 API_CONTRACTS） |
| 数据流 | 新关键流程 | 编号步骤 |
| 目录结构 | 顶层目录变化 | tree |
| 配置路径 | 新配置文件 | 表格 |
| 版本历史 | 每次里程碑 | 新 `### 0.3.x` 段 |

---

## docs/API_CONTRACTS.md

| 段落 | 何时更新 | 典型内容 |
|---|---|---|
| 对应 `###` 小节表格 | 新/改/删 IPC channel | Channel / 参数 / 返回值 / 说明 |
| 类型结构代码块 | 新 request/response 类型 | TypeScript interface |
| Preload 实际通道 | browser/shellView 等 | 与 preload 源码一致 |
| Main → Renderer 事件 | 新 push 事件 | 事件名 + payload |
| 弃用 IPC | 标记 deprecated | 说明替代 channel |

**IPC 表行模板：**

```markdown
| `domain:action` | `{ ... }` | `ReturnType` | 一句话说明 |
```

**新增小节：** 与现有域对齐（安装、Startup Gate、Desktop Auth、ShellView、Web Operator…），勿 invent 新顶级结构除非新域。

---

## docs/renderer/（Renderer 专项）

Renderer 变更时**优先**更新对应页，而非把细节堆进 ARCHITECTURE。

| 文件 | 何时更新 | 典型内容 |
|---|---|---|
| `renderer/INDEX.md` | registry 启用/禁用、顶层结构变化 | Workspace 表、分发 ASCII |
| `renderer/APP_STARTUP.md` | 启动门控、App 路由 screen 变化 | 路由链、useStartupGate |
| `renderer/MAIN_LAYOUT.md` | Layout / MainPage / 顶栏 / 侧栏结构 | 组件树、尺寸常量 |
| `renderer/WORKSPACE_ROUTING.md` | registry、WorkspaceRenderer、kind 分发 | 路由表 |
| `renderer/STATE_AND_CONTEXT.md` | mainPageState、Context、KeepAlive | 状态字段、持久化路径 |
| `renderer/PRELOAD_API_USAGE.md` | Renderer 可用/禁用 API 边界 | window.* 列表 |
| `renderer/COMPONENTS.md` | 新组件族或跨 Screen 复用块 | 组件族表 |
| `renderer/HOOKS.md` | 新全局 Hook | Hook 列表与职责 |
| `renderer/STYLES.md` | 样式策略变化 | CSS 约定 |
| `renderer/screens/INDEX.md` | 新 Screen / active↔retained 变化 | 分类表 |
| `renderer/screens/<Screen>.md` | 该 Screen 结构、IPC、数据流 | 入口、组件、Hook 链 |
| `renderer/screens/web-operator/*.md` | WebOperator 子功能 | 对应 panel / 任务流 |
| `renderer/components/INDEX.md` | 新组件族目录 | 索引行 |
| `renderer/components/<family>.md` | 某组件族重大变更 | 文件列表、用途 |
| `renderer/workspace/*.md` | registry / secondary-nav / 分发逻辑 | 与源码对齐 |

**新增 Screen 时最低集：**

1. `renderer/screens/INDEX.md` — 登记 active/retained
2. `renderer/screens/<Screen>.md` — 新建或更新详情页
3. `renderer/INDEX.md` — 若进入 registry 则更新 Workspace 表
4. `READING_GUIDE.md` — 第六阶段或功能阅读链（若为主链路）

---

## 变更类型 → 最低更新集

| 变更类型 | 必改 | 建议改 |
|---|---|---|
| 新 IPC | API_CONTRACTS | AGENTS checklist、INDEX 目录 |
| 新 screen + IPC | API_CONTRACTS、renderer/screens/* | READING_GUIDE、AGENTS 按功能跳转 |
| 仅 Renderer UI（无 IPC） | renderer/screens/* 或 components/* | renderer/INDEX、MAIN_LAYOUT |
| workspace registry / Tab | renderer/workspace/*、renderer/INDEX | WORKSPACE_ROUTING、AGENTS 视图表 |
| 启动/路由 screen 变化 | renderer/APP_STARTUP、AGENTS 应用路由 | ARCHITECTURE 布局段 |
| 新 Main 子目录 | INDEX、AGENTS 目录地图 | READING_GUIDE、ARCHITECTURE 目录结构 |
| Auth / 启动门控 | API_CONTRACTS、AGENTS 路由、renderer/APP_STARTUP | ARCHITECTURE V3.x、INDEX V3.x |
| 版本 hotfix | INDEX、AGENTS 版本索引、ARCHITECTURE 版本历史 | READING_GUIDE |
| 仅 Renderer 样式 | 通常跳过 renderer/STYLES 除非策略变 | — |
| 仅测试 | 通常跳过 | — |
| 新增 docs 子树 | AGENTS 文档体系、INDEX Renderer/文档段 | doc-tree.md（本 skill） |

---

## 默认不同步（除非用户明确要求）

| 路径 | 原因 |
|---|---|
| `docs/MODULES.md` | 体量大；模块边界变更时手动维护 |
| `docs/code-assets/` | 辅助索引 |
| `docs/memory-bank/` | 历史上下文 |
| `docs/specs/`、`docs/superpowers/` | 专项/模板 |
| `docs/DO-NOT-TOUCH.md` | 仅核心文件清单变化时更新 |
