---
name: sync-project-docs
description: >-
  在代码计划或功能实现完成后，根据 git diff 将变更增量同步到 AGENTS.md、docs 核心文档
  （INDEX / READING_GUIDE / ARCHITECTURE / API_CONTRACTS）及 docs/renderer/ 专项文档。
  在计划最后阶段、功能收尾、新增/修改 IPC、架构、路由或 Renderer Screen 后使用。
---

# Sync Project Docs

将本次代码变更反映到项目文档。目标：**增量、准确、可导航**，不是重写全书。

Rule：`.cursor/rules/007-sync-project-docs.mdc`

## 文档分层

| 层级 | 路径 | 同步策略 |
|---|---|---|
| Agent 入口 | `AGENTS.md` | 版本、目录地图、Preload API、路由、文档体系、按功能跳转 |
| 核心 docs | `docs/INDEX.md`、`READING_GUIDE.md`、`ARCHITECTURE.md`、`API_CONTRACTS.md` | 按变更类型增量更新 |
| Renderer 专项 | `docs/renderer/**` | UI / Screen / Workspace 变更时更新对应页 |
| 参考树 | [doc-tree.md](doc-tree.md) | skill 内目录对照，非产品文档 |
| 默认跳过 | `docs/MODULES.md`、`code-assets/`、`memory-bank/` | 除非用户明确要求 |

段落映射见 [doc-map.md](doc-map.md)。

## 触发时机

- `.cursor/plans/*.plan.md` 全部 stage 标记 done
- 用户说「更新文档」「同步 AGENTS」「文档跟代码对齐」
- 新增/修改 IPC、Preload API、启动门控、模块目录、架构分层
- 新增/修改 Renderer Screen、workspace registry、组件族（见 doc-map Renderer 段）

## 工作流

```
1. 收集变更  →  git diff --stat + --name-only + 读关键新文件
2. 分类影响  →  IPC / 架构 / 路由 / Main 模块 / Renderer / 版本
3. 查 doc-map  →  确定最低更新集（核心 docs + renderer 对应页）
4. 增量编辑  →  只改相关段落；IPC 详情以 API_CONTRACTS 为单一事实源
5. 自检       →  路径存在、channel 与代码一致、AGENTS 与 INDEX 版本对齐
6. 汇报       →  文档同步摘要
```

### Step 1：收集变更

```bash
git --no-pager diff --stat
git --no-pager diff --name-only
```

优先读：

- Main：`src/main/index.ts`、相关 `*-ipc.ts`
- Preload：`src/preload/*.ts`、`index.d.ts`
- Shared：`src/shared/**/*.ts`
- Renderer：`src/renderer/src/screens/**`、`workspace/**`、`components/**`
- 对照 [doc-tree.md](doc-tree.md) 定位应改的 renderer 文档页

### Step 2：分类 checklist

```
变更分类:
- [ ] 新/改 IPC channel
- [ ] 新/改 Preload 全局 API（hermesAPI / desktopAuth / smcShell 等）
- [ ] 新/改 shared 契约类型
- [ ] 新/改 Main 模块或目录
- [ ] 新/改 Renderer Screen / 组件族 / Hook
- [ ] workspace registry / Tab / secondary-nav
- [ ] 架构/进程边界变化
- [ ] 版本里程碑（V3.x / V5.x / hotfix）
- [ ] 阅读路径变化（READING_GUIDE 或 docs/renderer）
- [ ] 新增 docs 文件或子树（AGENTS 文档体系 + INDEX 链接）
```

### Step 3：逐文档更新

| 原则 | 说明 |
|---|---|
| 增量 | 只改与 diff 相关的表格行、bullet、版本段 |
| 对齐代码 | IPC 名、文件路径、全局 API 名必须与源码一致 |
| 单一事实源 | 完整 IPC 表在 `API_CONTRACTS.md`；AGENTS/INDEX 摘要 + 链接 |
| Renderer 就近 | Screen 细节写 `docs/renderer/screens/`，不重复灌进 ARCHITECTURE |
| 版本一致 | `AGENTS.md` 与 `docs/INDEX.md` 版本行保持一致 |

