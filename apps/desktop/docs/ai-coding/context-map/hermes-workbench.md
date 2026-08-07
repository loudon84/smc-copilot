# Context Map — Hermes Work 专家工作台

> 顶栏 Tab `local-hermes`。产品名 Work 专家工作台，代码标识 `Work*` / `workApi`。

## 必读 Spec Pack（改页面前）

```text
docs/specs/v1.3-workbuddy-product-line/00-overview.md
docs/specs/v1.3-workbuddy-product-line/03-layout-boundary.md
docs/specs/v1.3-workbuddy-product-line/13-ai-coding-structure.md
```

按页面打开 06–10；执行前缀：`16-cursor-execution-prompt.md`

## 目录结构

```text
src/renderer/src/screens/Hermes/
├── HermesShell.tsx           # 三栏壳
├── pages/                    # 各导航页
│   ├── Workbench/
│   ├── Experts/ ExpertTeams/ ExpertRuns/
│   ├── Artifacts/ Tasks/ Chat/ …
├── features/                 # 取数与状态
├── api/                      # hermesDefaultApi / workTaskApi
└── Hermes.css                # .hermes-* 样式（复用，勿复制）
```

## 主流程

```text
Workbench → Experts / ExpertTeams → Summon → ExpertRuns → Artifacts
```

## API 边界

| 用途 | API | 禁止 |
|------|-----|------|
| default profile Hermes 运维 | `window.hermesAPI` / `hermesDefaultApi` | `workspaceChat` |
| Expert 远程目录 | `window.hermesExperts` | Renderer 直连 fetch |
| Work 任务 SSE | `window.work` / `workTaskApi` | 混用 workspaceChat |

## UI Checklist（摘要）

- 根节点 `hermes-page` + 语义 class
- loading / empty / error 三态
- 样式用 CSS 变量 + `Hermes.css`
- i18n：`workspaces.hermes.*` en + zh-CN

## Rules

- `.cursor/rules/workbuddy-product-line.mdc`
- `.cursor/rules/hermes-renderer-structure.mdc`
- `.cursor/rules/work-product.mdc`

## 文档

- `docs/renderer/screens/Hermes.md`
- `docs/specs/v7.2-nodeskclaw-remote-experts/`（Expert MCP  pivot）
