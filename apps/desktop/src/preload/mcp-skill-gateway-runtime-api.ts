import { ipcRenderer } from "electron";
import type {
  McpSkillGatewayRuntimeAPI,
  McpSkillGatewayRuntimeConfig,
  McpGatewayInvokeTestInput,
} from "../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";

export const mcpSkillGatewayRuntimeApi: McpSkillGatewayRuntimeAPI = {
  getStatus: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:get-status"),
  getConfig: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:get-config"),
  saveConfig: (input: Partial<McpSkillGatewayRuntimeConfig>) =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:save-config", input),
  startProxy: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:start-proxy"),
  stopProxy: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:stop-proxy"),
  restartProxy: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:restart-proxy"),
  testProxy: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:test-proxy"),
  testRemoteMcp: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:test-remote-mcp"),
  registerToProfile: (profile: string) =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:register-to-profile", profile),
  unregisterFromProfile: (profile: string) =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:unregister-from-profile", profile),
  listProfileRegistrations: () =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:list-profile-registrations"),
  readProxyLogs: (lines?: number) =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:read-proxy-logs", lines),
  readStructuredLogs: (lines?: number) =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:read-structured-logs", lines),
  runDiagnostics: () => ipcRenderer.invoke("mcp-skill-gateway-runtime:run-diagnostics"),
  listRemoteTools: (forceRefresh?: boolean) =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:list-remote-tools", forceRefresh),
  invokeRemoteTool: (input: McpGatewayInvokeTestInput) =>
    ipcRenderer.invoke("mcp-skill-gateway-runtime:invoke-remote-tool", input),

  getHermesClientBootstrap: (input) =>
    ipcRenderer.invoke("hermes-client:get-bootstrap", input),
  listHermesClientAgents: (input) =>
    ipcRenderer.invoke("hermes-client:list-agents", input),
  getHermesClientAgent: (agentAlias: string) =>
    ipcRenderer.invoke("hermes-client:get-agent", agentAlias),
  listHermesClientTools: (input) => ipcRenderer.invoke("hermes-client:list-tools", input),
  runHermesReadinessCheck: (input) =>
    ipcRenderer.invoke("hermes-client:readiness-check", input),
  createHermesTaskEventsToken: (taskId: string) =>
    ipcRenderer.invoke("hermes-client:create-events-token", taskId),
  getHermesTaskResult: (taskId: string) =>
    ipcRenderer.invoke("hermes-client:get-task-result", taskId),
  previewHermesArtifact: (artifactId: string) =>
    ipcRenderer.invoke("hermes-client:preview-artifact", artifactId),
  downloadHermesArtifact: (artifactId: string) =>
    ipcRenderer.invoke("hermes-client:download-artifact", artifactId),
  getRecentHermesTasks: () => ipcRenderer.invoke("hermes-client:get-recent-tasks"),
  clearRecentHermesTasks: () => ipcRenderer.invoke("hermes-client:clear-recent-tasks"),
};
