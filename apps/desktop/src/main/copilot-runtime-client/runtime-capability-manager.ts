import type { RuntimeCapabilitiesView } from "../../shared/copilot-runtime/runtime-capability-contract";
import type { RuntimeReadinessView } from "../../shared/copilot-runtime/runtime-readiness-contract";
import {
  REQUIRED_CHAT_FEATURES,
  REQUIRED_CORE_FEATURES,
  REQUIRED_MCP_FEATURES,
  REQUIRED_TASK_FEATURES,
} from "../../shared/copilot-runtime/runtime-capability-contract";
import { createDesktopRuntimeError } from "./runtime-error-mapper";
import type { DesktopRuntimeError } from "../../shared/copilot-runtime/runtime-error-contract";

let cachedCapabilities: RuntimeCapabilitiesView | null = null;
let cachedReadiness: RuntimeReadinessView | null = null;

export function setCachedCapabilities(view: RuntimeCapabilitiesView | null): void {
  cachedCapabilities = view;
}

export function getCachedCapabilities(): RuntimeCapabilitiesView | null {
  return cachedCapabilities;
}

/** PRD v1.4 — cache /runtime/readiness alongside capabilities (no legacy fallback). */
export function setCachedReadiness(view: RuntimeReadinessView | null): void {
  cachedReadiness = view;
}

export function getCachedReadiness(): RuntimeReadinessView | null {
  return cachedReadiness;
}

export function assertDomainReady(
  domain: "service" | "execution" | "maintenance" | "expertMcp",
): DesktopRuntimeError | null {
  if (!cachedReadiness) {
    return createDesktopRuntimeError(
      "RUNTIME_UNAVAILABLE",
      "Runtime readiness not loaded. Please update Runtime if this persists.",
      { retryable: true },
    );
  }
  const slice = cachedReadiness[domain];
  if (!slice?.ready) {
    return createDesktopRuntimeError(
      "RESOURCE_NOT_READY",
      `Runtime domain not ready: ${domain}. Please update Runtime or open Runtime & Agent.`,
      { details: { domain, checks: slice?.checks ?? {} }, retryable: true },
    );
  }
  return null;
}

export function toCapabilitiesView(raw: {
  apiVersion?: string;
  features?: string[];
}): RuntimeCapabilitiesView {
  const features = Array.isArray(raw.features) ? raw.features.map(String) : [];
  return {
    runtimeApiVersion: String(raw.apiVersion ?? ""),
    features: features.map((id) => ({ id, enabled: true })),
    featureIds: features,
    raw: { ...raw },
  };
}

export function hasFeature(featureId: string): boolean {
  const caps = cachedCapabilities;
  if (!caps) return false;
  return caps.featureIds.includes(featureId);
}

export function assertFeature(featureId: string): void {
  if (!hasFeature(featureId)) {
    const err = createDesktopRuntimeError(
      "RESOURCE_NOT_READY",
      `Runtime feature not available: ${featureId}`,
      { details: { featureId } },
    );
    throw Object.assign(new Error(err.message), { runtimeError: err });
  }
}

function missingFeatures(required: readonly string[]): string[] {
  return required.filter((f) => !hasFeature(f));
}

export function assertModuleFeatures(
  moduleName: "core" | "chat" | "task" | "mcp",
  required: readonly string[],
): DesktopRuntimeError | null {
  if (!cachedCapabilities) {
    return createDesktopRuntimeError(
      "RUNTIME_UNAVAILABLE",
      `Runtime capabilities not loaded for ${moduleName}`,
      { retryable: true },
    );
  }
  const missing = missingFeatures(required);
  if (missing.length > 0) {
    return createDesktopRuntimeError(
      "RUNTIME_INCOMPATIBLE",
      `Runtime missing required ${moduleName} features: ${missing.join(", ")}`,
      { details: { module: moduleName, missing } },
    );
  }
  return null;
}

/** Hard gate for Chat / Task / MCP writes when Runtime claims Ready. */
export function assertReadyForWrites(ready: boolean): DesktopRuntimeError | null {
  if (!ready) {
    return createDesktopRuntimeError(
      "RUNTIME_UNAVAILABLE",
      "Runtime is not Ready; Chat / Task / MCP writes are blocked",
      { retryable: true },
    );
  }
  return assertModuleFeatures("core", REQUIRED_CORE_FEATURES);
}

export function assertReadyForChat(ready: boolean): DesktopRuntimeError | null {
  const core = assertReadyForWrites(ready);
  if (core) return core;
  return assertModuleFeatures("chat", REQUIRED_CHAT_FEATURES);
}

export function assertReadyForTask(ready: boolean): DesktopRuntimeError | null {
  const core = assertReadyForWrites(ready);
  if (core) return core;
  return assertModuleFeatures("task", REQUIRED_TASK_FEATURES);
}

export function assertReadyForMcp(ready: boolean): DesktopRuntimeError | null {
  const core = assertReadyForWrites(ready);
  if (core) return core;
  return assertModuleFeatures("mcp", REQUIRED_MCP_FEATURES);
}
