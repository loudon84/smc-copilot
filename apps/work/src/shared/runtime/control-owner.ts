/**
 * Hermes Gateway control owner mutex (PRD v2.0 / ADR-026 / ADR-031).
 * Runtime, Salt, and OPSI must never both manage Gateway.
 *
 * - `direct` (default): probe/start Gateway locally via Hermes home (no Runtime :8765).
 * - `salt`: Availability probe only; Salt owns install/lifecycle.
 * - `opsi`: Availability probe only; OPSI owns install/lifecycle.
 * - `runtime`: Copilot Runtime HTTP control plane (:8765) owns lifecycle.
 */

export type HermesControlOwner = "direct" | "salt" | "opsi" | "runtime";

export interface ControlOwnerSnapshot {
  owner: HermesControlOwner;
  source: "env" | "file" | "default";
  path?: string;
}

export function isExternallyManagedOwner(owner: HermesControlOwner): boolean {
  return owner === "salt" || owner === "opsi";
}
