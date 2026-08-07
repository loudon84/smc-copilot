# 16 — Cursor 执行提示（任务前缀模板）

复制以下块到 Agent 任务 **开头**（按任务删减）：

---

## Work 专家工作台任务 — v1.3 Spec Driver

**Spec Pack**：`docs/specs/v1.3-workbuddy-product-line/`

**必读（按任务选读）**：
- Layout / 三栏壳：`03-layout-boundary.md`
- UI 质量：`13-ai-coding-structure.md`
- 目标页：`06-workbench-page.md` | `07-experts-page.md` | `08-expert-teams-page.md` | `09-runs-page.md` | `10-artifacts-page.md`
- 数据层：`11-api-client-and-domain-model.md`
- 导航：`02-product-navigation.md` + `05-page-registry.md`

**硬约束**：
1. 只改 `src/renderer/src/screens/Hermes/**`（+ i18n `workspaces.ts`），除非任务明确要求 IPC
2. pages → features → workApi；components 不调 API
3. UI 用 `Hermes.css` 既有 `hermes-*` class；页面模板见 03 §5
4. 代码标识用 `Work*` / `workApi`；禁止 `workbuddy` 代码名
5. 完成后 `npm run typecheck`；增量更新 `docs/renderer/screens/Hermes.md`（若有行为变化）

**禁止**：
- 改 `Layout.tsx` / `MainPage`（Hermes 内页任务）
- Renderer 直接 `window.hermesExperts` / fetch / fs
- 一次 PR 跨 Main + Preload + Renderer

**验收**：对照 `15-acceptance-checklist.md` 相关条目 + 对应页面 Spec §验收标准

---

## 按任务类型的 Spec 指针

| 任务关键词 | 打开 Spec |
|------------|-----------|
| Workbench / 首页 / 连接卡片 | 06 |
| 专家 / ExpertCard / Summon | 07 |
| 团队 / Team | 08 |
| 运行 / Run / Timeline | 09 |
| 成果 / Artifact / 导入 | 10 |
| 侧栏 / 导航 / 折叠 | 02, 03, 05 |
| workApi / 类型 | 11 |
| 新 IPC | 12（停 Renderer，转 Main 任务） |

## 小闭环示例

```text
任务：Artifacts 接入 Import Dialog
范围：10-artifacts-page.md + useArtifactImport
允许改：HermesArtifactsPage.tsx, ArtifactImportDialog.tsx, Hermes.css（如需）
禁止改：Main, Preload, Layout
验证：typecheck + 手工点击导入
```
