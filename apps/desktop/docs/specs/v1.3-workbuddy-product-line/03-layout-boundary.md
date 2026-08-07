# 03 — Layout 边界与 UI 壳层

## 1. 目标

明确 **全局 MainPage 壳层** 与 **Hermes 内三栏壳层** 的分工，指导 Agent 输出正确的 Layout / Screen 组件结构，避免改错文件或破坏高度链。

## 2. 不做范围

- 不修改 `Layout.tsx`、`MainPage.tsx` 结构（Hermes 内页需求）  
- 不修改 `OverlayProvider` / `WebContentsHost` 全局行为  
- 不在 Hermes 内引入 Tailwind 或新 UI 框架  

## 3. 涉及文件

| 层级 | 文件 |
|------|------|
| 全局 | `screens/Layout/Layout.tsx`、`screens/MainPage/MainPage.tsx` |
| 路由 | `workspace/workspace-registry.ts`、`WorkspaceRenderer.tsx` |
| Hermes 入口 | `screens/Hermes/index.tsx` |
| Hermes 三栏 | `panels/HermesShell.tsx`、`components/HermesSidebar.tsx`、`panels/HermesRightPanel.tsx` |
| 样式 | `screens/Hermes/Hermes.css` |

## 4. 高度与 flex 链（必须遵守）

```text
MainPage__content (flex-1 min-h-0)
  └─ ReactWorkspace / HermesScreen
       └─ .hermes-screen (height:100%; min-height:0; flex column)
            └─ .hermes-shell
                 └─ .hermes-body (grid: sidebar | center | right)
                      ├─ .hermes-sidebar
                      ├─ .hermes-center → .hermes-center-scroll
                      └─ .hermes-right-panel / .hermes-right-rail
```

**规则：**

1. 页面根节点用 `className="hermes-page hermes-<page>-page"`，放在 `.hermes-center-scroll` 内滚动。  
2. 禁止给 `.hermes-center` 设 `overflow: visible` 导致双滚动条。  
3. 三栏宽度用 CSS 变量：`--hermes-left-width`、`--hermes-right-width`（见 `LAYOUT` in `constants.ts`）。

## 5. 页面模板（Screen 内页标准结构）

```tsx
export default function HermesExamplePage() {
  return (
    <div className="hermes-page hermes-example-page">
      <header className="hermes-page__header">
        <div>
          <h2>{t("workspaces.nav.example")}</h2>
          <p className="hermes-page__subtitle">{t("workspaces.hermes.example.subtitle")}</p>
        </div>
        <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "hermes-spin" : undefined} />
          {t("workspaces.hermes.common.refresh")}
        </button>
      </header>

      {error ? <div className="hermes-page__error">…</div> : null}
      {loading && empty ? <p className="hermes-page__loading">…</p> : null}
      {!loading && empty ? <p className="hermes-page__empty">…</p> : null}

      {/* 主内容：grid / list / split panel */}
    </div>
  );
}
```

## 6. 组件职责

| 组件 | 职责 | 禁止 |
|------|------|------|
| `HermesShell` | 三栏布局、pageKey 分发、gateway redirect | 业务 API、页面表单 |
| `HermesSidebar` | 导航、分组折叠、gateway disabled | 直接 workApi |
| `Hermes*Page` | 页面编排、调 feature hooks | window.*、原始 IPC 类型 |
| `pages/*/components/*` | 展示 + 事件回调 | 自行 fetch / workApi（除纯下载按钮经 props） |

## 7. 卡片与列表 UI 模式

| 模式 | class / 位置 |
|------|----------------|
| 区块卡片 | `.hermes-section-card`、`.hermes-workbench-card` |
| 专家/团队网格 | `.hermes-expert-grid` + `ExpertGrid` 组件 |
| 运行列表 | `.hermes-run-list`、`.hermes-run-list-item` |
| 状态徽章 | `.hermes-status-badge` + `runStatus` 映射 |
| 离线引导 | `.hermes-offline-guide`（Workbench） |

新增样式 **优先扩展 `Hermes.css`**，前缀 `hermes-`，使用现有 CSS 变量（`--bg-primary`、`--border`、`--text-secondary` 等）。

## 8. 错误处理

- 页面级：`hermes-page__error` + 重试按钮（`hermes-btn-ghost`）  
- 区块级：卡片内 `.hermes-muted` 说明  
- 网关离线：Workbench `ConnectionStatusCard` + Sidebar disabled（不 silent fail）

## 9. 验收标准

- [ ] 新页面符合 `hermes-page` 模板  
- [ ] 无 Layout/MainPage  diff（除非任务 explicitly 要求）  
- [ ] 滚动只在 center 区域发生  
- [ ] 样式仅改 `Hermes.css` 或复用已有 class  

## 10. Cursor 执行提示

任务含「Layout」时先问：**是全局 MainPage 还是 Hermes 内三栏？**  
默认 Hermes 内页 → 只动 `screens/Hermes/**` + `Hermes.css`。
