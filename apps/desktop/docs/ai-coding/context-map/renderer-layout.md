# Context Map — Renderer 布局与 Workspace 路由

## 壳层结构

```text
App.tsx (useStartupGate)
  → Layout.tsx
      → MainPage (MainTopBar / Sidebar / WorkspaceOutlet / StatusBar)
      → SettingsDrawer / Overlay
```

## 顶栏 Workspace Tab

| Tab id | Screen | 文档 |
|--------|--------|------|
| `portal` | Portal + WebContentsHost | `docs/renderer/screens/Portal.md` |
| `workspaces` | Workspaces 三栏 | `docs/renderer/screens/Workspaces.md` |
| `local-hermes` | Hermes Work 专家台 | `context-map/hermes-workbench.md` |
| `web-operator` | Web Operator | `context-map/web-operator.md` |
| `external-browser:*` | 动态浏览器 Tab | `WORKSPACE_ROUTING.md` |

注册与分发：

- `src/renderer/src/workspace/workspace-registry.ts`
- `src/renderer/src/workspace/WorkspaceRenderer.tsx`
- `src/renderer/src/workspace/WorkspaceOutlet.tsx`

## 关键常量

- `src/shared/shell/main-page-constants.ts` — 窗口与布局尺寸
- `src/shared/shell/browser-partitions.ts` — WebContents 分区

## 全局 UI 基础设施

| 组件 | 路径 |
|------|------|
| Overlay / Dialog | `src/renderer/src/components/overlay/` |
| WebContentsHost | `src/renderer/src/components/shell/WebContentsHost.tsx` |
| MainTopBar | `src/renderer/src/screens/MainPage/MainTopBar.tsx` |

## i18n

- 源语言 **en**；**zh-CN** 必须同步
- 导航 key：`src/shared/i18n/locales/*/navigation.ts`

## 延伸阅读

- `docs/renderer/MAIN_LAYOUT.md`
- `docs/renderer/WORKSPACE_ROUTING.md`
- `docs/renderer/STATE_AND_CONTEXT.md`
- `.cursor/rules/002-renderer-ui.mdc`
- `.cursor/rules/004-layout-quality.mdc`

## Hermes 内页注意

改 `screens/Hermes` **不要**动 `Layout.tsx` / `MainPage`；见 `hermes-workbench.md`。
