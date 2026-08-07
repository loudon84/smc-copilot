# Work 域 — 概述（v1.3）

> **产品**：SMC Copilot  
> **Work 域**：Work 专家工作台（代码路径 `screens/Hermes/`，workspace id `local-hermes`）  
> **UX 参考**：WorkBuddy（腾讯）式专家召唤流程；**非**产品改名

## 目标

将 Hermes Screen 从「配置 + 专家 + MCP 平铺导航」收敛为 Work 主流程：

```text
连接专家网关 → 浏览专家/团队 → 召唤 → 运行追踪 → 成果消费
```

高级能力（MCP、技能、模型、Provider 等）折叠在「能力管理 / 高级设置」分组。

## 目录结构（Renderer）

```text
screens/Hermes/
  model/       Work* 域类型 + HermesPageSection
  registry/    hermes-pages.tsx（页面元数据 + lazy 组件）
  api/         workApi.ts → window.hermesExperts
  features/    （后续）业务 hooks
  pages/       页面编排
  components/  HermesSidebar（分组导航）等
  panels/      HermesShell 三栏壳
```

## 导航分组

| section | 默认 | 页面 |
|---------|------|------|
| primary | 展开 | workbench, chat, experts, expertTeams, expertRuns, artifacts |
| capability | 折叠 | skillCenter, mcp, mcpGateway |
| advanced | 折叠 | sessions, skills, tools, memory, providers, models |

## 边界

- **不改** MainPage / Preload / Main Process 协议（v1.3）
- **不新增** `window.work`
- **不删** 任何现有页面入口

## 相关文档

- PRD：`prd_work/v1.3_project-layout-prompt.md`
- Cursor Rule：`.cursor/rules/work-product.mdc`
- 实施计划：`.cursor/plans/workbuddy_layout_优化_3e191960.plan.md`
