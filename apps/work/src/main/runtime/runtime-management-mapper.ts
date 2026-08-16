/**
 * Map Runtime HTTP responses ↔ Desktop hermesAPI runtime/gateway contract types.
 */
// @lat: [[runtime-connection#Runtime Management Mapper]]
import type {
  InstanceHealthResponse,
  RuntimeJobResponse,
  RuntimeReadiness,
  RuntimeStatus,
  RuntimeSseMessage,
  RuntimeVersionInfo,
} from "@smc/runtime-client";
import type {
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
  HermesRuntimeState,
} from "../../shared/runtime/runtime-contract";
import type { InstallProgress } from "../installer";
import {
  RUNTIME_ERROR_CODES,
  runtimeErrorMessage,
} from "./runtime-errors";
import { RUNTIME_SERVICE_ERROR_CODES } from "./runtime-service-errors";

export const DEFAULT_INSTANCE_NAME = "default";
export const DEFAULT_GATEWAY_ENDPOINT = "http://127.0.0.1:8642";

export interface ProfileInstanceResolution {
  supported: boolean;
  profile: string;
  instanceName: string;
  reason?: string;
}

/** v1.0: only default profile is Runtime-managed. */
export function resolveProfileToInstance(
  profile?: string,
): ProfileInstanceResolution {
  const normalized = (profile?.trim() || DEFAULT_INSTANCE_NAME).toLowerCase();
  if (normalized === "default") {
    return {
      supported: true,
      profile: "default",
      instanceName: DEFAULT_INSTANCE_NAME,
    };
  }
  return {
    supported: false,
    profile: normalized,
    instanceName: normalized,
    reason: `Local Runtime only supports the default profile (got "${normalized}").`,
  };
}

export function gatewayEndpointFromPort(port?: number | null): string {
  const p = port && port > 0 ? port : 8642;
  return `http://127.0.0.1:${p}`;
}

export function pickActiveVersion(
  versions: RuntimeVersionInfo[],
  status?: RuntimeStatus | null,
): string | undefined {
  if (status?.activeHermesVersion) return status.activeHermesVersion;
  const active = versions.find(
    (v) =>
      v.status === "active" ||
      v.status === "activated" ||
      Boolean(v.activatedAt),
  );
  return active?.version ?? versions[0]?.version;
}

export function mapReadinessToProbe(options: {
  profile: string;
  status: RuntimeStatus;
  readiness: RuntimeReadiness;
  health?: InstanceHealthResponse | null;
  version?: string;
}): HermesRuntimeProbe {
  const { profile, status, readiness, health, version } = options;
  const serviceReady = readiness.service?.ready === true;
  const hermesInstalled = status.hermesInstalled === true;
  const chatReady = readiness.execution?.chatReady === true;
  const executionReady = readiness.execution?.ready === true;
  // When /health was fetched with a wrong id (404), fall back to readiness
  // projection: gatewayApiState=healthy still means the port is serving.
  const executionReadiness = readiness.execution as
    | {
        defaultInstance?: { gatewayApiState?: string } | null;
      }
    | undefined;
  const defaultInstance = executionReadiness?.defaultInstance;
  const readinessGatewayApi = defaultInstance?.gatewayApiState === "healthy";
  const gatewayHealthy =
    health?.gateway?.healthy === true ||
    (chatReady && executionReady) ||
    (readinessGatewayApi && health?.gateway?.authenticated === true);
  const gatewayRunning =
    health?.process?.state === "running" ||
    health?.process?.state === "alive" ||
    health?.gateway?.reachable === true ||
    readinessGatewayApi ||
    gatewayHealthy;
  const authenticated =
    health?.gateway?.authenticated === true || gatewayHealthy;
  const port = health?.gateway?.port;
  const endpoint = gatewayEndpointFromPort(
    typeof port === "number" ? port : undefined,
  );

  const base = {
    mode: "local" as const,
    profile,
    homePath: status.hermesHome ?? undefined,
    executablePath: undefined as string | undefined,
    endpoint,
    runtimeFound: hermesInstalled || serviceReady,
    cliAvailable: hermesInstalled,
    gatewayRunning,
    gatewayHealthy,
    authenticated,
    version: version ?? status.activeHermesVersion ?? undefined,
    probedAt: Date.now(),
  };

  if (!serviceReady) {
    return failProbe(
      base,
      "gateway_unreachable",
      RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
      "Copilot Runtime service is not ready.",
    );
  }
  if (!hermesInstalled) {
    return failProbe(
      base,
      "runtime_missing",
      RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND,
    );
  }
  if (!gatewayRunning) {
    return failProbe(
      base,
      "gateway_stopped",
      RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
    );
  }
  if (!gatewayHealthy) {
    return failProbe(
      base,
      "gateway_unreachable",
      RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
    );
  }
  if (!authenticated) {
    return failProbe(
      base,
      "gateway_auth_failed",
      RUNTIME_ERROR_CODES.GATEWAY_AUTH_FAILED,
    );
  }
  return { ...base, state: "ready" };
}

