export type {
  RuntimeUiState,
  RuntimeCompatibilityInfo,
  RuntimeConnectionState,
} from "./runtime-state-contract";
export { createInitialRuntimeConnectionState } from "./runtime-state-contract";

export type {
  RuntimeDomainReadinessView,
  RuntimeReadinessView,
} from "./runtime-readiness-contract";

export type {
  DesktopRuntimeError,
  DesktopRuntimeErrorCode,
} from "./runtime-error-contract";
export { isDesktopRuntimeError } from "./runtime-error-contract";

export type { ChatRunIdentity } from "./chat-run-identity";

export type {
  ServeChatEvent,
  ServeChatEventType,
  ServeChatCreateRunBody,
  ServeChatCreateTurnBody,
  ServeChatAcceptedResult,
  ServeChatInteractionRespondBody,
  ServeChatQueueEntry,
  ServeChatSnapshot,
} from "./chat-runtime-serve-contract";
export {
  normalizeServeChatEvent,
  mapServeChatEventToDraft,
  mapServeChatEventToRuntimeEvent,
  stampServeMappedEvent,
} from "./chat-runtime-serve-contract";

export type {
  RuntimeCapabilityFeature,
  RuntimeCapabilitiesView,
  RuntimeDiagnosticsSummary,
  RequiredRuntimeFeature,
} from "./runtime-capability-contract";
export {
  REQUIRED_RUNTIME_FEATURES,
  REQUIRED_CORE_FEATURES,
  REQUIRED_CHAT_FEATURES,
  REQUIRED_TASK_FEATURES,
  REQUIRED_MCP_FEATURES,
  WORK_TASK_V2_FEATURE,
} from "./runtime-capability-contract";

export type {
  ServeInstanceStatus,
  ServeInstanceSummary,
  ServeInstanceResolveResult,
  ServeInstanceHealth,
  ServeInstanceLogsResult,
  ServeSecretMeta,
  ServeMcpServerView,
  ServeModelConfigView,
  ServeModelOption,
} from "./instance-contract";
export { normalizeServeInstanceStatus } from "./instance-contract";

export type {
  ServeDiagnosticsEnvironment,
  ServeDiagnosticsLogsResult,
  ServeDiagnosticsBundleMeta,
} from "./diagnostics-contract";

/** Pairing IPC payloads (token / challenge never included). */
export interface RuntimePairingStartResult {
  pairingId: string;
  /** Display hint only — never the raw challenge secret. */
  code: string | null;
  expiresAt: string | null;
  message: string | null;
}

export interface RuntimePairingConfirmResult {
  ok: boolean;
  deviceId: string | null;
  message: string | null;
}

/** Atomic Main-owned pairing transaction (PRD v1.3.2). */
export interface RuntimePairAndConnectError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface RuntimePairAndConnectResult {
  ok: boolean;
  state: import("./runtime-state-contract").RuntimeConnectionState;
  deviceId: string | null;
  error: RuntimePairAndConnectError | null;
  /** Present when token could not be written to keytar/safeStorage. */
  persistence?: "secure" | "memory-only";
}

export interface RuntimeJobAcceptedView {
  jobId: string | null;
  status: string;
  message?: string | null;
}

export interface RuntimeJobView {
  jobId: string;
  status: string;
  jobType?: string;
  phase?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
}

export interface CopilotRuntimeAPI {
  getState: () => Promise<import("./runtime-state-contract").RuntimeConnectionState>;
  getCapabilities: () => Promise<
    import("./runtime-capability-contract").RuntimeCapabilitiesView | null
  >;
  getReadiness: () => Promise<import("./runtime-readiness-contract").RuntimeReadinessView | null>;
  getDiagnosticsSummary: () => Promise<
    import("./runtime-capability-contract").RuntimeDiagnosticsSummary | null
  >;
  startPairing: () => Promise<RuntimePairingStartResult>;
  confirmPairing: (pairingId: string) => Promise<RuntimePairingConfirmResult>;
  /** Preferred pairing entry — start+confirm+handshake in Main (PRD v1.3.2). */
  pairAndConnect: () => Promise<RuntimePairAndConnectResult>;
  retry: () => Promise<import("./runtime-state-contract").RuntimeConnectionState>;
  repair: () => Promise<{ ok: boolean; message: string | null }>;
  startRuntimeInstall: (
    body?: Record<string, unknown>,
  ) => Promise<RuntimeJobAcceptedView>;
  startRuntimeUpdate: (body?: Record<string, unknown>) => Promise<RuntimeJobAcceptedView>;
  startRuntimeRollback: (body?: Record<string, unknown>) => Promise<RuntimeJobAcceptedView>;
  startRuntimeDoctor: () => Promise<RuntimeJobAcceptedView>;
  getRuntimeJob: (jobId: string) => Promise<RuntimeJobView | null>;
  listRuntimeVersions: () => Promise<unknown[]>;
  /** True when Main routes Gateway/Config/MCP via Serve (not legacy Hermes CLI/YAML). */
  isServeControlPlane: () => Promise<boolean>;
  listInstances: () => Promise<import("./instance-contract").ServeInstanceSummary[]>;
  getInstance: (
    instanceId: string,
  ) => Promise<import("./instance-contract").ServeInstanceSummary | null>;
  resolveInstance: (
    ref: string,
  ) => Promise<import("./instance-contract").ServeInstanceResolveResult | null>;
  startInstance: (instanceId: string) => Promise<{ ok: boolean; message: string | null }>;
  stopInstance: (instanceId: string) => Promise<{ ok: boolean; message: string | null }>;
  restartInstance: (instanceId: string) => Promise<{ ok: boolean; message: string | null }>;
  getInstanceHealth: (
    instanceId: string,
  ) => Promise<import("./instance-contract").ServeInstanceHealth | null>;
  getInstanceLogs: (
    instanceId: string,
    options?: { tail?: number },
  ) => Promise<import("./instance-contract").ServeInstanceLogsResult | null>;
  getDiagnosticsEnvironment: () => Promise<
    import("./diagnostics-contract").ServeDiagnosticsEnvironment | null
  >;
  getDiagnosticsLogs: (options?: {
    tail?: number;
  }) => Promise<import("./diagnostics-contract").ServeDiagnosticsLogsResult | null>;
  exportDiagnosticsBundle: () => Promise<{ ok: boolean; path?: string; message?: string | null }>;
  getMemory: (instanceId: string) => Promise<unknown | null>;
  getSessionStats: (
    instanceId: string,
  ) => Promise<{ totalSessions: number; totalMessages: number } | null>;
  getExpertMcpStatus: () => Promise<Record<string, unknown> | null>;
  connectExpertMcp: () => Promise<Record<string, unknown> | null>;
  testExpertMcp: () => Promise<Record<string, unknown> | null>;
  getExpertMcpDiagnostics: () => Promise<Record<string, unknown> | null>;
  /**
   * Main-authenticated Serve JSON proxy. Renderer must not send Device Token.
   * Prefer domain-specific IPC in later phases; this bridges legacy Renderer Serve HTTP.
   */
  proxyFetch: (request: {
    path: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    unauthenticated?: boolean;
  }) => Promise<{
    ok: boolean;
    status: number | null;
    data: unknown;
    error: { code: string; message: string; retryable: boolean } | null;
  }>;
  onStateChanged: (
    callback: (state: import("./runtime-state-contract").RuntimeConnectionState) => void,
  ) => () => void;
}
