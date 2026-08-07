# 06 — Workbench 页面 Spec

## 1. 目标

Workbench 为 **默认首页**：连接状态、快捷任务、推荐专家/团队、最近运行与成果。

## 2. 不做范围

- `PendingConfirmations` 区块（PRD 8.1 描述，v1.3 未交付）  
- 改 Main 网关进程逻辑  

## 3. 涉及文件

| 类型 | 路径 |
|------|------|
| 页面 | `pages/Workbench/HermesWorkbenchPage.tsx` |
| 组件 | `pages/Workbench/components/ConnectionStatusCard.tsx` |
| | `QuickTaskEntry.tsx`、`RecommendedExperts.tsx`、`RecommendedTeams.tsx` |
| | `RecentRuns.tsx`、`RecentArtifacts.tsx` |
| Features | `features/workbench/useWorkbenchOverview.ts` |
| | `features/workbench/useQuickTaskEntry.ts` |
| | `features/workbench/workbenchRecommend.ts` |
| 共享 Drawer | `pages/Experts/components/ExpertSummonDrawer.tsx` |

## 4. 组件职责

| 组件 | 输入 | 输出/行为 |
|------|------|-----------|
| ConnectionStatusCard | gatewayHealth, diagnostics, gatewayOnline | 离线引导；跳转 mcpGateway |
| QuickTaskEntry | prompt, selectedExpert, disabled | 打开 ExpertSummonDrawer |
| Recommended* | lists | setActiveNavItem / open summon |
| RecentRuns | runs | navigateToRun |
| RecentArtifacts | artifacts | preview + navigateToRun |

## 5. 数据流

```text
useWorkbenchOverview.refresh()
  → workApi.experts.listPage / teams.listPage / runs.list / artifacts.listLocal
  → workApi.gateway.health / diagnostics / desktopSyncStatus

QuickTask → ExpertSummonDrawer → onSuccess → navigateToRun
```

## 6. 错误处理

- `gatewayOnline === false`：QuickTask disabled；ConnectionStatusCard 显示 offlineGuide  
- `error`：页面顶栏下 `hermes-page__error` + refresh  
- mock 模式：`!window.hermesExperts` 时用 MOCK 推荐列表  

## 7. UI 要求

- 使用 `.hermes-workbench-grid`、`.hermes-workbench-card`、`.hermes-offline-guide`  
- 禁止在 Workbench 内嵌完整 Runs/Artifacts 页，只用摘要卡片  

## 8. 验收标准

- [ ] 进入 local-hermes 默认 workbench  
- [ ] 离线有引导；在线有推荐与最近项  
- [ ] 快捷任务可走 summon → runs  

## 9. Cursor 执行提示

改 Workbench 数据：先改 `features/workbench/`，Page 只做布局与回调绑定。
