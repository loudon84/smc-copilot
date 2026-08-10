/**
 * Copilot Runtime IPC — connection + Phase 2 Instance/Diagnostics.
 */
import { ipcMain } from "electron";
import { getCachedCapabilities, getCachedReadiness, setCachedReadiness } from "./runtime-capability-manager";
import {
  fetchDiagnosticsSummary,
  getRuntimeConnectionState,
  initCopilotRuntimeConnection,
  repairRuntimeConnection,
  retryRuntimeConnection,
  runRuntimeHandshake,
} from "./runtime-connection-manager";
import { confirmPairing, pairAndConnect, startPairing } from "./runtime-pairing-manager";
import {
  CopilotRuntimeHttpError,
  runtimeFetch,
  type RuntimeHttpMethod,
} from "./runtime-http-client";
import { isServeControlPlaneEnabled, isServeChatTransportPreferred } from "./runtime-mode";
import { ServeInstanceAdapter } from "../runtime-adapters/ServeInstanceAdapter";
import { ServeDiagnosticsAdapter } from "../runtime-adapters/ServeDiagnosticsAdapter";
import { ServeConfigurationAdapter } from "../runtime-adapters/ServeConfigurationAdapter";
import { ChatCapabilityRuntime } from "../runtime-adapters/ChatCapabilityRuntime";
import { getSmcRuntimeClient } from "./smc-runtime-client";

export interface CopilotRuntimeProxyFetchRequest {
  path: string;
  method?: RuntimeHttpMethod;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  unauthenticated?: boolean;
}

export interface CopilotRuntimeProxyFetchResult {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: { code: string; message: string; retryable: boolean } | null;
}

function mutationResult(err: unknown): { ok: boolean; message: string | null } {
  if (err instanceof CopilotRuntimeHttpError) {
    return { ok: false, message: err.runtimeError.message };
  }
  if (err instanceof Error) return { ok: false, message: err.message };
  return { ok: false, message: String(err) };
}

let registered = false;

