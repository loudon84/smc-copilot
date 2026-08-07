import { ipcMain, type BrowserWindow } from "electron";
import type {
  BindMcpToolInput,
  CreateMcpServerInput,
  ListMcpInvocationsInput,
  ListMcpToolsInput,
  McpInvokeToolInput,
  SetMcpToolEnabledInput,
  UnbindMcpToolInput,
  UpdateMcpServerInput,
} from "../../shared/mcp/mcp-contract";
import { bindMcpEventWindow } from "./mcp-events";
import { initializeMcpRegistry } from "./mcp-db";
import {
  createServer,
  deleteServer,
  getServer,
  listServers,
  setServerEnabled,
  updateServer,
} from "./mcp-server-registry";
import { testConnection as testMcpConnection } from "./mcp-client-service";
import { syncTools } from "./mcp-tool-sync-service";
import {
  bindToolToProfile,
  listTools,
  setToolEnabled,
  unbindToolFromProfile,
} from "./mcp-skill-binding-service";
import { checkBridge, installBridge } from "./mcp-bridge-installer";
import { invokeToolTest, listInvocations, listArtifacts } from "./mcp-invocation-service";
import { startMcpRuntimeProxy } from "./mcp-runtime-proxy";
import { updateServerStatus } from "./mcp-server-registry";
import { emitServerStatusEvent } from "./mcp-events";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";

export function registerMcpIpc(getMainWindow: () => BrowserWindow | null): void {
  initializeMcpRegistry();
  bindMcpEventWindow(getMainWindow);
  void startMcpRuntimeProxy();

  ipcMain.handle("mcp:list-servers", (_event, profile?: string) => listServers(profile));

  ipcMain.handle("mcp:create-server", (_event, input: CreateMcpServerInput) => {
    if (!input?.name || !input.transport) {
      throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "name and transport required");
    }
    return createServer(input);
  });

  ipcMain.handle("mcp:update-server", (_event, id: string, patch: UpdateMcpServerInput) => {
    if (!id) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "id required");
    return updateServer(id, patch ?? {});
  });

  ipcMain.handle("mcp:delete-server", (_event, id: string) => {
    if (!id) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "id required");
    return deleteServer(id);
  });

  ipcMain.handle("mcp:set-server-enabled", async (_event, id: string, enabled: boolean) => {
    const server = setServerEnabled(id, Boolean(enabled));
    emitServerStatusEvent({
      serverId: server.id,
      status: server.status,
      lastError: server.lastError,
      toolsCount: server.toolsCount,
    });
    return server;
  });

  ipcMain.handle("mcp:test-connection", async (_event, id: string) => {
    const server = getServer(id);
    if (!server) {
      throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, "Server not found");
    }
    const result = await testMcpConnection(server);
    updateServerStatus(id, result.status, {
      lastError: result.errorMessage,
      connected: result.ok,
    });
    emitServerStatusEvent({
      serverId: id,
      status: result.status,
      lastError: result.errorMessage,
      toolsCount: result.toolsPreview,
    });
    return result;
  });

  ipcMain.handle("mcp:sync-tools", async (_event, id: string) => syncTools(id));

  ipcMain.handle("mcp:list-tools", (_event, input?: ListMcpToolsInput) => listTools(input));

  ipcMain.handle("mcp:set-tool-enabled", (_event, input: SetMcpToolEnabledInput) => {
    if (!input?.profileName || !input.toolId) {
      throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "profileName and toolId required");
    }
    return setToolEnabled(input);
  });

  ipcMain.handle("mcp:bind-tool", (_event, input: BindMcpToolInput) => {
    if (!input?.profileName || !input.toolId) {
      throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "profileName and toolId required");
    }
    return bindToolToProfile(input);
  });

  ipcMain.handle("mcp:unbind-tool", (_event, input: UnbindMcpToolInput) => {
    if (!input?.profileName || !input.toolId) {
      throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "profileName and toolId required");
    }
    return unbindToolFromProfile(input);
  });

  ipcMain.handle("mcp:check-bridge", (_event, profile: string) => {
    if (!profile) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "profile required");
    return checkBridge(profile);
  });

  ipcMain.handle("mcp:install-bridge", async (_event, profile: string) => {
    if (!profile) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "profile required");
    return installBridge(profile);
  });

  ipcMain.handle("mcp:invoke-test", async (_event, input: McpInvokeToolInput) => {
    if (!input?.profileName || !input.toolId) {
      throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "profileName and toolId required");
    }
    return invokeToolTest(input);
  });

  ipcMain.handle("mcp:list-invocations", (_event, input?: ListMcpInvocationsInput) =>
    listInvocations(input),
  );

  ipcMain.handle("mcp:list-artifacts", (_event, invocationId: string) => {
    if (!invocationId) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "invocationId required");
    return listArtifacts(invocationId);
  });
}
