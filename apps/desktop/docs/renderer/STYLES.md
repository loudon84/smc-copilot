# 样式策略

## 1. 技术栈

- **CSS 方案**：原生 CSS + CSS Modules（无 TailwindCSS，无 CSS-in-JS）
- **类名约定**：BEM 风格（`MainPage__content`、`MainTopBar__actions`）
- **特殊类**：
  - `app-drag-region` — macOS 标题栏拖拽区域（`-webkit-app-region: drag`）
  - `no-drag` — 拖拽区域内可交互元素排除（`-webkit-app-region: no-drag`）
  - `layout` — 全屏 flex 布局基类

## 2. 主要样式文件

| 文件 | 作用 |
|---|---|
| `src/renderer/src/assets/main.css` | 全局样式入口 |
| `src/renderer/src/screens/MainPage/main-page.css` | MainPage 布局样式 |
| `src/renderer/src/screens/MainPage/main-topbar.css` | MainTopBar 样式 |
| `src/renderer/src/screens/MainPage/main-view-tabs.css` | Tab 栏样式 |

## 3. MainPage 布局

```css
.MainPage {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.MainPage__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.MainPage__content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
```

**侧栏模式修饰**：
- `.MainPage--sidebar-expanded`
- `.MainPage--sidebar-rail`
- `.MainPage--sidebar-hidden`
- `.MainPage--no-global-sidebar`

## 4. MainTopBar

```css
.MainTopBar {
  height: 40px; /* MAIN_TOPBAR_HEIGHT */
  display: flex;
  align-items: center;
}
```

- `app-drag-region`：整个顶栏可拖拽
- `no-drag`：按钮/输入框排除拖拽

## 5. 主题

ThemeProvider 支持深色/浅色主题切换，通过 CSS 变量或 `prefers-color-scheme` 实现。

## 6. 布局常量

来源：`src/shared/shell/main-page-constants.ts`

| 常量 | 值 |
|---|---|
| MAIN_TOPBAR_HEIGHT | 40px |
| MAIN_STATUSBAR_HEIGHT | 24px |
| MAIN_RAIL_WIDTH | 56px |
| MAIN_SIDEBAR_WIDTH | 232px |
| MAIN_INSPECTOR_WIDTH | 320px |

## 7. 窗口尺寸

| 常量 | 值 |
|---|---|
| DEFAULT_WINDOW_WIDTH | 1280px |
| DEFAULT_WINDOW_HEIGHT | 800px |
| MINIMUM_WINDOW_WIDTH | 900px |
| MINIMUM_WINDOW_HEIGHT | 600px |

实际窗口尺寸由 `src/main/shell/main-window-controller.ts` 控制，有 `window-state` 持久化时优先使用历史值。
