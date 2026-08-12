/**
 * Hermes Gateway control owner mutex (PRD v2.0 / ADR-026).
 * Runtime and Salt must never both manage Gateway.
 *
 * - `direct` (default): probe/start Gateway locally via Hermes home (no Runtime :8765).
 * - `salt`: Availability probe only; Salt owns install/lifecycle.
 * - `runtime`: Copilot Runtime HTTP control plane (:8765) owns lifecycle.
 */

export type HermesControlOwner = "direct" | "salt" | "runtime";

export interface ControlOwnerSnapshot {
  owner: HermesControlOwner;
  source: "env" | "file" | "default";
  path?: string;
}