### Step 4：自检

- [ ] 文档中每个文件路径在仓库中存在（或标注 legacy / retained）
- [ ] 每个 IPC channel 在 Main 有 handler、Preload 有封装
- [ ] `docs/renderer/screens/INDEX.md` 的 active/retained 与 `workspace-registry.ts` 一致
- [ ] 无「可能」「大概」；不确定标 `UNKNOWN` 并注明需读的文件
- [ ] 未删除 unrelated 历史版本段（除非用户要求整理）

### Step 5：汇报格式

```markdown
## 文档同步摘要

| 文档 | 更新内容 |
|---|---|
| AGENTS.md | … |
| docs/INDEX.md | … |
| docs/READING_GUIDE.md | … |
| docs/ARCHITECTURE.md | … |
| docs/API_CONTRACTS.md | … |
| docs/renderer/… | …（若有 Renderer 变更） |

未改文档原因（若有）: …
```

## 快速决策树

**新增 IPC？** → 必改 `API_CONTRACTS.md`；AGENTS + INDEX；READING_GUIDE 若新模块则加阅读链

**新 Preload API 对象？** → AGENTS「Preload 暴露的全局 API」+ `renderer/PRELOAD_API_USAGE.md`（Renderer 消费边界）+ ARCHITECTURE 进程模型段

**新 Main 子目录？** → INDEX「核心目录」+ AGENTS「目录地图」+ READING_GUIDE 功能阅读段

**启动/路由变化？** → AGENTS「应用路由」+ `renderer/APP_STARTUP.md` + ARCHITECTURE + API_CONTRACTS Startup Gate

**新 Screen / registry 变化？** → `renderer/screens/INDEX.md` + `renderer/screens/<Screen>.md` + `renderer/INDEX.md` + AGENTS 视图表

**WebOperator 子功能？** → `renderer/screens/WebOperator.md` + `renderer/screens/web-operator/*.md` + API_CONTRACTS Web Operator 段

**workspace / Tab / 二级 nav？** → `renderer/workspace/*.md` + `WORKSPACE_ROUTING.md` + `secondary-nav.md`

**版本 hotfix？** → INDEX 版本特性段 + AGENTS「版本特性索引」+ ARCHITECTURE「版本历史」首条

**仅样式/CSS？** → 通常跳过；全局样式策略变则改 `renderer/STYLES.md`

## 示例（精简）

**变更**：新增 `auth:get-endpoint-config` IPC + `auth-endpoint-config-store.ts`

| 文档 | 动作 |
|---|---|
| API_CONTRACTS.md | Desktop Auth 表增一行 channel |
| AGENTS.md | 目录地图 `src/main/auth/` 补 endpoint store；按功能跳转加一行 |
| INDEX.md | V3.3 段补 endpoint config 能力 |
| READING_GUIDE.md | 可选「阅读 Auth」小节 |
| renderer/APP_STARTUP.md | 仅当 login 屏行为变化时 |

**变更**：WebOperator 新增 Hermes Task 侧栏（无新 IPC）

| 文档 | 动作 |
|---|---|
| renderer/screens/web-operator/HERMES_TASK_FLOW.md | 任务流、组件、状态 |
| renderer/screens/WebOperator.md | 侧栏 panel 列表 |
| renderer/screens/INDEX.md | 若 Screen 状态变化 |
| API_CONTRACTS.md | 仅当新增 task session IPC 时 |

## 禁止

- 不更新 `docs/MODULES.md`（除非用户明确要求）
- 不在文档中暴露 token/secret 字段
- 不用占位符假路径（`xxx.ts`）
- 不因文档同步而改业务代码
- 不把 Renderer 细节全部复制进 ARCHITECTURE（用 `docs/renderer/` 链式引用）
