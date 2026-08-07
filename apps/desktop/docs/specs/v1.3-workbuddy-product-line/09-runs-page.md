# 09 — Runs 页面 Spec

## 1. 目标

专家运行列表 + 详情：Filter、Timeline、Result、Artifacts、Retry/Cancel。

## 2. 不做范围

- 修改 Main run SQLite schema  
- 本地团队编排 timeline 编辑  

## 3. 涉及文件

| 类型 | 路径 |
|------|------|
| 页面 | `pages/ExpertRuns/HermesExpertRunsPage.tsx` |
| 组件 | `RunFilterBar.tsx`、`RunList.tsx`、`RunDetailPanel.tsx` |
| | `RunTimeline.tsx`、`RunResult.tsx`、`RunArtifacts.tsx`、`RunErrorPanel.tsx` |
| Features | `features/expert-run/useExpertRuns.ts` |
| | `features/expert-run/useExpertRunDetail.ts` |
| | `features/expert-run/runStatus.ts`、`runFilter.ts` |
| Model | `model/run.ts` |

## 4. 数据流

```text
useExpertRuns → workApi.runs.list
useExpertRunDetail → workApi.runs.getDetail + onRuntimeEvent
pendingExpertRunId（HermesDefaultContext）→ 自动选中 run
```

## 5. UI 布局

- 典型 **主从分栏**：列表左 / 详情右（`.hermes-runs-layout` 或等价 flex）  
- 状态色：`runStatus` → badge class  
- 空态：`hermes-page__empty`  

## 6. 错误处理

- run 不存在：Detail 空态 + 返回列表  
- cancel/retry 失败：RunErrorPanel 或 toast 区（inline error）  

## 7. 验收标准

- [ ] Filter 切换刷新列表  
- [ ] completed 显示 Result + Artifacts  
- [ ] runtime 事件更新 timeline  

## 8. Cursor 执行提示

Runs 数据一律走 `features/expert-run/`；禁止回到 `HermesExpertsContext.runs`。
