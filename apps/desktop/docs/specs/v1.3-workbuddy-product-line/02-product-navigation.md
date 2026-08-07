# 02 — 产品导航

## 1. 目标

定义 Work 专家工作台 **左侧导航** 的产品语义与 registry 字段，保证 AI 增删 nav 项时不破坏主流程 ≤6 项。

## 2. 不做范围

- 不改顶栏 `workspace-registry` Tab 列表（除非 DECISION-001 单独任务）  
- v1.4 才做「高级设置迁入 Settings Drawer」（DECISION-002）

## 3. 涉及文件

| 文件 | 职责 |
|------|------|
| `constants.ts` | `HERMES_NAV_ITEMS` 权威列表 |
| `model/page.ts` | `HermesPageSection`、`HermesNavItemDefinition` |
| `components/HermesSidebar.tsx` | 分组渲染、折叠、门控 |
| `features/nav/useGatewayNavGate.ts` | 网关健康 |
| `features/nav/navItemAccess.ts` | `isNavItemAccessible` |
| `src/shared/i18n/locales/{en,zh-CN}/workspaces.ts` | `nav.*` |

## 4. 导航分组

### 4.1 primary（主流程，始终可见，窄栏仅显示此项）

| key | requiresGateway | 说明 |
|-----|-----------------|------|
| workbench | — | 默认首页 |
| chat | — | 本地 Hermes 对话 |
| experts | ✅ | 专家目录 |
| expertTeams | ✅ | 专家团队 |
| expertRuns | ✅ | 运行记录 |
| artifacts | ✅ | 成果中心 |

### 4.2 capability（能力管理，默认折叠）

`skillCenter`（GeneHub）、`mcp`、`mcpGateway`

### 4.3 advanced（高级设置，默认折叠）

`sessions`、`skills`、`tools`、`memory`、`providers`、`models`

## 5. requiresGateway 行为（Phase 6）

```text
网关离线：
  - Sidebar 项 disabled + title=workspaces.nav.requiresGateway
  - 项仍可见（不隐藏）
  - 当前页若 requiresGateway → HermesShell redirect 到 workbench

网关在线：
  - 四项可点击
  - capability / advanced 不受 requiresGateway 限制
```

## 6. 类型定义

```typescript
// model/page.ts
export type HermesPageSection = "primary" | "capability" | "advanced";

export type HermesNavItemDefinition = {
  key: HermesNavItemKey;
  labelI18nKey: string;
  icon: string;
  section: HermesPageSection;
  visible?: boolean;
  requiresGateway?: boolean;
};
```

## 7. 验收标准

- [ ] 展开侧栏：primary 6 项 + 两个可折叠分组标题  
- [ ] 窄栏：最多 6 个 primary icon  
- [ ] 选中 capability/advanced 页时对应分组自动展开  
- [ ] 离线时 experts/teams/runs/artifacts disabled  

## 8. Cursor 执行提示

新增 nav 项：**只改** `constants.ts` + `hermes-pages.tsx` lazy import + i18n `workspaces.nav.*` + 对应 `pages/` 目录。不要硬编码在 `HermesSidebar.tsx`。
