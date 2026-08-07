# v1.3 Work 专家工作台 — Spec Pack 总览

> **产品线对外名**：Work 专家工作台 / Work Expert Workspace  
> **代码域标识**：`Work*`、`workApi`（禁止 `workbuddy` 作为代码名）  
> **Screen 路径**：`src/renderer/src/screens/Hermes/`  
> **PRD 源**：`prd_work/v1.3_project-layout-prompt.md`

## 1. 目标

本 Spec Pack 为 Cursor / AI Agent 提供 **单一事实源**，在改 Layout 壳层或 Hermes Screen 页面时：

1. 不破坏 Main / Preload / Renderer 边界  
2. 按 **pages → features → workApi → Preload** 分层写代码  
3. 复用既有 **Hermes.css** 页面与布局类名，避免「AI slop」式随意样式  
4. 每次只做一个可验收小闭环  

## 2. 阅读顺序

| 顺序 | 文件 | 何时读 |
|------|------|--------|
| 1 | [01-current-structure-analysis.md](./01-current-structure-analysis.md) | 首次进入 Hermes 模块 |
| 2 | [03-layout-boundary.md](./03-layout-boundary.md) | 改 Layout / MainPage / 三栏壳层 |
| 3 | [13-ai-coding-structure.md](./13-ai-coding-structure.md) | **每次写 UI 前必读** |
| 4 | [05-page-registry.md](./05-page-registry.md) | 增删导航页 |
| 5 | 06–10 页面 Spec | 改具体页面 |
| 6 | [11-api-client-and-domain-model.md](./11-api-client-and-domain-model.md) | 改数据层 |
| 7 | [16-cursor-execution-prompt.md](./16-cursor-execution-prompt.md) | 复制为 Agent 任务前缀 |

## 3. 迁移状态（截至 v1.3 Phase 6）

| §17 阶段 | 状态 |
|----------|------|
| Phase 1 Registry & Shell | ✅ 功能完成（`shell/` 物理目录延后） |
| Phase 2 Domain & workApi | ✅ |
| Phase 3 Experts / Teams | ✅ |
| Phase 4 Runs / Artifacts | ⚠️ Import Dialog 组件存在，页面未接线 |
| Phase 5 Workbench | ✅ |
| Phase 6 高级分组 + 门控 | ✅ |

## 4. 相关文档（勿重复编造）

| 文档 | 用途 |
|------|------|
| `docs/renderer/MAIN_LAYOUT.md` | 全局 Layout / MainPage |
| `docs/renderer/WORKSPACE_ROUTING.md` | `local-hermes` 挂载 |
| `docs/renderer/screens/Hermes.md` | Hermes Screen 索引 |
| `docs/API_CONTRACTS.md` § Hermes Experts | IPC 契约 |
| `AGENTS.md` | 项目 Agent 入口 |

## 5. Cursor 硬约束（摘要）

```text
✅ pages 调 features hooks；features 调 workApi / hermesDefaultApi
✅ 页面 UI 用 Hermes.css 既有 class（hermes-page / hermes-btn-ghost / …）
✅ i18n：workspaces.* en + zh-CN 同步
✅ 改完 npm run typecheck

❌ pages / components 禁止 window.hermesExperts / ipcRenderer / fetch nodeskclaw
❌ 禁止改 Layout.tsx / MainPage 壳层（除非 PRD 明确要求）
❌ 禁止新建第二套全局 CSS 变量或 Tailwind 在 Hermes 内
❌ 禁止 any 绕过 IPC 类型
```
