/**
 * Startup decision — RuntimeConnectionState SOT (PRD v1.3.1).
 * Does NOT read ~/.hermes/desktop.json, probe Hermes gateway ports, or verify Hermes install.
 */
import { readAuthEndpointConfig } from "../auth/auth-endpoint-config-store";
import { hydrateTokenStore, readStoredSession } from "../auth/token-store";
import { readBootstrapState } from "../user-config/user-config-store";
import type { RuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import type {
  StartupDecision,
  StartupDecisionReason,
} from "../../shared/startup/startup-contract";

function authRequired(): StartupDecision {
  return {
    nextScreen: "login",
    reason: "auth-required",
    runtimeState: null,
  };
}

function bootstrapPending(): StartupDecision {
  return {
    nextScreen: "login",
    reason: "bootstrap-pending",
    runtimeState: null,
  };
}

function mapRuntimeToDecision(runtime: RuntimeConnectionState): StartupDecision {
  switch (runtime.state) {
    case "Ready":
      return {
        nextScreen: "main",
        reason: "runtime-ready",
        runtimeState: runtime,
      };
    case "RuntimeDegraded":
      // Enter main with degraded banner / capability gates — never Install screen.
      return {
        nextScreen: "main",
        reason: "runtime-degraded",
        runtimeState: runtime,
      };
    case "PairingRequired":
      return {
        nextScreen: "runtime-pairing",
        reason: "pairing-required",
        runtimeState: runtime,
      };
    case "RuntimeMissing":
      return {
        nextScreen: "runtime-recovery",
        reason: "runtime-missing",
        runtimeState: runtime,
        error: runtime.lastError ?? "Runtime Service unavailable",
      };
    case "Incompatible":
      return {
        nextScreen: "runtime-recovery",
        reason: "runtime-incompatible",
        runtimeState: runtime,
        error: runtime.lastError ?? "Desktop / Runtime version mismatch",
      };
    case "Connecting":
    case "RuntimeStarting":
      return {
        nextScreen: "runtime-recovery",
        reason: "runtime-starting",
        runtimeState: runtime,
      };
    default: {
      const _exhaustive: never = runtime.state;
      return {
        nextScreen: "runtime-recovery",
        reason: "runtime-missing",
        runtimeState: runtime,
        error: `Unknown runtime state: ${String(_exhaustive)}`,
      };
    }
  }
}

/**
 * Core decision given an already-resolved RuntimeConnectionState.
 * Auth + bootstrap gates run first.
 */
export async function resolveStartupDecisionFromRuntime(
  runtime: RuntimeConnectionState,
): Promise<StartupDecision> {
  await hydrateTokenStore();
  const endpointConfig = readAuthEndpointConfig();
  const session = await readStoredSession();
  if (!endpointConfig || !session?.accessToken) {
    return authRequired();
  }

  const bootstrap = readBootstrapState();
  if (!bootstrap.initialized) {
    return bootstrapPending();
  }

  return mapRuntimeToDecision(runtime);
}

/** @deprecated Prefer desktopBootCoordinator.resolveStartupDecision */
export async function resolveStartupDecision(): Promise<StartupDecision> {
  const { desktopBootCoordinator } = await import("./desktop-boot-coordinator");
  return desktopBootCoordinator.resolveStartupDecision();
}

export type { StartupDecisionReason };
