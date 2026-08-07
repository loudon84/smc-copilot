# 11 — API Client 与 Domain Model

## 1. 目标

统一 **workApi** 与 **Work*** model，禁止 pages 直接使用 Preload 原始类型。

## 2. 不做范围

- 新增 `window.workbuddy` Preload 对象（方案 A：继续 `window.hermesExperts`）  
- Main `workbuddy/` 聚合目录（MVP 未建）  

## 3. 涉及文件

| 文件 | 职责 |
|------|------|
| `api/workApi.ts` | experts / teams / runs / artifacts / gateway |
| `api/hermesDefaultApi.ts` | 本地 chat、sessions、models（chat 页） |
| `model/expert.ts` | WorkExpert |
| `model/expert-team.ts` | WorkExpertTeam |
| `model/run.ts` | WorkRun, WorkRunDetail, WorkRunTimelineEvent |
| `model/artifact.ts` | WorkArtifact |
| `model/error.ts` | WorkError, WorkErrorCode |
| `model/page.ts` | 导航/registry 类型 |

## 4. workApi 分区

```typescript
workApi.gateway.health | diagnostics | desktopSyncStatus | clearCatalogCache
workApi.experts.list | listPage | get | listCatalogSkills | summon | callCatalogSkill
workApi.teams.list | listPage | get | summon
workApi.runs.list | get | getDetail | onRuntimeEvent | retry | cancel
workApi.artifacts.listLocal | listByRun | preview | download | import
```

## 5. Mapper 规则

- Preload 返回 → `mapHermesExpert` / `mapHermesRun` 等在 `workApi.ts`  
- features 只消费 `Work*` 类型  
- 错误 → `mapWorkError` → UI 展示 code + message  

## 6. 错误码（UI 须处理）

`GATEWAY_OFFLINE`、`MCP_APPROVAL_REQUIRED`、`RUN_NOT_FOUND`、`ARTIFACT_NOT_FOUND` 等 — 见 `model/error.ts`

## 7. 验收标准

- [ ] pages 无 `HermesExpertRun` 等 Preload 类型 import  
- [ ] 新 IPC 字段先改 shared contract → workApi mapper → model  

## 8. Cursor 执行提示

需要新 API：先查 `docs/API_CONTRACTS.md`；无 IPC 则停止，不要 Renderer fetch。
