/**
 * Serve vs legacy Hermes control-plane routing (PRD §26 / Phase 2).
 * Avoids circular import: connection-manager → runtime-mode only.
 */
import { getRuntimeConnectionState } from "./runtime-connection-manager";
import { isLegacyHermesDirectAllowed } from "./runtime-mode";

/**
 * When true, Desktop MUST route Instance/Config/MCP/Diagnostics through Serve
 * and MUST NOT spawn Gateway CLI or write Hermes YAML as control plane.
 * Legacy path only when COPILOT_ALLOW_LEGACY_HERMES_DIRECT (non-production).
 */
export function isServeControlPlaneEnabled(): boolean {
  return !isLegacyHermesDirectAllowed();
}

/** True when Serve CP is selected and handshake reached Ready. */
export function isServeControlPlaneReady(): boolean {
  if (!isServeControlPlaneEnabled()) return false;
  const state = getRuntimeConnectionState();
  return state.ready && state.state === "Ready";
}
