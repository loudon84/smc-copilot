/** Capability / compatibility view models for Serve Runtime handshake (PRD v1.1 §13). */

export interface RuntimeCapabilityFeature {
  id: string;
  enabled: boolean;
  version?: string | null;
}

export interface RuntimeCapabilitiesView {
  runtimeApiVersion: string;
  features: RuntimeCapabilityFeature[];
  featureIds: string[];
  raw: Record<string, unknown> | null;
}

export interface RuntimeDiagnosticsSummary {
  runtimeVersion: string | null;
  runtimeApiVersion: string | null;
  hermesVersion: string | null;
  instanceCount: number | null;
  activeTasks: number | null;
  approvalCount: number | null;
  storeHealthy: boolean | null;
  details: Record<string, unknown> | null;
}

/** Core features required before Ready (pairing / multi-instance control plane). */
export const REQUIRED_CORE_FEATURES = [
  "pairing.device",
  "instances.multiple",
] as const;

/** Chat module write path (enforced when Serve Chat transport is active). */
export const REQUIRED_CHAT_FEATURES = ["chat.runtime.v2"] as const;

/** Task module write path. */
export const REQUIRED_TASK_FEATURES = [
  "tasks.local-control-plane",
  "tasks.event-store",
] as const;

/** MCP module write path. */
export const REQUIRED_MCP_FEATURES = ["mcp.crud"] as const;

/** @deprecated Use REQUIRED_CORE_FEATURES */
export const REQUIRED_RUNTIME_FEATURES = REQUIRED_CORE_FEATURES;

export type RequiredRuntimeFeature = (typeof REQUIRED_CORE_FEATURES)[number];
