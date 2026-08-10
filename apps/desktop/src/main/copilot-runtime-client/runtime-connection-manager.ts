/**
 * Runtime connection handshake + 7-state machine (PRD §5.1 / §6.2).
 */
import { BrowserWindow } from "electron";
import type {
  RuntimeConnectionState,
  RuntimeHealthProbeResult,
} from "../../shared/copilot-runtime/runtime-state-contract";
import { createInitialRuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import type { RuntimeDiagnosticsSummary } from "../../shared/copilot-runtime/runtime-capability-contract";
import {
  clearDeviceToken,
  getDeviceMetaSync,
  getDeviceTokenPersistence,
  getPublicAuthSnapshot,
  hydrateRuntimeAuthStore,
  isPairedSync,
  setLegacySharedToken,
} from "./runtime-auth-store";
import {
  getCachedCapabilities,
  getCachedReadiness,
  setCachedCapabilities,
  setCachedReadiness,
  toCapabilitiesView,
} from "./runtime-capability-manager";
import { CopilotRuntimeHttpError, runtimeFetch } from "./runtime-http-client";
import {
  canSpawnCopilotServe,
  DESKTOP_RUNTIME_API_VERSION,
  resolveCopilotRuntimeMode,
  resolveServeBaseUrl,
} from "./runtime-mode";
import {
  getSmcRuntimeClient,
  type RuntimeCapabilities,
  type RuntimeStatus,
} from "./smc-runtime-client";

interface RuntimeCompatibilityResponse {
  apiVersion?: string;
  minDesktopApi?: string;
  notes?: string[];
}

type StateListener = (state: RuntimeConnectionState) => void;

let currentState = createInitialRuntimeConnectionState({
  baseUrl: resolveServeBaseUrl(),
});
const listeners = new Set<StateListener>();
let handshakeInFlight: Promise<RuntimeConnectionState> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function emit(state: RuntimeConnectionState): void {
  currentState = state;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.warn("[copilot-runtime] state listener error:", err);
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("copilot-runtime:state-changed", state);
    }
  }
}

function setState(patch: Partial<RuntimeConnectionState>): RuntimeConnectionState {
  const next: RuntimeConnectionState = {
    ...currentState,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  emit(next);
  return next;
}

export function getRuntimeConnectionState(): RuntimeConnectionState {
  return currentState;
}

export function onRuntimeConnectionStateChanged(listener: StateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function compareApiVersion(actual: string, required: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, "")
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0);
  const a = parse(actual);
  const b = parse(required);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function logConnectionProbe(baseUrl: string, env: NodeJS.ProcessEnv = process.env): void {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/health`;
  const mode = resolveCopilotRuntimeMode(env);
  console.info(
    "[copilot-runtime] connection probe\n" +
      `mode=${mode}\n` +
      `baseUrl=${baseUrl}\n` +
      `healthUrl=${healthUrl}\n` +
      `COPILOT_SERVE_URL configured=${Boolean(env.COPILOT_SERVE_URL?.trim())}\n` +
      `COPILOT_RUNTIME_URL configured=${Boolean(env.COPILOT_RUNTIME_URL?.trim())}\n` +
      `COPILOT_SERVE_PORT configured=${Boolean(env.COPILOT_SERVE_PORT?.trim())}`,
  );
}

/**
 * Structured Runtime health probe (PRD v1.5.4 §27–28).
 * reachable when HTTP 2xx AND body.status === "ok".
 */
export async function probeHealth(baseUrl: string): Promise<RuntimeHealthProbeResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/health`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = Date.now() - started;
    let serviceStatus: string | undefined;
    try {
      const body = (await res.json()) as { status?: unknown };
      if (typeof body?.status === "string") serviceStatus = body.status;
    } catch {
      serviceStatus = undefined;
    }
    const reachable = res.ok && serviceStatus === "ok";
    return {
      reachable,
      url,
      httpStatus: res.status,
      serviceStatus,
      latencyMs,
      errorCode: reachable ? undefined : "RUNTIME_HEALTH_DEGRADED",
      errorMessage: reachable
        ? undefined
        : `Health probe failed (http=${res.status}, status=${serviceStatus ?? "unknown"})`,
    };
  } catch (err) {
    return {
      reachable: false,
      url,
      latencyMs: Date.now() - started,
      errorCode: "RUNTIME_UNAVAILABLE",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

function readinessFlags(): {
  serviceReady: boolean;
  executionReady: boolean;
  chatReady: boolean;
  maintenanceReady: boolean;
} {
  const readiness = getCachedReadiness();
  return {
    serviceReady: readiness?.service?.ready === true,
    executionReady: readiness?.execution?.ready === true,
    chatReady: readiness?.execution?.chatReady === true,
    maintenanceReady: readiness?.maintenance?.ready === true,
  };
}

const HANDSHAKE_TIMEOUT_MS = 10_000;

export async function runRuntimeHandshake(): Promise<RuntimeConnectionState> {
  if (handshakeInFlight) return handshakeInFlight;
  const inner = performHandshake();
  // performHandshake 自身吞掉所有异常并落到终态；race 仅兜底「请求悬挂永不 settle」
  // （例如对端进程死亡导致的半开 TCP 连接），避免状态机永久卡在 Connecting。
  let timeout: ReturnType<typeof setTimeout> | null = null;
  handshakeInFlight = Promise.race([
    inner,
    new Promise<RuntimeConnectionState>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`Runtime handshake timed out after ${HANDSHAKE_TIMEOUT_MS}ms`)),
        HANDSHAKE_TIMEOUT_MS,
      );
    }),
  ])
    .catch((err) =>
      setState({
        state: "RuntimeMissing",
        ready: false,
        reachable: false,
        serviceReady: false,
        executionReady: false,
        chatReady: false,
        maintenanceReady: false,
        canRepair: true,
        canRetry: true,
        lastError: err instanceof Error ? err.message : String(err),
        lastErrorCode: "RUNTIME_UNAVAILABLE",
      }),
    )
    .finally(() => {
      if (timeout) clearTimeout(timeout);
      handshakeInFlight = null;
    });

  return handshakeInFlight;
}

