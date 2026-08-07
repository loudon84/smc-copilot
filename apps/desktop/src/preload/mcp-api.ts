import { ipcRenderer } from "electron";
import type {
  BindMcpToolInput,
  CreateMcpServerInput,
  HermesMcpAPI,
  ListMcpInvocationsInput,
  ListMcpToolsInput,
  McpInvocationEvent,
  McpRuntimeEvent,
  McpServerStatusEvent,
  McpInvokeToolInput,
  SetMcpToolEnabledInput,
  UnbindMcpToolInput,
  UpdateMcpServerInput,
} from "../shared/mcp/mcp-contract";

export const mcpApi: HermesMcpAPI = {
  listServers: (profile?: string) => ipcRenderer.invoke("mcp:list-servers", profile),
  createServer: (input: CreateMcpServerInput) => ipcRenderer.invoke("mcp:create-server", input),
  updateServer: (id: string, patch: UpdateMcpServerInput) =>
    ipcRenderer.invoke("mcp:update-server", id, patch),
  deleteServer: (id: string) => ipcRenderer.invoke("mcp:delete-server", id),
  setServerEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke("mcp:set-server-enabled", id, enabled),
  testConnection: (id: string) => ipcRenderer.invoke("mcp:test-connection", id),
  syncTools: (id: string) => ipcRenderer.invoke("mcp:sync-tools", id),
  listTools: (input?: ListMcpToolsInput) => ipcRenderer.invoke("mcp:list-tools", input),
  setToolEnabled: (input: SetMcpToolEnabledInput) =>
    ipcRenderer.invoke("mcp:set-tool-enabled", input),
  bindToolToProfile: (input: BindMcpToolInput) => ipcRenderer.invoke("mcp:bind-tool", input),
  unbindToolFromProfile: (input: UnbindMcpToolInput) =>
    ipcRenderer.invoke("mcp:unbind-tool", input),
  checkBridge: (profile: string) => ipcRenderer.invoke("mcp:check-bridge", profile),
  installBridge: (profile: string) => ipcRenderer.invoke("mcp:install-bridge", profile),
  invokeToolTest: (input: McpInvokeToolInput) => ipcRenderer.invoke("mcp:invoke-test", input),
  listInvocations: (input?: ListMcpInvocationsInput) =>
    ipcRenderer.invoke("mcp:list-invocations", input),
  listArtifacts: (invocationId: string) =>
    ipcRenderer.invoke("mcp:list-artifacts", invocationId),
  onEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload as McpRuntimeEvent);
    ipcRenderer.on("mcp:event", handler);
    return () => ipcRenderer.removeListener("mcp:event", handler);
  },
  onServerStatus: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload as McpServerStatusEvent);
    ipcRenderer.on("mcp:server-status", handler);
    return () => ipcRenderer.removeListener("mcp:server-status", handler);
  },
  onInvocationEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload as McpInvocationEvent);
    ipcRenderer.on("mcp:invocation-event", handler);
    return () => ipcRenderer.removeListener("mcp:invocation-event", handler);
  },
};
