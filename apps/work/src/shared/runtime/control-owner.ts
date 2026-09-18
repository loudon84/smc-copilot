/**
 * Hermes Gateway control owner mutex (PRD v2.1.1 / ADR-038).
 *
 * Production Native mode: observed may still be `opsi`/`salt` from enterprise
 * Bootstrap files, but **effective** is always `direct` so Work owns local
 * Gateway lifecycle via Native Hermes CLI.
 *
 * - `direct` (default): probe/start Gateway locally via Hermes home.
 * - `salt` / `opsi` (observed only): enterprise marker; effective → `direct`.
 * - `runtime`: Copilot Runtime HTTP control plane (:8765) owns lifecycle (lab).
 */

export type HermesControlOwner = "direct" | "salt" | "opsi" | "runtime";

export interface ControlOwnerSnapshot {
  /** Owner read from env / control-owner.json / default. */
  observed: HermesControlOwner;
  /** Owner used for production gates (Update/Doctor/Gateway). */
  effective: HermesControlOwner;
  source: "env" | "file" | "default";
  path?: string;
  /**
   * @deprecated Use `observed`. Kept as alias for observed during transition.
   * Gates must use `effective`.
   */
  owner: HermesControlOwner;
}

/**
 * Map observed enterprise markers to production-effective ownership.
 * `opsi`/`salt` → `direct`; `runtime` stays lab Runtime control; `direct` stays.
 */
export function effectiveControlOwner(
  observed: HermesControlOwner,
): HermesControlOwner {
  if (observed === "opsi" || observed === "salt") return "direct";
  return observed;
}

/**
 * @deprecated Prefer `isExternallyManagedEffective`. Production effective never
 * treats opsi/salt as external after ADR-038.
 */
export function isExternallyManagedOwner(owner: HermesControlOwner): boolean {
  return owner === "salt" || owner === "opsi";
}

/** True when effective owner still blocks local install/lifecycle IPC. */
export function isExternallyManagedEffective(
  effective: HermesControlOwner,
): boolean {
  return effective === "salt" || effective === "opsi";
}
