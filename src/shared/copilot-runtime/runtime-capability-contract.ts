/** Capability / compatibility view models for Serve Runtime handshake. */

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

/** Features Desktop requires before Ready for Chat/Task/MCP writes. */
export const REQUIRED_RUNTIME_FEATURES = [
  "instances",
  "pairings",
  "runtime",
] as const;

export type RequiredRuntimeFeature = (typeof REQUIRED_RUNTIME_FEATURES)[number];
