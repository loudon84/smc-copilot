# 10 — Artifacts 页面 Spec

## 1. 目标

成果中心：本地 artifacts 列表、预览、下载；导入 workspace（待接线）。

## 2. 不做范围

- server_artifacts 远程直读（仅本地副本）  
- 改 artifact 存储引擎  

## 3. 涉及文件

| 类型 | 路径 |
|------|------|
| 页面 | `pages/Artifacts/HermesArtifactsPage.tsx` |
| 组件 | `ArtifactList.tsx`、`ArtifactPreviewPanel.tsx` |
| | `ArtifactImportDialog.tsx`（**存在，页面未引用 — 已知 gap**） |
| Features | `features/artifact/useLocalArtifacts.ts` |
| | `features/artifact/useArtifactPreview.ts` |
| | `features/artifact/useArtifactImport.ts` |
| Model | `model/artifact.ts` |

## 4. 数据流

```text
useLocalArtifacts → workApi.artifacts.listLocal
useArtifactPreview → workApi.artifacts.preview
下载 → workApi.artifacts.download（Page 内按钮可直调 workApi）
导入（待做）→ useArtifactImport → workApi.artifacts.import
```

## 5. UI

- List + Preview 分栏或上下结构  
- Preview 支持 markdown/text（`previewText`）  
- Import Dialog 用 overlay 模式，样式对齐 `hermes-drawer` / dialog 既有模式  

## 6. 验收标准

- [ ] 列表/预览/下载可用  
- [ ] **P1 待办**：`ArtifactImportDialog` 接入 Page  
- [ ] requiresGateway 与 artifacts nav 一致  

## 7. Cursor 执行提示

接 Import Dialog 时：Page 加 state + `useArtifactImport`；Dialog 纯 props，不调 API。
