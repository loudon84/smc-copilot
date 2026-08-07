/**
 * Gateway control-plane bridge (Phase 2).
 * Prefer Serve Instance APIs; fail closed when Serve preferred but not Ready.
 * Legacy Hermes CLI only when COPILOT_ALLOW_LEGACY_HERMES_DIRECT is set.
 */
import { getRuntimeConnectionState } from "../copilot-runtime-client/runtime-connection-manager";
import {
  isServeControlPlaneEnabled,
  isServeControlPlanePreferred,
} from "../copilot-runtime-client/runtime-mode";
import { ServeInstanceAdapter } from "./ServeInstanceAdapter";

export type GatewayControlMode = "serve" | "legacy" | "blocked";

// @lat: [[domain/serve-runtime#Phase 2 Gateway and config control plane]]
export function resolveGatewayControlMode(): GatewayControlMode {
  if (!isServeControlPlanePreferred()) return "legacy";
  if (isServeControlPlaneEnabled(getRuntimeConnectionState().ready)) return "serve";
  return "blocked";
}

export async function serveStartGateway(profileRef?: string): Promise<boolean> {
  const result = await ServeInstanceAdapter.start(profileRef || "default");
  if (!result.ok) {
    console.error("[gateway-control] Serve start failed:", result.message);
  }
  return result.ok;
}

export async function serveStopGateway(profileRef?: string): Promise<boolean> {
  const result = await ServeInstanceAdapter.stop(profileRef || "default");
  if (!result.ok) {
    console.error("[gateway-control] Serve stop failed:", result.message);
  }
  return result.ok;
}

export async function serveRestartGateway(profileRef?: string): Promise<boolean> {
  const result = await ServeInstanceAdapter.restart(profileRef || "default");
  if (!result.ok) {
    console.error("[gateway-control] Serve restart failed:", result.message);
  }
  return result.ok;
}

export function blockedGatewayMessage(): string {
  return "Serve Runtime is not Ready. Gateway CLI is blocked (Serve control plane). Pair/retry Runtime first, or set COPILOT_ALLOW_LEGACY_HERMES_DIRECT=true for local legacy only.";
}
