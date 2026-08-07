# 08 — Expert Teams 页面 Spec

## 1. 目标

专家团队列表与召唤；**desktop 只调 team tool**，不本地编排成员。

## 2. 不做范围

- 本地多专家并发调度  
- `TeamSummonDrawer` 薄包装（已删除，直接用 `ExpertSummonDrawer`）  

## 3. 涉及文件

| 类型 | 路径 |
|------|------|
| 页面 | `pages/ExpertTeams/HermesExpertTeamsPage.tsx` |
| 组件 | `ExpertTeamCard.tsx`、`TeamDetailDrawer.tsx` |
| 共享 | `pages/Experts/components/ExpertSummonDrawer.tsx` |
| Features | `features/expert-team/useExpertTeams.ts` |
| Model | `model/expert-team.ts` |

## 4. 召唤

```tsx
<ExpertSummonDrawer
  target={callTarget?.kind === "expert_team" ? callTarget : null}
  …
/>
```

`ExpertSummonTarget.kind`: `"expert" | "expert_team"`

## 5. UI

- 复用 `ExpertFilterBar`、`ExpertGrid`  
- 团队卡片展示 `orchestration: server_managed` 语义（文案 i18n）  

## 6. 验收标准

- [ ] 团队列表/过滤正常  
- [ ] 召唤团队 → run → navigateToRun  
- [ ] 无成员级单独 summon 按钮  

## 7. Cursor 执行提示

团队与专家共用 FilterBar/Grid 时，勿复制粘贴页面；抽 props 类型到 `model/` 或共享 components。
