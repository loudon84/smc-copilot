# 05 — Page Registry

## 1. 目标

新增或重命名 Hermes 内页时，按 registry 流程操作，保证 Sidebar 与 Page 一致。

## 2. 不做范围

- `hermes-action-registry` / `hermes-drawer-registry`（未实现，勿臆造）  

## 3. 新增页面 Checklist

1. `constants.ts` → `HERMES_NAV_ITEMS` 增加项（含 `section`、`requiresGateway?`）  
2. `registry/hermes-pages.tsx` → `lazy(() => import(...))` + `PAGE_COMPONENTS`  
3. `pages/<Name>/Hermes<Name>Page.tsx` → 默认 export  
4. `src/shared/i18n/locales/en/workspaces.ts` + `zh-CN/workspaces.ts` → `nav.<key>`  
5. 可选：`docs/renderer/screens/Hermes.md` 增量  

## 4. 类型

```typescript
// HermesPageKey === HermesNavItemKey
export function buildHermesPageDefinitions(navItems): HermesPageDefinition[]
// HermesPageDefinition = HermesNavItemDefinition + { component }
```

## 5. 验收标准

- [ ] 所有 `HERMES_NAV_ITEMS` 的 key 在 `PAGE_COMPONENTS` 有对应 lazy  
- [ ] `visible: false` 的项不出现在 Sidebar  
- [ ] typecheck 通过  

## 6. Cursor 执行提示

禁止在 `HermesShell.tsx` 写 `switch(pageKey)` 新增 branch；只改 registry。
