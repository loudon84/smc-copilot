# 04 — Hermes Shell 重构说明

## 1. 目标

记录 **HermesShell 装配逻辑** 的现行实现，供 Agent 改壳层时不破坏 lazy load、ErrorBoundary 与 gateway redirect。

## 2. 不做范围

- 物理搬迁到 `shell/` 目录（v1.3 后迭代）  
- 合并 Right Panel 与 Settings Drawer  

## 3. 涉及文件

| 文件 | 说明 |
|------|------|
| `panels/HermesShell.tsx` | 三栏 grid + page loader |
| `components/HermesSidebar.tsx` | 左栏 |
| `panels/HermesRightPanel.tsx` | 右栏 Inspector |
| `panels/HermesRightPanelRail.tsx` | 右栏折叠轨 |
| `components/HermesPageErrorBoundary.tsx` | 页级错误边界 |
| `components/HermesPageSkeleton.tsx` | Suspense fallback |

## 4. 数据流

```text
activePanel ?? activeNavItem → pageKey
  → HERMES_PAGE_REGISTRY[pageKey] (lazy)
  → Suspense → HermesPageErrorBoundary → Page

useGatewayNavGate:
  requiresGateway && !gatewayOnline → setActiveNavItem("workbench")
```

## 5. Context 依赖

`useHermesDefault()` 提供：

- `activeNavItem` / `setActiveNavItem`（localStorage 持久化）  
- `leftPanelCollapsed` / `rightPanelCollapsed`  
- `navItems`（来自 `HERMES_NAV_ITEMS`）  
- `navigateToExpertRun` / `pendingExpertRunId`  

## 6. 验收标准

- [ ] 切换 nav 无 full remount Layout  
- [ ] lazy 页首次进入显示 Skeleton  
- [ ] 网关离线时不在 experts/runs 等页停留  

## 7. Cursor 执行提示

改 Shell 时不 import 具体 Page 组件，只通过 `registry/hermes-pages.tsx`。
