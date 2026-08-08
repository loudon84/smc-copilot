import { ipcMain } from "electron";
import type {
  McpSkillGatewayActionResult,
  McpSkillGatewayRuntimeConfig,
} from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import { readStoredSession } from "../auth/token-store";
import {
  getMcpSkillGatewayConfig,
  saveMcpSkillGatewayConfig,
} from "./mcp-skill-gateway-config";
import { listMcpSkillGatewayProfileRegistrations } from "./mcp-skill-gateway-register";
import {
  testMcpSkillGatewayProxy,
  testRemoteMcpSkillGateway,
} from "./mcp-skill-gateway-health";
import { readMcpSkillGatewayLogs, readStructuredMcpGatewayLogs } from "./mcp-skill-gateway-log";
import {
  buildMcpSkillGatewayRuntimeStatus,
  onMcpSkillGatewayLoginSuccess,
  onMcpSkillGatewayLogout,
} from "./mcp-skill-gateway-lifecycle";
import { isMcpSkillGatewayError, McpSkillGatewayError } from "./mcp-skill-gateway-errors";
import { runMcpSkillGatewayDiagnostics } from "./mcp-gateway-diagnostics";
import { invokeRemoteMcpTool } from "./mcp-gateway-invoke-test";
import { listRemoteMcpTools } from "./mcp-tools-cache";
import {
  clearRecentHermesTasks,
  createHermesTaskEventsToken,
  downloadHermesArtifact,
  getHermesClientAgent,
  getHermesClientBootstrap,
  getHermesTaskResult,
  listHermesClientAgents,
  listHermesClientTools,
  listRecentHermesTasks,
  previewHermesArtifact,
  runHermesReadinessCheck,
} from "./hermes-client-api";

/** PRD v1.4 — Expert MCP local proxy disabled; use Runtime APIs. */
const EXPERT_MCP_MOVED =
  "Expert MCP local proxy is disabled. Use window.copilotRuntime Expert MCP APIs.";

function rejectExpertMcpProxyControl(): McpSkillGatewayActionResult {
  return {
    ok: false,
    error: EXPERT_MCP_MOVED,
    errorCode: "MCP_GATEWAY_PROXY_START_FAILED",
  };
}

function toActionResult(err: unknown): McpSkillGatewayActionResult {
  if (isMcpSkillGatewayError(err)) {
    return { ok: false, error: err.message, errorCode: err.code };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    errorCode: "MCP_GATEWAY_PROXY_START_FAILED",
  };
}

async function requireLoggedIn(): Promise<void> {
  const session = await readStoredSession();
  if (!session?.accessToken) {
    throw new McpSkillGatewayError(
      "MCP_GATEWAY_NOT_LOGGED_IN",
      "Desktop login required",
    );
  }
}

export function registerMcpSkillGatewayRuntimeIpc(): void {
  ipcMain.handle("mcp-skill-gateway-runtime:get-status", async () =>
    buildMcpSkillGatewayRuntimeStatus(),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:get-config", async () =>
    getMcpSkillGatewayConfig(),
  );

  ipcMain.handle(
    "mcp-skill-gateway-runtime:save-config",
    async (_, patch: Partial<McpSkillGatewayRuntimeConfig>) =>
      saveMcpSkillGatewayConfig(patch),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:start-proxy", async () =>
    rejectExpertMcpProxyControl(),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:stop-proxy", async () =>
    rejectExpertMcpProxyControl(),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:restart-proxy", async () =>
    rejectExpertMcpProxyControl(),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:test-proxy", async () =>
    testMcpSkillGatewayProxy(),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:test-remote-mcp", async () =>
    testRemoteMcpSkillGateway(),
  );

  ipcMain.handle(
    "mcp-skill-gateway-runtime:register-to-profile",
    async (_, profile: string) => ({
      ok: false,
      changed: false,
      configPath: "",
      profile: profile || "default",
      url: "",
      error: EXPERT_MCP_MOVED,
      errorCode: "MCP_GATEWAY_PROXY_START_FAILED" as const,
    }),
  );

  ipcMain.handle(
    "mcp-skill-gateway-runtime:unregister-from-profile",
    async (_, profile: string) => ({
      ok: false,
      changed: false,
      configPath: "",
      profile: profile || "default",
      url: "",
      error: EXPERT_MCP_MOVED,
      errorCode: "MCP_GATEWAY_PROXY_START_FAILED" as const,
    }),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:list-profile-registrations", async () =>
    listMcpSkillGatewayProfileRegistrations(),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:read-proxy-logs", async (_, lines?: number) =>
    readMcpSkillGatewayLogs(lines),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:read-structured-logs", async (_, lines?: number) =>
    readStructuredMcpGatewayLogs(lines),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:run-diagnostics", async () =>
    runMcpSkillGatewayDiagnostics(),
  );

  ipcMain.handle("mcp-skill-gateway-runtime:list-remote-tools", async (_, forceRefresh?: boolean) =>
    listRemoteMcpTools({ forceRefresh: Boolean(forceRefresh) }),
  );

  ipcMain.handle(
    "mcp-skill-gateway-runtime:invoke-remote-tool",
    async (_, input) => invokeRemoteMcpTool(input),
  );

  ipcMain.handle("hermes-client:get-bootstrap", async (_, input) => {
    try {
      await requireLoggedIn();
      return getHermesClientBootstrap(input);
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("hermes-client:list-agents", async (_, input) => {
    try {
      await requireLoggedIn();
      return listHermesClientAgents(input);
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("hermes-client:get-agent", async (_, agentAlias: string) => {
    try {
      await requireLoggedIn();
      return getHermesClientAgent(agentAlias);
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("hermes-client:list-tools", async (_, input) => {
    try {
      await requireLoggedIn();
      return listHermesClientTools(input);
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("hermes-client:readiness-check", async (_, input) => {
    try {
      await requireLoggedIn();
      return runHermesReadinessCheck(input);
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("hermes-client:create-events-token", async (_, taskId: string) => {
    try {
      await requireLoggedIn();
      return createHermesTaskEventsToken(taskId);
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("hermes-client:get-task-result", async (_, taskId: string) => {
    try {
      await requireLoggedIn();
      return getHermesTaskResult(taskId);
    } catch (err) {
      return toActionResult(err);
    }
  });

  ipcMain.handle("hermes-client:preview-artifact", async (_, artifactId: string) => {
    try {
      await requireLoggedIn();
      return previewHermesArtifact(artifactId);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "HERMES_CLIENT_ARTIFACT_PREVIEW_FAILED",
      };
    }
  });

  ipcMain.handle("hermes-client:download-artifact", async (_, artifactId: string) => {
    try {
      await requireLoggedIn();
      return downloadHermesArtifact(artifactId);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "HERMES_CLIENT_ARTIFACT_DOWNLOAD_FAILED",
      };
    }
  });

  ipcMain.handle("hermes-client:get-recent-tasks", async () => listRecentHermesTasks());

  ipcMain.handle("hermes-client:clear-recent-tasks", async () => {
    clearRecentHermesTasks();
  });
}

export { onMcpSkillGatewayLoginSuccess, onMcpSkillGatewayLogout };
