/** Shared runtime connection UI state (v9.0 Serve-First / PRD v1.5.4). */

export type RuntimeUiState =
  | "Connecting"
  | "PairingRequired"
  | "Incompatible"
  | "RuntimeMissing"
  | "RuntimeStarting"
  | "RuntimeDegraded"
  | "Ready";

export interface RuntimeCompatibilityInfo {
  compatible: boolean;
  runtimeApiVersion: string | null;
  desktopApiVersion: string;
  reasons: string[];
}

/**
 * Structured Runtime health probe result (PRD v1.5.4 §27–28).
 */
export interface RuntimeHealthProbeResult {
  reachable: boolean;
  url: string;
  httpStatus?: number;
  serviceStatus?: string;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface RuntimeConnectionState {
  state: RuntimeUiState;
  baseUrl: string;
  port: number;
  /**
   * Legacy Ready flag — equals ``serviceReady`` (PRD v1.5.4 §52).
   * Chat transport must use ``chatReady``, not this field alone.
   */
  ready: boolean;
  /** Runtime HTTP health reachable (probe). */
  reachable: boolean;
  paired: boolean;
  /** readiness.service.ready */
  serviceReady: boolean;
  /** readiness.execution.ready */
  executionReady: boolean;
  /** readiness.execution.chatReady */
  chatReady: boolean;
  /** readiness.maintenance.ready — must not block Chat */
  maintenanceReady: boolean;
  /** Device id when paired; never includes token. */
  deviceId: string | null;
  runtimeVersion: string | null;
  runtimeApiVersion: string | null;
  hermesVersion: string | null;
  compatibility: RuntimeCompatibilityInfo | null;
  lastError: string | null;
  lastErrorCode: string | null;
  canRetry: boolean;
  canRepair: boolean;
  canPair: boolean;
  updatedAt: string;
}

export function createInitialRuntimeConnectionState(
  overrides?: Partial<RuntimeConnectionState>,
): RuntimeConnectionState {
  return {
    state: "Connecting",
    baseUrl: "http://127.0.0.1:8765",
    port: 8765,
    ready: false,
    reachable: false,
    paired: false,
    serviceReady: false,
    executionReady: false,
    chatReady: false,
    maintenanceReady: false,
    deviceId: null,
    runtimeVersion: null,
    runtimeApiVersion: null,
    hermesVersion: null,
    compatibility: null,
    lastError: null,
    lastErrorCode: null,
    canRetry: true,
    canRepair: false,
    canPair: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
