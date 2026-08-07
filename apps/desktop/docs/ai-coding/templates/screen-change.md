# Screen / UI 变更模板

## 1. 定位 Screen

- [ ] `docs/ai-coding/context-map/00-routing.md` 确认域
- [ ] `docs/renderer/screens/<Screen>.md` 或 context-map
- [ ] Workspace registry：`workspace-registry.ts`（若新 Tab）

## 2. Hermes 内页附加（`screens/Hermes`）

- [ ] v1.3 Spec Pack 03 + 13
- [ ] `.cursor/rules/workbuddy-product-line.mdc`
- [ ] 禁止改 `Layout.tsx` / `MainPage`

## 3. 文件放置

| 内容 | 目录 |
|------|------|
| 页面入口 | `pages/<Domain>/Hermes<Domain>Page.tsx` |
| 页内组件 | `pages/<Domain>/components/` |
| 跨页复用 | `screens/Hermes/components/`（谨慎） |
| 取数 | `features/<domain>/` |
| API 封装 | `api/` |

## 4. UI Checklist

- [ ] `hermes-page` 根 + 三态（loading/empty/error）
- [ ] `Hermes.css` / CSS 变量（无随意 inline layout）
- [ ] `lucide-react` 图标 size 14–16
- [ ] i18n en + zh-CN

## 5. Preload 边界

- [ ] 无 `import` from `src/main`
- [ ] 无 `ipcRenderer` 直接调用

## 6. 验证

```bash
npm run typecheck
npm run lint   # 若触及 eslint 区
```

## 参考

- `docs/specs/v1.3-workbuddy-product-line/13-ai-coding-structure.md`
- `.cursor/rules/002-renderer-ui.mdc`
