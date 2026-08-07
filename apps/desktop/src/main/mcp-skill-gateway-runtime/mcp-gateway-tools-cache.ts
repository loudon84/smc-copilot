/** v6.6.1 — re-export tools cache + metadata inference (PRD filename alias). */
export {
  inferRiskLevel,
  inferToolCategory,
  inferToolPermission,
  isReadOnlyMcpTool,
  listRemoteMcpTools,
  readMcpGatewayToolsCache,
  writeMcpGatewayToolsCache,
  isMcpGatewayToolsCacheStale,
} from "./mcp-tools-cache";
