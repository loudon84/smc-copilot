import type { RuntimeConnectionState } from "../copilot-runtime/runtime-state-contract";

/**
 * Startup Gate contract (PRD v1.3.1).
 * Auth + User Bootstrap + RuntimeConnectionState — never Hermes install/gateway ports.
 */

/** Business screens after splash (splash is transitional only). */
export type StartupScreen = "login" | "runtime-recovery" | "main";

export type StartupDecisionReason =
  | "auth-required"
  | "bootstrap-pending"
  | "runtime-ready"
  | "runtime-starting"
  | "runtime-missing"
  | "runtime-degraded"
  | "runtime-incompatible"
  | "pairing-required";

/**
 * Startup decision from Main BootCoordinator — sole Renderer route input.
 */
export interface StartupDecision {
  nextScreen: StartupScreen;
  reason: StartupDecisionReason;
  runtimeState: RuntimeConnectionState | null;
  error?: string;
}