async function performHandshake(): Promise<RuntimeConnectionState> {
    const baseUrl = resolveServeBaseUrl();
    const mode = resolveCopilotRuntimeMode();
    const auth = getPublicAuthSnapshot();

    logConnectionProbe(baseUrl);

    // 后台轮询重验证时保持 Ready，避免状态在 Connecting 间抖动阻塞写操作；
    // 仅当尚未 Ready（首连 / 故障恢复）时才广播 Connecting。
    if (currentState.state !== "Ready") {
      setState({
        state: "Connecting",
        baseUrl,
        port: Number(new URL(baseUrl).port || 8765),
        ready: false,
        reachable: false,
        serviceReady: false,
        executionReady: false,
        chatReady: false,
        maintenanceReady: false,
        paired: auth.paired,
        deviceId: auth.deviceId,
        lastError: null,
        lastErrorCode: null,
        canRetry: true,
        canRepair: false,
        canPair: false,
      });
    }

    const probe = await probeHealth(baseUrl);
    if (!probe.reachable) {
      // PRD v1.5.4: Desktop never auto-spawns Runtime; unreachable → RuntimeMissing.
      return setState({
        state: "RuntimeMissing",
        ready: false,
        reachable: false,
        serviceReady: false,
        executionReady: false,
        chatReady: false,
        maintenanceReady: false,
        canRepair: mode === "production" || canSpawnCopilotServe(mode),
        canRetry: true,
        lastError:
          probe.errorMessage ??
          "Runtime service is not reachable. Start Runtime separately (npm run dev:runtime) or use Repair.",
        lastErrorCode: probe.errorCode ?? "RUNTIME_UNAVAILABLE",
      });
    }

    try {
      const client = getSmcRuntimeClient(baseUrl);
      // Prefer contract-generated client for status / capabilities (Monorepo Phase 5).
      const status = (await client.getStatus()) as RuntimeStatus;
      const capabilities = (await client.getCapabilities()) as RuntimeCapabilities;
      setCachedCapabilities(toCapabilitiesView(capabilities as { apiVersion?: string; features?: string[] }));
      // PRD v1.4.1 §12–§14 / §63 — Connection Ready is driven only by readiness.service.
      // Do not re-judge via status.status / hermesInstalled / status.checks.
      let readiness: Awaited<ReturnType<typeof client.runtime.getReadiness>> | null = null;
      try {
        readiness = await client.runtime.getReadiness();
        setCachedReadiness(readiness);
      } catch (readinessErr) {
        console.warn("[copilot-runtime] readiness fetch failed (no legacy fallback):", readinessErr);
        setCachedReadiness(null);
        readiness = null;
      }

      const flags = readinessFlags();

      const compatibility = await runtimeFetch<RuntimeCompatibilityResponse>({
        path: "/api/v1/runtime/compatibility",
        unauthenticated: !isPairedSync(),
      });

      const minDesktop = compatibility.minDesktopApi ?? "1.0";
      const compatible = compareApiVersion(DESKTOP_RUNTIME_API_VERSION, minDesktop) >= 0;
      const reasons: string[] = [];
      if (!compatible) {
        reasons.push(
          `Desktop API ${DESKTOP_RUNTIME_API_VERSION} is below Serve minDesktopApi ${minDesktop}`,
        );
      }
      if (compatibility.notes?.length) {
        reasons.push(...compatibility.notes);
      }

      if (!compatible) {
        return setState({
          state: "Incompatible",
          ready: false,
          reachable: true,
          ...flags,
          paired: isPairedSync(),
          deviceId: getDeviceMetaSync()?.deviceId ?? null,
          runtimeVersion: status.serviceVersion ?? null,
          runtimeApiVersion: status.apiVersion ?? compatibility.apiVersion ?? null,
          hermesVersion: status.activeHermesVersion ?? null,
          compatibility: {
            compatible: false,
            runtimeApiVersion: compatibility.apiVersion ?? null,
            desktopApiVersion: DESKTOP_RUNTIME_API_VERSION,
            reasons,
          },
          lastError: reasons[0] ?? "Runtime incompatible",
          lastErrorCode: "RUNTIME_INCOMPATIBLE",
          canPair: false,
          canRepair: false,
          canRetry: true,
        });
      }

      if (!isPairedSync()) {
        return setState({
          state: "PairingRequired",
          ready: false,
          reachable: true,
          ...flags,
          paired: false,
          deviceId: null,
          runtimeVersion: status.serviceVersion ?? null,
          runtimeApiVersion: status.apiVersion ?? null,
          hermesVersion: status.activeHermesVersion ?? null,
          compatibility: {
            compatible: true,
            runtimeApiVersion: compatibility.apiVersion ?? null,
            desktopApiVersion: DESKTOP_RUNTIME_API_VERSION,
            reasons: [],
          },
          canPair: true,
          canRetry: true,
          canRepair: false,
          lastError: "Device pairing required",
          lastErrorCode: "PAIRING_REQUIRED",
        });
      }

      const serviceReady = flags.serviceReady;
      if (!serviceReady) {
        return setState({
          state: "RuntimeDegraded",
          ready: false,
          reachable: true,
          ...flags,
          paired: true,
          deviceId: getDeviceMetaSync()?.deviceId ?? null,
          runtimeVersion: status.serviceVersion ?? null,
          runtimeApiVersion: status.apiVersion ?? null,
          hermesVersion: status.activeHermesVersion ?? null,
          compatibility: {
            compatible: true,
            runtimeApiVersion: compatibility.apiVersion ?? null,
            desktopApiVersion: DESKTOP_RUNTIME_API_VERSION,
            reasons: [],
          },
          canRetry: true,
          canRepair: true,
          canPair: false,
          lastError: readiness
            ? "Runtime service domain is not ready"
            : "Runtime readiness unavailable",
          lastErrorCode: "RUNTIME_UNAVAILABLE",
        });
      }

      // ready === serviceReady (legacy compat). Chat uses chatReady separately.
      return setState({
        state: "Ready",
        ready: true,
        reachable: true,
        ...flags,
        paired: true,
        deviceId: getDeviceMetaSync()?.deviceId ?? null,
        runtimeVersion: status.serviceVersion ?? null,
        runtimeApiVersion: status.apiVersion ?? null,
        hermesVersion: status.activeHermesVersion ?? null,
        compatibility: {
          compatible: true,
          runtimeApiVersion: compatibility.apiVersion ?? null,
          desktopApiVersion: DESKTOP_RUNTIME_API_VERSION,
          reasons: [],
        },
        lastError: null,
        lastErrorCode: null,
        canRetry: true,
        canRepair: false,
        canPair: false,
      });
    } catch (err) {
      if (err instanceof CopilotRuntimeHttpError) {
        const code = err.runtimeError.code;
        // Only clear credentials for explicit auth revocation — not every 401.
        if (code === "DEVICE_REVOKED" || code === "INVALID_DEVICE_TOKEN") {
          await clearDeviceToken();
          return setState({
            state: "PairingRequired",
            ready: false,
            reachable: true,
            serviceReady: false,
            executionReady: false,
            chatReady: false,
            maintenanceReady: false,
            paired: false,
            deviceId: null,
            canPair: true,
            lastError: err.runtimeError.message,
            lastErrorCode: code,
          });
        }
        if (code === "PAIRING_REQUIRED") {
          return setState({
            state: "PairingRequired",
            ready: false,
            reachable: true,
            serviceReady: false,
            executionReady: false,
            chatReady: false,
            maintenanceReady: false,
            paired: false,
            canPair: true,
            lastError: err.runtimeError.message,
            lastErrorCode: code,
          });
        }
        return setState({
          state: "RuntimeDegraded",
          ready: false,
          reachable: true,
          serviceReady: false,
          executionReady: false,
          chatReady: false,
          maintenanceReady: false,
          canRetry: true,
          canRepair: true,
          lastError: err.runtimeError.message,
          lastErrorCode: code,
        });
      }
      return setState({
        state: "RuntimeMissing",
        ready: false,
        reachable: false,
        serviceReady: false,
        executionReady: false,
        chatReady: false,
        maintenanceReady: false,
        canRepair: true,
        canRetry: true,
        lastError: err instanceof Error ? err.message : String(err),
        lastErrorCode: "RUNTIME_UNAVAILABLE",
      });
    }
}

