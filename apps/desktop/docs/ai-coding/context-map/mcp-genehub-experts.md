# Context Map — MCP、GeneHub、Hermes Experts

## MCP Skill Gateway（V6.4+）

| 层 | 路径 |
|----|------|
| Main Proxy | `src/main/mcp-skill-gateway-runtime/` |
| Hermes 注册 | `mcp-registration-service.ts` |
| Preload | `window.mcpSkillGatewayRuntime` |
| UI | `screens/Hermes/pages/McpGateway/` |
| 契约 | `src/shared/mcp-skill-gateway-runtime/` |

本地 Proxy 默认 `:48742` → nodeskclaw `/api/v1/hermes/mcp`。

## Hermes MCP Client（V7.0）

- IPC：`hermes-client:*`
- UI：`McpGatewayClientContractCard` 等
- PRD：`prd/v7.0_desktop-hermes-mcp-client-integration.md`

## GeneHub（V6.5+）

| 层 | 路径 |
|----|------|
| Main | `src/main/genehub/` |
| Preload | `window.genehubRuntime` |
| UI | `screens/Hermes/pages/GeneHub/` |
| 契约 | `src/shared/genehub/` |

## Hermes Experts（V7.1+ / V7.2 Remote Pivot）

| 层 | 路径 |
|----|------|
| Main 客户端 | `src/main/hermes-experts/expert-mcp-client.ts` |
| 目录同步 | `expert-remote-catalog.ts` |
| 路由守卫 | `expert-route-guard.ts` |
| Preload | `window.hermesExperts` |
| UI | `pages/Experts/`、`ExpertTeams/`、`ExpertRuns/`、`Artifacts/` |

**V7.2**：直连 `/api/v1/expert/mcp`；`callCatalogSkill` 统一调用；本地 Runs/Artifacts 保留。

## 共享 MCP Registry（V6.1）

- `src/main/mcp/`
- `window.hermesAPI.mcp`
- `screens/Hermes/pages/MCP/`

## 鉴权注意

- Bearer **仅 Main/Proxy 注入**；Preload **不**向 Renderer 暴露 token
- 远程 backend 源：`AuthEndpointConfig.backendUrl`

## 文档

- `docs/API_CONTRACTS.md` § MCP / GeneHub / Hermes Experts
- `docs/specs/v7.2-nodeskclaw-remote-experts/`
- PRD：`prd/v6.*`、`prd/v7.*`

## 改前检查

1. 是否影响 Hermes `config.yaml` `mcp_servers` → 可能需要 Gateway restart
2. IPC 是否已记入 API_CONTRACTS
3. Expert 调用是否经 `expert-route-guard`
