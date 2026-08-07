# 15 — 验收清单

## 产品验收

- [ ] 顶栏 Tab：`Work Expert Workspace` / `Work 专家工作台`
- [ ] 默认页：Workbench
- [ ] 主流程 nav：6 项
- [ ] capability / advanced 默认折叠，可展开
- [ ] 窄栏仅 primary icon
- [ ] 网关离线：4 项 disabled + 自动回 workbench
- [ ] 专家召唤 → Runs → 成果预览闭环（实机）
- [ ] Chat 本地对话仍可用
- [ ] MCP / 模型 / Provider 高级入口可达

## 工程验收

- [ ] `features/` 分层清晰
- [ ] pages 无 direct `window.hermesExperts`
- [ ] `HermesExpertsContext` 无 runs API
- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 本 Spec Pack 可被 AGENTS / Cursor rules 引用

## AI Coding 验收

- [ ] 新任务可指定单 Spec（06–10）执行
- [ ] UI 符合 03 + 13 Checklist
- [ ] i18n en/zh-CN 同步

## 手工冒烟（§18.3 摘要）

1. 启动 → 专家工作台  
2. Workbench 连接状态  
3. 专家页 → 召唤  
4. 专家运行详情 completed  
5. 成果预览 / 下载  
6. （待测）成果导入  
7. Chat 页回归  
8. MCP 网关页可达  
