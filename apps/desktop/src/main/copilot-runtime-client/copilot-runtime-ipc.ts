/**
 * Copilot Runtime IPC — connection + Phase 2 Instance/Diagnostics.
 */
import { ipcMain } from "electron";
import { getCachedCapabilities } from "./runtime-capability-manager";
import {
  fetchDiagnosticsSummary,
  getRuntimeConnectionState,
  initCopilotRuntimeConnection,
  repairRuntimeConnection,
  retryRuntimeConnection,
  runRuntimeHandshake,
} from "./runtime-connection-manager";
import { confirmPairing, startPairing } from "./runtime-pairing-manager";
import {
  CopilotRuntimeHttpError,
  runtimeFetch,
  type RuntimeHttpMethod,
} from "./runtime-http-client";
import { isServeControlPlaneEnabled } from "./runtime-mode";
import { ServeInstanceAdapter } from "../runtime-adapters/ServeInstanceAdapter";
import { ServeDiagnosticsAdapter } from "../runtime-adapters/ServeDiagnosticsAdapter";
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

  ipcMain.handle("copilot-runtime:is-serve-control-plane", () =>
    isServeControlPlaneEnabled(getRuntimeConnectionState().ready),
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
}

export { initCopilotRuntimeConnection };
