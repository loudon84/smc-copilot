# 13 — AI Coding 结构与 UI 输出质量

## 1. 目标

约束 Agent 产出 **可合并、风格一致** 的 Layout / Screen 代码，减少随意组件与样式。

## 2. 分层口诀

```text
shell 装配 → pages 编排 → features 取数 → api 封装 → model 类型
components 只展示，带 props 回调
```

## 3. 文件放置规则

| 内容 | 目录 |
|------|------|
| 页面入口 | `pages/<Domain>/Hermes<Domain>Page.tsx` |
| 页面私有 UI | `pages/<Domain>/components/` |
| 跨页复用 UI | `screens/Hermes/components/`（谨慎添加） |
| 业务逻辑 | `features/<domain>/` |
| 样式 | `Hermes.css`（`.hermes-*`） |

## 4. UI 输出 Checklist（Agent 自检）

### 4.1 结构

- [ ] 根节点 `hermes-page` + 语义化 `hermes-*-page`  
- [ ] header / subtitle / refresh 按钮模式一致  
- [ ] loading / empty / error 三态齐全  

### 4.2 样式

- [ ] 使用 CSS 变量，不硬编码 `#hex`  
- [ ] 不引入 `@tailwind` 或 inline style 布局（除 CSS 变量 width）  
- [ ] 图标用 `lucide-react` size 14–16，与现有页一致  
- [ ] 按钮：`hermes-btn-ghost` / `hermes-btn-primary`（已有则复用）  

### 4.3 React

- [ ] 事件处理器 `useCallback` 仅在有 perf 需要时  
- [ ] `useEffect` 清理 subscription（workApi.onRuntimeEvent 等）  
- [ ] 不在 JSX 内写大段业务逻辑  

### 4.4 i18n

- [ ] 用户可见字符串走 `t("workspaces.hermes....")`  
- [ ] **en + zh-CN 同步**  

## 5. 反模式（禁止）

```text
❌ Page 内 200 行 fetch + map + render 混在一起
❌ 新建 Workbench2.tsx 替代改现有页
❌ 复制 Hermes.css 到 module.css
❌ 在 ExpertCard 内 import workApi
❌ 改 MainTopBar 加 Hermes 专属按钮（应走 Sidebar / Workbench）
```

## 6. 推荐拆块大小

| 任务 | 最大 touched files |
|------|-------------------|
| 单组件 UI | 1–3 |
| 单页面行为 | 3–8 |
| 新 feature hook | 2–5 |
| 新 nav 页 | 5–10 |

## 7. 验证命令

```bash
npm run typecheck
npm run lint   # 若改动了 eslint 覆盖区
```

## 8. Cursor 执行提示

开始 UI 任务前读取：**03-layout-boundary.md** + 目标页 Spec（06–10）+ 本文件 §4 Checklist。
