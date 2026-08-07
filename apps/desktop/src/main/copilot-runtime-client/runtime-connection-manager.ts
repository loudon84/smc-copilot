/**
 * Runtime connection handshake + 7-state machine (PRD §5.1 / §6.2).
 */
import { BrowserWindow } from "electron";
import type { RuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import { createInitialRuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import type { RuntimeDiagnosticsSummary } from "../../shared/copilot-runtime/runtime-capability-contract";
import {
  getDeviceMetaSync,
  getPublicAuthSnapshot,
  hydrateRuntimeAuthStore,
  isPairedSync,
  setLegacySharedToken,
} from "./runtime-auth-store";
import {
  getCachedCapabilities,
  setCachedCapabilities,
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

async function probeHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runRuntimeHandshake(): Promise<RuntimeConnectionState> {
  if (handshakeInFlight) return handshakeInFlight;
  handshakeInFlight = (async () => {
    const baseUrl = resolveServeBaseUrl();
    const mode = resolveCopilotRuntimeMode();
    const auth = getPublicAuthSnapshot();

    setState({
      state: "Connecting",
      baseUrl,
      port: Number(new URL(baseUrl).port || 8765),
      ready: false,
      paired: auth.paired,
      deviceId: auth.deviceId,
      lastError: null,
      lastErrorCode: null,
      canRetry: true,
      canRepair: false,
      canPair: false,
    });

    const healthy = await probeHealth(baseUrl);
    if (!healthy) {
      const missing = mode === "production" || !canSpawnCopilotServe(mode);
      return setState({
        state: missing ? "RuntimeMissing" : "RuntimeStarting",
        ready: false,
        canRepair: missing,
        canRetry: true,
        lastError: missing
          ? "Runtime service is not reachable. Use Repair to restore the Windows service."
          : "Runtime is not reachable yet. Desktop may start a local Serve in this mode.",
        lastErrorCode: "RUNTIME_UNAVAILABLE",
      });
    }

    try {
      const client = getSmcRuntimeClient(baseUrl);
      // Prefer contract-generated client for status / capabilities (Monorepo Phase 5).
      const status = (await client.getStatus()) as RuntimeStatus;
      const capabilities = (await client.getCapabilities()) as RuntimeCapabilities;
      setCachedCapabilities(toCapabilitiesView(capabilities as { apiVersion?: string; features?: string[] }));

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

      const degraded =
        status.status === "degraded" ||
        status.hermesInstalled === false ||
        (status.checks && Object.values(status.checks).some((v) => v !== "ok" && v !== "pass"));

      if (degraded) {
        return setState({
          state: "RuntimeDegraded",
          ready: false,
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
          lastError: "Runtime is reachable but degraded",
          lastErrorCode: "RUNTIME_UNAVAILABLE",
        });
      }

      return setState({
        state: "Ready",
        ready: true,
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
        if (code === "PAIRING_REQUIRED" || code === "DEVICE_REVOKED" || err.status === 401) {
          return setState({
            state: "PairingRequired",
            ready: false,
            paired: false,
            canPair: true,
            lastError: err.runtimeError.message,
            lastErrorCode: code,
          });
        }
        return setState({
          state: "RuntimeDegraded",
          ready: false,
          canRetry: true,
          canRepair: true,
          lastError: err.runtimeError.message,
          lastErrorCode: code,
        });
      }
      return setState({
        state: "RuntimeMissing",
        ready: false,
        canRepair: true,
        canRetry: true,
        lastError: err instanceof Error ? err.message : String(err),
        lastErrorCode: "RUNTIME_UNAVAILABLE",
      });
    }
  })().finally(() => {
    handshakeInFlight = null;
  });

  return handshakeInFlight;
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
      details: {
        capabilities: getCachedCapabilities(),
        state: currentState.state,
      },
    };
  }
}
