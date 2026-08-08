/**
 * PRD v1.4.1 — MCP Compatibility Adapter.
 * Forwards mcp:* IPC to Runtime via ServeMcpAdapter.
 * Must not start HTTP servers or read Desktop MCP DB.
 */
import { ipcMain } from "electron";
import type {
  CreateMcpServerInput,
  McpServer,
  McpServerStatus,
  UpdateMcpServerInput,
} from "../../shared/mcp/mcp-contract";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";
import { ServeMcpAdapter } from "../runtime-adapters/ServeMcpAdapter";
import type { ServeMcpServerView } from "../../shared/copilot-runtime/instance-contract";

const MOVED =
  "This MCP operation moved to Copilot Runtime. Use Runtime Instance MCP APIs.";

function movedError(): never {
  throw new McpServiceError(
    MCP_ERROR_CODES.GATEWAY_REQUEST_FAILED,
    `MCP_MOVED_TO_RUNTIME: ${MOVED}`,
  );
}

function mapStatus(view: ServeMcpServerView): McpServerStatus {
  switch (view.status) {
    case "enabled":
      return "connected";
    case "disabled":
      return "disabled";
    case "misconfigured":
      return "connect_failed";
    case "unknown":
      return "unknown";
    default: {
      const _exhaustive: never = view.status;
      return _exhaustive;
    }
  }
}

function toMcpServer(view: ServeMcpServerView): McpServer {
  const now = new Date().toISOString();
  return {
    id: view.serverId || view.name,
    name: view.name,
    description: null,
    transport: "streamable_http",
    url: view.url,
    command: null,
    args: [],
    env: {},
    authType: view.tokenConfigured ? "bearer" : "none",
    tokenRef: null,
    hasToken: view.tokenConfigured,
    enabled: view.enabled,
    status: mapStatus(view),
    lastError: view.lastError,
    lastConnectedAt: null,
    lastSyncedAt: null,
    toolsCount: 0,
    profileScope: [],
    createdAt: now,
    updatedAt: now,
  };
}

function profileFromInput(profile?: string | null): string | undefined {
  const value = (profile ?? "").trim();
  return value.length > 0 ? value : undefined;
}

export function registerMcpCompatIpc(): void {
  ipcMain.handle("mcp:list-servers", async (_event, profile?: string) => {
    const servers = await ServeMcpAdapter.list(profileFromInput(profile));
    return servers.map(toMcpServer);
  });

  ipcMain.handle("mcp:create-server", async (_event, input: CreateMcpServerInput) => {
    if (!input?.name || !input.transport) {
      throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "name and transport required");
    }
    if (input.transport !== "streamable_http") {
      throw new McpServiceError(
        MCP_ERROR_CODES.ARGUMENT_INVALID,
        "Only streamable_http MCP servers are supported via Runtime",
      );
    }
    const saved = await ServeMcpAdapter.save(undefined, {
      name: input.name,
      enabled: input.enabled ?? true,
      url: input.url,
      token: input.bearerToken,
    });
    return toMcpServer(saved);
  });

  ipcMain.handle(
    "mcp:update-server",
    async (_event, id: string, patch: UpdateMcpServerInput) => {
      if (!id) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "id required");
      const servers = await ServeMcpAdapter.list();
      const existing = servers.find((s) => s.serverId === id || s.name === id);
      if (!existing) {
        throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, "Server not found");
      }
      const saved = await ServeMcpAdapter.save(undefined, {
        name: patch.name ?? existing.name,
        enabled: patch.enabled ?? existing.enabled,
        url: patch.url ?? existing.url ?? undefined,
        token: patch.bearerToken,
      });
      return toMcpServer(saved);
    },
  );

  ipcMain.handle("mcp:delete-server", async (_event, id: string) => {
    if (!id) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "id required");
    await ServeMcpAdapter.remove(id);
    return { ok: true };
  });

  ipcMain.handle("mcp:set-server-enabled", async (_event, id: string, enabled: boolean) => {
    if (!id) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "id required");
    if (enabled) await ServeMcpAdapter.enable(id);
    else await ServeMcpAdapter.disable(id);
    const servers = await ServeMcpAdapter.list();
    const current = servers.find((s) => s.serverId === id || s.name === id);
    if (!current) {
      throw new McpServiceError(MCP_ERROR_CODES.SERVER_NOT_FOUND, "Server not found");
    }
    return toMcpServer(current);
  });

  ipcMain.handle("mcp:test-connection", async (_event, id: string) => {
    if (!id) throw new McpServiceError(MCP_ERROR_CODES.ARGUMENT_INVALID, "id required");
    const raw = await ServeMcpAdapter.test(id);
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const ok = obj.ok !== false && obj.status !== "failed";
    return {
      ok,
      status: ok ? "connected" : "connect_failed",
      errorMessage: typeof obj.lastError === "string" ? obj.lastError : null,
      toolsPreview: typeof obj.toolsCount === "number" ? obj.toolsCount : 0,
    };
  });

  // Operations without Runtime counterpart — fail closed (no legacy fallback).
  ipcMain.handle("mcp:sync-tools", () => movedError());
  ipcMain.handle("mcp:list-tools", () => []);
  ipcMain.handle("mcp:set-tool-enabled", () => movedError());
  ipcMain.handle("mcp:bind-tool", () => movedError());
  ipcMain.handle("mcp:unbind-tool", () => movedError());
  ipcMain.handle("mcp:check-bridge", () => ({
    installed: false,
    message: MOVED,
  }));
  ipcMain.handle("mcp:install-bridge", () => movedError());
  ipcMain.handle("mcp:invoke-test", () => movedError());
  ipcMain.handle("mcp:list-invocations", () => []);
  ipcMain.handle("mcp:list-artifacts", () => []);
}
