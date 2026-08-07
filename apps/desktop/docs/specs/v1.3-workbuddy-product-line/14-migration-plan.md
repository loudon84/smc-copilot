# 14 — 迁移计划（状态快照）

## 1. PRD §17 阶段状态

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | Registry + Shell | ✅ |
| 2 | model + workApi | ✅ |
| 3 | Experts / Teams | ✅ |
| 4 | Runs / Artifacts | ⚠️ Import UI 未接线 |
| 5 | Workbench | ✅ |
| 6 | 高级分组 + 门控 | ✅ |

## 2. PRD §21 步骤状态

| 步 | 内容 | 状态 |
|----|------|------|
| 1 | Spec Pack | ✅ 本目录 |
| 2–10 | 代码迁移 | ✅（见上） |

## 3. 已知延后

- `shell/` 物理目录搬迁  
- `requiresAdvancedMode`  
- Settings Drawer 收纳高级项（v1.4）  
- Inspector/Chat 脱离 HermesExpertsContext  
- Main `workbuddy/` 聚合层  

## 4. 建议后续 P1

1. Artifacts 接入 `ArtifactImportDialog`  
2. `npm run build` 全量验证  
3. §18.3 手工冒烟清单  

## 5. v1.4 衔接

见 `prd_work/v1.4_work-agent-event-stream.md` — **不要与 v1.3 Spec 混在同一任务**。
