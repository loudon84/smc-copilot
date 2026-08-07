import type { RuntimeCapabilitiesView } from "../../shared/copilot-runtime/runtime-capability-contract";
import { REQUIRED_RUNTIME_FEATURES } from "../../shared/copilot-runtime/runtime-capability-contract";
import { createDesktopRuntimeError } from "./runtime-error-mapper";
import type { DesktopRuntimeError } from "../../shared/copilot-runtime/runtime-error-contract";

let cachedCapabilities: RuntimeCapabilitiesView | null = null;

export function setCachedCapabilities(view: RuntimeCapabilitiesView | null): void {
  cachedCapabilities = view;
}

export function getCachedCapabilities(): RuntimeCapabilitiesView | null {
  return cachedCapabilities;
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

export function assertReadyForWrites(ready: boolean): DesktopRuntimeError | null {
  if (!ready) {
    return createDesktopRuntimeError(
      "RUNTIME_UNAVAILABLE",
      "Runtime is not Ready; Chat / Task / MCP writes are blocked",
      { retryable: true },
    );
  }
  const missing = REQUIRED_RUNTIME_FEATURES.filter((f) => !hasFeature(f));
  // Soft check: Serve may expose features under different names; only hard-fail when
  // capabilities were loaded and explicitly empty.
  if (cachedCapabilities && cachedCapabilities.featureIds.length === 0) {
    return createDesktopRuntimeError(
      "RUNTIME_INCOMPATIBLE",
      "Runtime capabilities empty",
      { details: { missing: [...missing] } },
    );
  }
  return null;
}
