/**
 * Read Hermes control owner from env or %ProgramData%\\SMC\\control-owner.json.
 * Returns observed + effective (ADR-038 / PRD A-OWNER-001).
 */
// @lat: [[runtime-connection#Direct Hermes Mode]]
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  HermesControlOwner,
  ControlOwnerSnapshot,
} from "../../shared/runtime/control-owner";
import {
  effectiveControlOwner,
  isExternallyManagedEffective,
  isExternallyManagedOwner,
} from "../../shared/runtime/control-owner";

const VALID_OWNERS = new Set<HermesControlOwner>([
  "direct",
  "salt",
  "opsi",
  "runtime",
]);

export function defaultControlOwnerPath(): string {
  const override = process.env.SMC_CONTROL_OWNER_PATH?.trim();
  if (override) return override;
  if (process.platform === "win32") {
    const programData = process.env.ProgramData || "C:\\ProgramData";
    return join(programData, "SMC", "control-owner.json");
  }
  return "/etc/smc/control-owner.json";
}

function parseOwner(raw: string | undefined): HermesControlOwner | null {
  const value = raw?.trim().toLowerCase();
  if (
    value === "direct" ||
    value === "salt" ||
    value === "opsi" ||
    value === "runtime"
  ) {
    return value;
  }
  return null;
}

function snapshotFrom(
  observed: HermesControlOwner,
  source: ControlOwnerSnapshot["source"],
  path?: string,
): ControlOwnerSnapshot {
  const effective = effectiveControlOwner(observed);
  return {
    observed,
    effective,
    owner: observed,
    source,
    path,
  };
}

export function readControlOwnerSnapshot(): ControlOwnerSnapshot {
  const envOwner = parseOwner(process.env.SMC_HERMES_CONTROL_OWNER);
  if (envOwner) {
    return snapshotFrom(envOwner, "env");
  }
  const path = defaultControlOwnerPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
        hermes?: unknown;
      };
      const fileOwner = parseOwner(
        typeof parsed.hermes === "string" ? parsed.hermes : undefined,
      );
      if (fileOwner) {
        return snapshotFrom(fileOwner, "file", path);
      }
    } catch {
      /* fall through to default */
    }
  }
  // Work default: connect Gateway directly (8642), not Runtime :8765.
  return snapshotFrom("direct", "default", path);
}

/** Observed control owner (env/file/default). Prefer getEffectiveControlOwner for gates. */
export function getHermesControlOwner(): HermesControlOwner {
  return readControlOwnerSnapshot().observed;
}

export function getEffectiveControlOwner(): HermesControlOwner {
  return readControlOwnerSnapshot().effective;
}

export function isSaltControlOwner(): boolean {
  return getHermesControlOwner() === "salt";
}

export function isOpsiControlOwner(): boolean {
  return getHermesControlOwner() === "opsi";
}

/**
 * Production gate: uses **effective** owner so observed opsi/salt do not block
 * Doctor/Update/Gateway (A-OWNER-001).
 */
export function isExternallyManagedControlOwner(): boolean {
  return isExternallyManagedEffective(getEffectiveControlOwner());
}

export function isRuntimeControlOwner(): boolean {
  return getEffectiveControlOwner() === "runtime";
}

export function isDirectControlOwner(): boolean {
  return getEffectiveControlOwner() === "direct";
}

export function saltManagedMessage(action: string): string {
  return `Hermes is managed by Salt (${action} is not available in enterprise mode). Wait for Salt install or recovery.`;
}

export function externallyManagedMessage(action: string): string {
  const owner = getHermesControlOwner();
  switch (owner) {
    case "salt":
      return saltManagedMessage(action);
    case "opsi":
      return `Managed by organization / Provider: OPSI. ${action} is not available in this app. Wait for enterprise recovery.`;
    case "direct":
    case "runtime":
      return `Hermes is managed by the organization. ${action} is not available.`;
    default: {
      const _exhaustive: never = owner;
      return `Hermes is managed by the organization (${_exhaustive}). ${action} is not available.`;
    }
  }
}

export function externallyManagedErrorCode(): "SALT_MANAGED" | "EXTERNALLY_MANAGED" {
  return isSaltControlOwner() ? "SALT_MANAGED" : "EXTERNALLY_MANAGED";
}

export function assertOwner(
  owner: HermesControlOwner,
): asserts owner is HermesControlOwner {
  if (!VALID_OWNERS.has(owner)) {
    const _exhaustive: never = owner as never;
    throw new Error(`Invalid Hermes control owner: ${_exhaustive}`);
  }
}

/** Re-export for callers that still check observed values explicitly. */
export { isExternallyManagedOwner, effectiveControlOwner };
