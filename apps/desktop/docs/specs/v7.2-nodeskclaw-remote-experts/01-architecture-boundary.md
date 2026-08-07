# V7.2 Remote Experts — Architecture Boundary

> 产品规划：[prd_work/nodeskclaw-remote-experts.md](../../../prd_work/nodeskclaw-remote-experts.md)

## 核心结论

专家 / 专家团队全部放在 **nodeskclaw Expert MCP Gateway v6**（`/api/v1/expert/*`）；copilot-desktop **不再本地安装专家 Profile**，只做专家工作台、MCP Client、同步 Runs 缓存、产物消费与本地上下文桥接。

## Desktop 职责

1. nodeskclaw 连接配置（Bearer + `X-Desktop-Id`；复用 `mcp-token-provider`）
2. Expert MCP `initialize` / root `tools/list`（专家/团队目录）/ slug `tools/list`（技能）/ slug `tools/call`（**同步**，`arguments.prompt` 必填）
3. 专家 / 团队卡片展示与召唤交互（skill 选择 + prompt）
4. Runs 状态 / Timeline / **responseText** 展示（本地 `expert-runtime-db`，召唤完成即 `completed`）
5. Artifact 预览 / 下载（本地 `expert_mcp_response` 优先；legacy HermesTask 可走 `hermes-client`）
6. GeneHub Skill List / Push / 提交状态（Pull 状态只读）
7. WebOperator / Screen / 本地文件上下文采集
8. 用户确认与审批提示
9. 本地最近使用缓存（非真相源）

## Desktop 禁止

1. 不安装专家 Profile（`expert-installer` / `expert-profile-manager` 本地 Gateway 启停已 **deprecated**）
2. 不复制专家团队成员 Profile
3. 不决定 Runtime Skill 执行实例
4. **`tools/call` arguments 禁止** `_routing` / `_execution` / `route_config`
5. 不直接读取远端 Hermes workspace 文件
6. 不把 server_artifacts 伪装成本地文件
7. 专家团队编排不在 desktop 做（由 nodeskclaw `ExpertTeamOrchestrator` 完成）
8. Expert 召唤路径**不**引入 HermesTask / `task_id` 轮询

## 传输层（Expert MCP Gateway v6）

| 能力 | 模块 | 端点 |
|------|------|------|
| 健康检查 | `expert-mcp-client.ts` | `GET /api/v1/expert/health` |
| 目录 tools/list | `expert-mcp-client.ts` | `POST /api/v1/expert/mcp` |
| 技能 tools/list + tools/call | `expert-mcp-client.ts` | `POST /api/v1/expert/mcp/{expert_slug\|team_slug}` |
| Runs / Artifacts UI 缓存 | `expert-runtime-db.ts` | `~/.hermes/desktop/expert-runtime.db` |
| Preload | `hermes-experts-api.ts` | `window.hermesExperts` |

**非专家 Skill** 仍走 MCP Skill Gateway（`mcp-skill-gateway-runtime`），不与 Expert Gateway 混用。

## Token 安全

- Token 仅 Main Process（`mcp-token-provider` / `token-store`）
- Renderer 不直接请求 nodeskclaw API
