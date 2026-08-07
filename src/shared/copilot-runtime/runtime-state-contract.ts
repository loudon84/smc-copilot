/** Shared runtime connection UI state (v9.0 Serve-First). */

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

export interface RuntimeConnectionState {
  state: RuntimeUiState;
  baseUrl: string;
  port: number;
  ready: boolean;
  paired: boolean;
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
    paired: false,
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