export function registerCopilotRuntimeIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle("copilot-runtime:get-state", () => getRuntimeConnectionState());
  ipcMain.handle("copilot-runtime:get-capabilities", () => getCachedCapabilities());
  ipcMain.handle("copilot-runtime:get-readiness", async () => {
    try {
      const readiness = await getSmcRuntimeClient().runtime.getReadiness();
      setCachedReadiness(readiness);
      return readiness;
    } catch (err) {
      console.error("[copilot-runtime] get-readiness", err);
      setCachedReadiness(null);
      return getCachedReadiness();
    }
  });
  ipcMain.handle("copilot-runtime:get-diagnostics-summary", () => fetchDiagnosticsSummary());
  ipcMain.handle("copilot-runtime:start-pairing", () => startPairing());
  ipcMain.handle("copilot-runtime:confirm-pairing", (_event, pairingId: string) => {
    if (typeof pairingId !== "string" || !pairingId.trim()) {
      return { ok: false, deviceId: null, message: "pairingId required" };
    }
    return confirmPairing(pairingId.trim()).then(async (result) => {
      if (result.ok) {
        await runRuntimeHandshake();
      }
      return result;
    });
  });
  ipcMain.handle("copilot-runtime:pair-and-connect", () => pairAndConnect());
  ipcMain.handle("copilot-runtime:retry", () => retryRuntimeConnection());
  ipcMain.handle("copilot-runtime:repair", () => repairRuntimeConnection());

  ipcMain.handle("copilot-runtime:start-install", async (_event, body?: unknown) => {
    try {
      const result = await getSmcRuntimeClient().runtime.install(
        body && typeof body === "object" ? (body as Record<string, unknown>) : undefined,
      );
      return { jobId: result.jobId, status: result.status, message: null };
    } catch (err) {
      return {
        jobId: null,
        status: "failed",
        message: mutationResult(err).message ?? "install failed",
      };
    }
  });

  ipcMain.handle("copilot-runtime:start-update", async (_event, body?: unknown) => {
    try {
      const result = await getSmcRuntimeClient().runtime.update(
        body && typeof body === "object" ? (body as Record<string, unknown>) : undefined,
      );
      return { jobId: result.jobId, status: result.status, message: null };
    } catch (err) {
      return {
        jobId: null,
        status: "failed",
        message: mutationResult(err).message ?? "update failed",
      };
    }
  });

  ipcMain.handle("copilot-runtime:start-rollback", async (_event, body?: unknown) => {
    try {
      const result = await getSmcRuntimeClient().runtime.rollback(
        body && typeof body === "object" ? (body as Record<string, unknown>) : undefined,
      );
      return { jobId: result.jobId, status: result.status, message: null };
    } catch (err) {
      return {
        jobId: null,
        status: "failed",
        message: mutationResult(err).message ?? "rollback failed",
      };
    }
  });

  ipcMain.handle("copilot-runtime:start-doctor", async () => {
    try {
      const result = await getSmcRuntimeClient().runtime.doctor();
      return { jobId: result.jobId, status: result.status, message: null };
    } catch (err) {
      return {
        jobId: null,
        status: "failed",
        message: mutationResult(err).message ?? "doctor failed",
      };
    }
  });

  ipcMain.handle("copilot-runtime:get-job", async (_event, jobId: string) => {
    if (typeof jobId !== "string" || !jobId.trim()) return null;
    try {
      return await getSmcRuntimeClient().runtime.getJob(jobId.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:list-jobs", async () => {
    try {
      return await getSmcRuntimeClient().runtime.listJobs();
    } catch {
      return [];
    }
  });

  ipcMain.handle("copilot-runtime:list-versions", async () => {
    try {
      return await getSmcRuntimeClient().runtime.listVersions();
    } catch {
      return [];
    }
  });

  ipcMain.handle("copilot-runtime:get-memory", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) return null;
    try {
      return await getSmcRuntimeClient().memory.get(instanceId.trim());
    } catch (err) {
      console.error("[copilot-runtime] get-memory", err);
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:get-session-stats", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) return null;
    try {
      return await getSmcRuntimeClient().sessions.stats(instanceId.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:expert-mcp-status", async () => {
    try {
      return await getSmcRuntimeClient().expertMcp.status();
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:expert-mcp-connect", async () => {
    try {
      return await getSmcRuntimeClient().expertMcp.connect();
    } catch (err) {
      return { ok: false, error: mutationResult(err).message };
    }
  });

  ipcMain.handle("copilot-runtime:expert-mcp-test", async () => {
    try {
      return await getSmcRuntimeClient().expertMcp.test();
    } catch (err) {
      return { ok: false, error: mutationResult(err).message };
    }
  });

  ipcMain.handle("copilot-runtime:expert-mcp-diagnostics", async () => {
    try {
      return await getSmcRuntimeClient().expertMcp.diagnostics();
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:export-diagnostics-bundle", async () => {
    try {
      const result = await getSmcRuntimeClient().diagnostics.createBundle({});
      return { ok: true, path: (result as { path?: string })?.path, message: null };
    } catch (err) {
      return { ok: false, message: mutationResult(err).message };
    }
  });

  ipcMain.handle("copilot-runtime:is-serve-control-plane", () =>
    isServeControlPlaneEnabled(getRuntimeConnectionState().ready),
  );

  /** Preferred Serve Chat transport (ignores live Ready — PRD v1.5.4 Model Picker). */
  ipcMain.handle("copilot-runtime:is-serve-chat-preferred", () =>
    isServeChatTransportPreferred(),
  );

  ipcMain.handle("copilot-runtime:list-instances", async () => {
    try {
      return await ServeInstanceAdapter.list();
    } catch (err) {
      console.error("[copilot-runtime] list-instances", err);
      return [];
    }
  });

  ipcMain.handle("copilot-runtime:get-instance", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) return null;
    try {
      return await ServeInstanceAdapter.get(instanceId.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:resolve-instance", async (_event, ref: string) => {
    if (typeof ref !== "string" || !ref.trim()) return null;
    try {
      return await ServeInstanceAdapter.resolveRef(ref.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:start-instance", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) {
      return { ok: false, message: "instanceId required" };
    }
    return ServeInstanceAdapter.start(instanceId.trim());
  });

  ipcMain.handle("copilot-runtime:stop-instance", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) {
      return { ok: false, message: "instanceId required" };
    }
    return ServeInstanceAdapter.stop(instanceId.trim());
  });

  ipcMain.handle("copilot-runtime:restart-instance", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) {
      return { ok: false, message: "instanceId required" };
    }
    return ServeInstanceAdapter.restart(instanceId.trim());
  });

  ipcMain.handle("copilot-runtime:get-instance-health", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) return null;
    try {
      return await ServeInstanceAdapter.health(instanceId.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:get-instance-state", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) return null;
    try {
      return await ServeInstanceAdapter.getState(instanceId.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:get-instance-diagnostics", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) return null;
    try {
      return await ServeInstanceAdapter.getDiagnostics(instanceId.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle("copilot-runtime:reconcile-instance", async (_event, instanceId: string) => {
    if (typeof instanceId !== "string" || !instanceId.trim()) return null;
    try {
      return await ServeInstanceAdapter.reconcile(instanceId.trim());
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "copilot-runtime:get-instance-logs",
    async (_event, instanceId: string, options?: { tail?: number }) => {
      if (typeof instanceId !== "string" || !instanceId.trim()) return null;
      try {
        return await ServeInstanceAdapter.logs(instanceId.trim(), options);
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle("copilot-runtime:get-diagnostics-environment", async () => {
    try {
      return await ServeDiagnosticsAdapter.environment();
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "copilot-runtime:get-diagnostics-logs",
    async (_event, options?: { tail?: number }) => {
      try {
        return await ServeDiagnosticsAdapter.logs(options);
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle(
    "copilot-runtime:proxy-fetch",
    async (_event, request: CopilotRuntimeProxyFetchRequest): Promise<CopilotRuntimeProxyFetchResult> => {
      if (!request || typeof request.path !== "string" || !request.path.startsWith("/")) {
        return {
          ok: false,
          status: null,
          data: null,
          error: { code: "UNKNOWN", message: "path must start with /", retryable: false },
        };
      }
      try {
        const data = await runtimeFetch({
          path: request.path,
          method: request.method ?? "GET",
          body: request.body,
          query: request.query,
          unauthenticated: request.unauthenticated,
        });
        return { ok: true, status: 200, data, error: null };
      } catch (err) {
        if (err instanceof CopilotRuntimeHttpError) {
          return {
            ok: false,
            status: err.status,
            data: null,
            error: {
              code: err.runtimeError.code,
              message: err.runtimeError.message,
              retryable: err.runtimeError.retryable,
            },
          };
        }
        return mutationResult(err).ok
          ? { ok: true, status: 200, data: null, error: null }
          : {
              ok: false,
              status: null,
              data: null,
              error: {
                code: "UNKNOWN",
                message: mutationResult(err).message ?? "unknown",
                retryable: true,
              },
            };
      }
    },
  );

  // PRD v1.5.4 — Chat model catalog via Runtime (execution models, not gateway virtual).
  ipcMain.handle(
    "copilot-runtime:list-chat-models",
    async (
      _event,
      options?: { profileRef?: string; refresh?: boolean },
    ) => {
      try {
        return await ServeConfigurationAdapter.listModelOptions(options?.profileRef, {
          refresh: options?.refresh,
        });
      } catch {
        return [];
      }
    },
  );

  ipcMain.handle(
    "copilot-runtime:get-chat-model-config",
    async (_event, profileRef?: string) => {
      try {
        return await ServeConfigurationAdapter.getModelConfig(profileRef);
      } catch {
        return null;
      }
    },
  );

  // PRD v1.6 — Chat capability closure (Session / Files / Commands / Workspace / Settings)
  ipcMain.handle("copilot-runtime:list-sessions", async (_e, profileRef?: string) => {
    try {
      return await ChatCapabilityRuntime.listSessions(profileRef);
    } catch {
      return [];
    }
  });
  ipcMain.handle(
    "copilot-runtime:list-session-messages",
    async (_e, sessionId: string, profileRef?: string) => {
      try {
        return await ChatCapabilityRuntime.listMessages(sessionId, profileRef);
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    "copilot-runtime:list-session-files",
    async (_e, sessionId: string, profileRef?: string) => {
      try {
        return await ChatCapabilityRuntime.listFiles(sessionId, profileRef);
      } catch {
        return { files: [] };
      }
    },
  );
  ipcMain.handle(
    "copilot-runtime:search-session-files",
    async (_e, sessionId: string, query: string, profileRef?: string) => {
      try {
        return await ChatCapabilityRuntime.searchFiles(sessionId, query, profileRef);
      } catch {
        return { hits: [] };
      }
    },
  );
  ipcMain.handle(
    "copilot-runtime:add-session-file-context",
    async (_e, sessionId: string, fileId: string, profileRef?: string) =>
      ChatCapabilityRuntime.addFileContext(sessionId, fileId, profileRef),
  );
  ipcMain.handle(
    "copilot-runtime:remove-session-file-context",
    async (_e, sessionId: string, fileId: string, profileRef?: string) =>
      ChatCapabilityRuntime.removeFileContext(sessionId, fileId, profileRef),
  );
  ipcMain.handle(
    "copilot-runtime:get-session-chat-settings",
    async (_e, sessionId: string, profileRef?: string) => {
      try {
        return await ChatCapabilityRuntime.getChatSettings(sessionId, profileRef);
      } catch {
        return null;
      }
    },
  );
  ipcMain.handle(
    "copilot-runtime:patch-session-chat-settings",
    async (
      _e,
      sessionId: string,
      body: { modelId?: string | null; contextFolder?: string | null },
      profileRef?: string,
    ) => ChatCapabilityRuntime.patchChatSettings(sessionId, body, profileRef),
  );
  ipcMain.handle(
    "copilot-runtime:list-chat-commands",
    async (_e, profileRef?: string) => {
      try {
        return await ChatCapabilityRuntime.listChatCommands(profileRef);
      } catch {
        return { commands: [], rpcReady: false };
      }
    },
  );
  ipcMain.handle(
    "copilot-runtime:list-session-workspace",
    async (_e, sessionId: string, path?: string, profileRef?: string) =>
      ChatCapabilityRuntime.listWorkspace(sessionId, path, profileRef),
  );
  ipcMain.handle(
    "copilot-runtime:read-session-workspace-file",
    async (_e, sessionId: string, path: string, profileRef?: string) =>
      ChatCapabilityRuntime.readWorkspaceFile(sessionId, path, profileRef),
  );
  ipcMain.handle(
    "copilot-runtime:session-workspace-terminal-path",
    async (_e, sessionId: string, profileRef?: string) =>
      ChatCapabilityRuntime.workspaceTerminalPath(sessionId, profileRef),
  );
  ipcMain.handle(
    "copilot-runtime:execute-chat-command",
    async (
      _e,
      runId: string,
      body: { turnId?: string; sessionId?: string; name: string; args?: string },
    ) => ChatCapabilityRuntime.executeCommand(runId, body),
  );
  ipcMain.handle(
    "copilot-runtime:create-background-turn",
    async (
      _e,
      runId: string,
      body: { parentTurnId?: string; sessionId?: string; message: string },
    ) => ChatCapabilityRuntime.createBackgroundTurn(runId, body),
  );
}

export { initCopilotRuntimeConnection };
