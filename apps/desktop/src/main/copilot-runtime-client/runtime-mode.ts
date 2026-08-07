/**
 * Desktop runtime process policy (PRD §6.1 / §26).
 * Production must never spawn/stop Serve; only probe and Repair.
 *
 * Product / API versions come from generated build-info (PRD v1.1 §12.1).
 */

import {
  DESKTOP_VERSION,
  RUNTIME_API_VERSION,
} from "../../shared/generated/build-info";

export type CopilotRuntimeMode = "development" | "portable_dev" | "e2e" | "production";

export { DESKTOP_VERSION };
/** @deprecated Prefer RUNTIME_API_VERSION from build-info; kept for existing imports. */
export const DESKTOP_RUNTIME_API_VERSION = RUNTIME_API_VERSION;
export { RUNTIME_API_VERSION };
export const DEFAULT_SERVE_PORT = 8765;
export const DEFAULT_SERVE_BASE_URL = `http://127.0.0.1:${DEFAULT_SERVE_PORT}`;

export function resolveCopilotRuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): CopilotRuntimeMode {
  const explicit = env.COPILOT_RUNTIME_MODE?.trim().toLowerCase();
  if (
    explicit === "development" ||
    explicit === "portable_dev" ||
    explicit === "e2e" ||
    explicit === "production"
  ) {
    return explicit;
  }
  if (env.COPILOT_E2E === "1" || env.COPILOT_E2E === "true") {
    return "e2e";
  }
  if (env.COPILOT_PORTABLE_DEV === "1" || env.COPILOT_PORTABLE_DEV === "true") {
    return "portable_dev";
  }
  // Electron packaged apps set app.isPackaged; callers may pass ELECTRON_IS_PACKAGED=1.
  if (env.ELECTRON_IS_PACKAGED === "1" || env.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

export function canSpawnCopilotServe(mode: CopilotRuntimeMode = resolveCopilotRuntimeMode()): boolean {
  return mode === "development" || mode === "portable_dev" || mode === "e2e";
}

export function canStopCopilotServe(mode: CopilotRuntimeMode = resolveCopilotRuntimeMode()): boolean {
  return canSpawnCopilotServe(mode);
}

/**
 * Production packaging must force false.
 * Dev may opt in with COPILOT_ALLOW_LEGACY_HERMES_DIRECT=true.
 */
export function isLegacyHermesDirectAllowed(
  env: NodeJS.ProcessEnv = process.env,
  mode: CopilotRuntimeMode = resolveCopilotRuntimeMode(env),
): boolean {
  if (mode === "production") {
    return false;
  }
  const flag = env.COPILOT_ALLOW_LEGACY_HERMES_DIRECT?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/**
 * Prefer Serve as the control plane unless explicitly legacy-direct.
 * When preferred but Runtime is not Ready, call sites must fail closed
 * (no Hermes CLI / YAML writes) rather than auto-fallback.
 */
export function isServeControlPlanePreferred(
  env: NodeJS.ProcessEnv = process.env,
  mode: CopilotRuntimeMode = resolveCopilotRuntimeMode(env),
): boolean {
  return !isLegacyHermesDirectAllowed(env, mode);
}

/**
 * Live Serve control plane (PRD §26 runtime.controlPlane=serve).
 * True when runtime connection is Ready and legacy Hermes direct is not opted in.
 * Pass `runtimeReady` from connection manager.
 */
export function isServeControlPlaneEnabled(
  runtimeReady: boolean,
  env: NodeJS.ProcessEnv = process.env,
  mode: CopilotRuntimeMode = resolveCopilotRuntimeMode(env),
): boolean {
  return isServeControlPlanePreferred(env, mode) && runtimeReady;
}

/**
 * Prefer Serve Chat Runtime transport (PRD §26 chat.transport=serve).
 * Same escape hatch as control plane: legacy Hermes direct (non-production only).
 */
// @lat: [[domain/serve-runtime#Phase 3 Chat Runtime transport]]
export function isServeChatTransportPreferred(
  env: NodeJS.ProcessEnv = process.env,
  mode: CopilotRuntimeMode = resolveCopilotRuntimeMode(env),
): boolean {
  return !isLegacyHermesDirectAllowed(env, mode);
}

/**
 * Live Serve Chat transport. When preferred but not Ready, Chat must fail closed
 * (no Hermes sendMessage fallback).
 */
export function isServeChatTransportEnabled(
  runtimeReady: boolean,
  env: NodeJS.ProcessEnv = process.env,
  mode: CopilotRuntimeMode = resolveCopilotRuntimeMode(env),
): boolean {
  return isServeChatTransportPreferred(env, mode) && runtimeReady;
}

export function resolveServeBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.COPILOT_SERVE_URL?.trim() || env.COPILOT_RUNTIME_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const portRaw = env.COPILOT_SERVE_PORT?.trim();
  const port = portRaw && /^\d+$/.test(portRaw) ? Number(portRaw) : DEFAULT_SERVE_PORT;
  return `http://127.0.0.1:${port}`;
}
