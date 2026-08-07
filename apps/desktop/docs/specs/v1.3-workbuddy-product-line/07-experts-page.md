# 07 — Experts 页面 Spec

## 1. 目标

专家目录：搜索、分类、卡片网格、详情 Drawer、召唤 Drawer → 创建 run → 跳转运行页。

## 2. 不做范围

- 本地安装专家 Profile  
- 传 `_routing` / `route_config`  

## 3. 涉及文件

| 类型 | 路径 |
|------|------|
| 页面 | `pages/Experts/HermesExpertsPage.tsx` |
| 组件 | `ExpertCard.tsx`、`ExpertFilterBar.tsx`、`ExpertGrid.tsx` |
| | `ExpertDetailDrawer.tsx`、`ExpertSummonDrawer.tsx` |
| Features | `features/expert-catalog/useExpertCatalog.ts` |
| | `features/expert-call/canSummon.ts`、`useNavigateToRun.ts` |
| Model | `model/expert.ts` |

## 4. 召唤路径

```text
ExpertCard 召唤
  → ExpertSummonDrawer（target: expert）
  → workApi.experts.callCatalogSkill / summon（经 Drawer 内 hook）
  → onSuccess(runId) → useNavigateToRun
```

## 5. UI 模式

- 页头：`hermes-page__header` + FilterBar  
- 网格：`ExpertGrid` > `ExpertCard`  
- 状态：`canSummon(expert)` 控制按钮 disabled  
- i18n：`workspaces.hermes.experts.*`  

## 6. 错误处理

- catalog 加载失败：`hermes-page__error` + refresh  
- gateway 离线：Sidebar 已 disabled；若 deep link 会被 Shell redirect  

## 7. 验收标准

- [ ] 搜索/分类生效  
- [ ] 召唤成功跳转 expertRuns 并选中 run  
- [ ] 页面无 `window.hermesExperts` 直接调用  

## 8. Cursor 执行提示

新专家卡片字段：先扩展 `model/expert.ts` + `workApi` mapper，再改 `ExpertCard` 展示。