export async function initCopilotRuntimeConnection(): Promise<RuntimeConnectionState> {
  await hydrateRuntimeAuthStore();
  const envToken = process.env.COPILOT_DESKTOP_TOKEN?.trim();
  if (envToken) {
    setLegacySharedToken(envToken);
  }
  const state = await runRuntimeHandshake();
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void runRuntimeHandshake();
    }, 15_000);
  }
  return state;
}

export async function retryRuntimeConnection(): Promise<RuntimeConnectionState> {
  return runRuntimeHandshake();
}

export async function repairRuntimeConnection(): Promise<{ ok: boolean; message: string | null }> {
  const mode = resolveCopilotRuntimeMode();
  if (canSpawnCopilotServe(mode)) {
    try {
      const { startCopilotServeProcess } = await import("../copilot-serve/copilot-serve-process");
      await startCopilotServeProcess();
      await runRuntimeHandshake();
      return { ok: currentState.state === "Ready" || currentState.state === "PairingRequired", message: null };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return {
    ok: false,
    message:
      "Production Runtime must be restored via the signed installer / Windows Service. Desktop cannot spawn Serve.",
  };
}

export async function fetchDiagnosticsSummary(): Promise<RuntimeDiagnosticsSummary | null> {
  const persistence = getDeviceTokenPersistence();
  const persistenceWarning =
    persistence === "memory-only"
      ? "Device authorization will be lost when Desktop exits."
      : null;
  try {
    const summary = await runtimeFetch<Record<string, unknown>>({
      path: "/api/v1/diagnostics/summary",
    });
    return {
      runtimeVersion:
        typeof summary.runtimeVersion === "string"
          ? summary.runtimeVersion
          : typeof summary.serviceVersion === "string"
            ? summary.serviceVersion
            : currentState.runtimeVersion,
      runtimeApiVersion:
        typeof summary.apiVersion === "string"
          ? summary.apiVersion
          : currentState.runtimeApiVersion,
      hermesVersion:
        typeof summary.hermesVersion === "string"
          ? summary.hermesVersion
          : currentState.hermesVersion,
      instanceCount: typeof summary.instanceCount === "number" ? summary.instanceCount : null,
      activeTasks: typeof summary.activeTasks === "number" ? summary.activeTasks : null,
      approvalCount: typeof summary.approvalCount === "number" ? summary.approvalCount : null,
      storeHealthy: typeof summary.storeHealthy === "boolean" ? summary.storeHealthy : null,
      deviceTokenPersistence: persistence,
      deviceTokenPersistenceWarning: persistenceWarning,
      details: summary,
    };
  } catch {
    return {
      runtimeVersion: currentState.runtimeVersion,
      runtimeApiVersion: currentState.runtimeApiVersion,
      hermesVersion: currentState.hermesVersion,
      instanceCount: null,
      activeTasks: null,
      approvalCount: null,
      storeHealthy: null,
      deviceTokenPersistence: persistence,
      deviceTokenPersistenceWarning: persistenceWarning,
      details: {
        capabilities: getCachedCapabilities(),
        state: currentState.state,
      },
    };
  }
}