function failProbe(
  base: Omit<
    HermesRuntimeProbe,
    "state" | "errorCode" | "errorMessage" | "probedAt"
  > & { probedAt?: number },
  state: HermesRuntimeState,
  code: string,
  message?: string,
): HermesRuntimeProbe {
  return {
    ...base,
    state,
    errorCode: code,
    errorMessage: message ?? runtimeErrorMessage(code as never),
    probedAt: Date.now(),
  };
}

export function resultFromProbe(
  probe: HermesRuntimeProbe,
): HermesRuntimeConnectionResult {
  return {
    ok: probe.state === "ready",
    state: probe.state,
    profile: probe.profile,
    endpoint: probe.endpoint,
    version: probe.version,
    errorCode: probe.errorCode,
    errorMessage: probe.errorMessage,
  };
}

export function unsupportedProfileResult(
  profile: string,
): HermesRuntimeConnectionResult {
  return {
    ok: false,
    state: "configuration_error",
    profile,
    endpoint: DEFAULT_GATEWAY_ENDPOINT,
    errorCode: RUNTIME_SERVICE_ERROR_CODES.RUNTIME_PROFILE_UNSUPPORTED,
    errorMessage: `Local Runtime only supports the default profile (got "${profile}").`,
  };
}

export function serviceUnavailableProbe(
  profile = "default",
): HermesRuntimeProbe {
  return {
    mode: "local",
    state: "gateway_unreachable",
    profile,
    endpoint: DEFAULT_GATEWAY_ENDPOINT,
    runtimeFound: false,
    cliAvailable: false,
    gatewayRunning: false,
    gatewayHealthy: false,
    authenticated: false,
    errorCode: RUNTIME_SERVICE_ERROR_CODES.RUNTIME_SERVICE_UNAVAILABLE,
    errorMessage:
      "Copilot Runtime service is unavailable. Ensure the Runtime daemon is running on port 8765.",
    probedAt: Date.now(),
  };
}

/** Convert Runtime job SSE events into legacy install-progress payloads. */
export function mapJobEventToInstallProgress(
  message: RuntimeSseMessage,
  job?: RuntimeJobResponse | null,
): InstallProgress {
  let payload: Record<string, unknown> = {};
  if (message.data) {
    try {
      payload = JSON.parse(message.data) as Record<string, unknown>;
    } catch {
      payload = { message: message.data };
    }
  }
  const eventName = String(payload.event ?? message.event ?? "job.progress");
  const progressRaw = job?.progress;
  const progress =
    typeof progressRaw === "number"
      ? progressRaw
      : typeof payload.progress === "number"
        ? payload.progress
        : 0;
  const step = Math.max(1, Math.min(100, Math.round(progress * 100) || 1));
  const title =
    typeof payload.message === "string"
      ? payload.message
      : eventName.replace(/^job\./, "").replace(/_/g, " ");
  const detail =
    typeof payload.phase === "string"
      ? String(payload.phase)
      : (job?.phase ?? eventName);
  const logLine =
    typeof payload.message === "string"
      ? `${payload.message}\n`
      : `${eventName}\n`;
  return {
    step,
    totalSteps: 100,
    title,
    detail,
    log: logLine,
  };
}

export function isJobTerminal(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "succeeded" || s === "failed" || s === "cancelled" || s === "completed";
}
