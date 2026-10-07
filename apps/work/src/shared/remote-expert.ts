/**
 * Unique Consumer pin: REMOTE-EXPERT-FRONTEND-CONTRACT v2.1.0 (Provider FROZEN).
 * Digests from contracts/remote-expert-frontend/v2.1.0/ (G4 freeze SHA256SUMS).
 * RUNTIME_CONTRACT_DIGEST is observational only — never fail-closed on it alone.
 */
export const REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION = "2.1.0" as const;
export const REMOTE_EXPERT_PIN_FINALIZATION_STATUS = "PINNED_V2_1_0" as const;
export const FRONTEND_CONTRACT_DIGEST =
  "b25a9edbf2fa5afd6f15cb1cc1f8b17d6cb63b613bf18a2212e75002c61b4aba";
export const CATALOG_CONTRACT_VERSION = "1.1.0" as const;
export const CATALOG_CONTRACT_DIGEST =
  "d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c";
export const REMOTE_ACP_CONTRACT_VERSION = "1.1.0" as const;
export const REMOTE_ACP_CONTRACT_DIGEST =
  "86668a0a013ca3aef08f11611c6c32cb7643918caf21f5d530049b0d0a1a28be";
/** Observational only — must not enter listDiscoveryMismatches fail-closed set. */
export const RUNTIME_CONTRACT_DIGEST =
  "0c796f63391a5585f7a57318d7b202eb57a65039ee27555adabefce53287e17a";
export const ACP_PROTOCOL_VERSION = 1 as const;
export const TRANSPORT_PROFILE = "nodeskclaw.remote-acp.v1" as const;
export const PROVIDER_TAG = "remote-expert-frontend-contract-v2.1.0" as const;
export const PROVIDER_TAG_TARGET =
  "9982d57510581cb3e1bc4b45b59eac11c99b3a52" as const;
export const FRONTEND_BUNDLE_DIGEST =
  "aa2e1671c6bb1d4c5e8fc5c5c13886fdd94224644b44b3f1c714b04b4ff7e02d";

export const REMOTE_EXPERT_EXECUTION_PROVIDER = "remote-expert-acp" as const;
export const REMOTE_EXPERT_CHAT_MODE = "remote-expert" as const;
export const REMOTE_EXPERT_TURN_KIND = "remote-expert" as const;

export const ATTACHMENT_REF_RE = /^att_[A-Za-z0-9_-]+$/;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REMOTE_EXPERT_ERROR_CODES = [
  "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
  "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
  "REMOTE_EXPERT_AUTH_REQUIRED",
  "REMOTE_EXPERT_FORBIDDEN",
  "REMOTE_EXPERT_CATALOG_UNAVAILABLE",
  "REMOTE_EXPERT_CATALOG_INVALID",
  "REMOTE_ACP_AUTH_REQUIRED",
  "REMOTE_ACP_ORG_FORBIDDEN",
  "REMOTE_ACP_EXPERT_NOT_FOUND",
  "REMOTE_ACP_EXPERT_FORBIDDEN",
  "REMOTE_ACP_EXPERT_UNAVAILABLE",
  "REMOTE_ACP_RUNTIME_UNAVAILABLE",
  "REMOTE_ACP_ROUTE_FAILED",
  "REMOTE_ACP_TRANSPORT_UNSUPPORTED",
  "REMOTE_ACP_CONTRACT_MISMATCH",
  "ACP_INITIALIZE_FAILED",
  "REMOTE_EXPERT_SESSION_CREATE_FAILED",
  "REMOTE_EXPERT_SESSION_CLOSE_FAILED",
  "REMOTE_EXPERT_PROMPT_REJECTED",
  "REMOTE_EXPERT_PROMPT_FAILED",
  "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
  "REMOTE_EXPERT_SESSION_LOST",
  "REMOTE_EXPERT_UNAVAILABLE",
  "REMOTE_EXPERT_NOT_FOUND",
  "REMOTE_EXPERT_PROJECTION_PERSIST_FAILED",
  "REMOTE_EXPERT_AUTH_GENERATION_CHANGED",
  "REMOTE_EXPERT_ORG_CHANGED",
  "REMOTE_EXPERT_PERMISSION_STALE",
  "REMOTE_EXPERT_LEGACY_PATH_PRESENT",
  "REMOTE_EXPERT_DUAL_PATH",
  "SMC_BASELINE_CONFLICT",
  "SPEC_SEMANTIC_GAP",
  "REMOTE_EXPERT_ORG_REQUIRED",
  "REMOTE_EXPERT_RESOURCE_DENIED",
  "CROSS_ORIGIN_REJECTED",
  "REMOTE_EXPERT_CREDENTIAL_LEAK_GUARD",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_TYPE_UNSUPPORTED",
  "ATTACHMENT_SCAN_BLOCKED",
  "ATTACHMENT_REF_INVALID",
  "ATTACHMENT_NOT_FOUND",
  "ATTACHMENT_SCOPE_DENIED",
  "ATTACHMENT_EXPIRED",
  "REMOTE_ATTACHMENT_LOCAL_READ_FAILED",
  "FILE_REMOTE_FORBIDDEN",
  "ARTIFACT_ACCESS_DENIED",
  "FILE_REMOTE_NOT_FOUND",
  "FILE_REMOTE_UNAVAILABLE",
  "FILE_INTEGRITY_MISMATCH",
  "ACP_SESSION_BUSY",
  "ACP_REMOTE_RUN_FAILED",
  "ACP_RUNTIME_SESSION_BINDING_MISSING",
  "ACP_RUNTIME_SESSION_CONTINUITY_LOST",
  "ACP_STREAM_RECONCILIATION_MISMATCH",
  "ACP_PROTOCOL_ERROR",
  "REMOTE_EXPERT_CONNECTION_FAILED",
  "REMOTE_EXPERT_TURN_FAILED",
  "REMOTE_EXPERT_SESSION_FAILED",
  "REMOTE_IPC_INVALID_INPUT",
  "ACP_CONTRACT_LOCK_MISSING",
  "REMOTE_EXPERT_UI_AVAILABILITY_FAILED",
  "REMOTE_EXPERT_SELECTION_REQUIRED",
  "REMOTE_EXPERT_RUN_TRANSITION_INVALID",
  "REMOTE_EXPERT_CONTEXT_CONFLICT",
  "REMOTE_EXPERT_EVIDENCE_SECRET_LEAK",
] as const;

export type RemoteExpertErrorCode = (typeof REMOTE_EXPERT_ERROR_CODES)[number];

export function isRemoteExpertErrorCode(
  value: unknown,
): value is RemoteExpertErrorCode {
  return (
    typeof value === "string" &&
    (REMOTE_EXPERT_ERROR_CODES as readonly string[]).includes(value)
  );
}

export class RemoteExpertError extends Error {
  readonly code: RemoteExpertErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RemoteExpertErrorCode | string,
    message: string,
    options?: { retryable?: boolean; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "RemoteExpertError";
    this.code = isRemoteExpertErrorCode(code)
      ? code
      : "ACP_PROTOCOL_ERROR";
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}

export type RemoteExpertStatus = "ready" | "unavailable";
export type RemoteAcpConnectionState =
  | "active"
  | "disconnected"
  | "closed"
  | "expired";
export type ContractGateState =
  | "UNRESOLVED"
  | "DISCOVERED"
  | "COMPATIBLE"
  | "INCOMPATIBLE";

export type RemoteExpertObsStage =
  | "ENTRY"
  | "DISCOVER"
  | "CATALOG"
  | "SELECT"
  | "ROUTE"
  | "CONNECT"
  | "INITIALIZE"
  | "SESSION"
  | "PROMPT"
  | "PERMISSION"
  | "RESUME"
  | "CANCEL"
  | "ATTACHMENT"
  | "ARTIFACT"
  | "CLOSE"
  | "G6"
  | "G7";

export interface RemoteExpertAcpCapabilities {
  protocolVersion: 1;
  remoteTransport: boolean;
}

export interface RemoteExpertCatalogItem {
  agentRef: string;
  displayName: string;
  description: string | null;
  category: string | null;
  tags: string[];
  avatar: string | null;
  status: RemoteExpertStatus;
  capabilities: {
    acp: RemoteExpertAcpCapabilities;
    sessionResume: boolean;
    attachments: string;
    artifacts: string;
    permissions: boolean;
  };
}

export interface RemoteExpertCatalogList {
  items: RemoteExpertCatalogItem[];
}

export interface RemoteAcpSessionRef {
  schemaVersion: 1;
  desktopSessionId: string;
  agentRef: string;
  acpSessionId: string;
  lastSeq: number;
  connectionState: RemoteAcpConnectionState;
  updatedAt: number;
}

export interface RemoteExpertTurnRequest {
  kind: typeof REMOTE_EXPERT_TURN_KIND;
  agentRef: string;
  desktopSessionId: string;
  requestId: string;
  promptText: string;
  managedFileIds: string[];
  authGeneration: string;
  profileId?: string;
}

export interface RemoteAttachmentReceipt {
  attachment_ref: string;
  name: string;
  size_bytes: number;
  checksum_sha256: string;
  content_type: string;
  expires_at: string;
}

export interface RemoteExpertDiscovery {
  frontendContractVersion: string;
  frontendContractDigest: string;
  catalogContractVersion: string;
  catalogContractDigest: string;
  remoteAcpContractVersion: string;
  remoteAcpContractDigest: string;
  acpProtocolVersion: number;
  transportProfile: string;
}

export type RemoteExpertPermissionOption = "allow_once" | "reject_once";

export type RemoteExpertSemanticEvent = {
  sessionId?: string;
} & (
  | { type: "assistant.delta"; turnId: string; text: string }
  | { type: "assistant.snapshot"; turnId: string; text: string }
  | { type: "reasoning.delta"; turnId: string; text: string }
  | {
      type: "tool.call";
      turnId: string;
      toolCallId: string;
      toolName: string;
      title?: string;
      status: "in_progress" | "completed" | "failed";
      rawInput?: Record<string, unknown>;
      redacted?: boolean;
      truncated?: boolean;
    }
  | {
      type: "tool.result";
      turnId: string;
      toolCallId: string;
      status: "completed" | "failed";
      content?: string;
      structuredContent?: unknown;
      errorCode?: string;
      errorMessage?: string;
      redacted?: boolean;
      truncated?: boolean;
    }
  | {
      type: "permission.requested";
      turnId: string;
      requestId: string;
      title?: string;
      options: RemoteExpertPermissionOption[];
    }
  | {
      type: "permission.resolved";
      turnId: string;
      requestId: string;
      optionId: RemoteExpertPermissionOption;
    }
  | {
      type: "artifact.ready";
      turnId: string;
      managedFileId: string;
      name: string;
      uri: string;
    }
  | {
      type: "lifecycle";
      sessionId: string;
      state:
        | "connecting"
        | "active"
        | "waiting_permission"
        | "cancelling"
        | "disconnected"
        | "closed";
      message?: string;
    }
  | {
      type: "turn.end";
      turnId: string;
      outcome: "completed" | "failed" | "cancelled";
      errorCode?: string;
      stopReason?: string;
    }
  | {
      type: "connection";
      sessionId: string;
      state: RemoteAcpConnectionState;
    }
);

export interface RemoteExpertDiscoveryMismatch {
  field: keyof RemoteExpertDiscovery;
  expected: string | number;
  observed: string | number;
}

export interface RemoteExpertAvailability {
  enabled: boolean;
  gateState: ContractGateState;
  packed: boolean;
  reason?: string;
  errorCode?: string;
  /** Present when gate is INCOMPATIBLE; digests/versions are public pins. */
  mismatches?: RemoteExpertDiscoveryMismatch[];
}

export const REMOTE_EXPERT_IPC_CHANNELS = {
  GET_AVAILABILITY: "remote-expert:get-availability",
  LIST_CATALOG: "remote-expert:list-catalog",
  GET_SESSION: "remote-expert:get-session",
  SUBMIT: "remote-expert:submit",
  CANCEL: "remote-expert:cancel",
  CLOSE: "remote-expert:close",
  RESUME: "remote-expert:resume",
  DECIDE_PERMISSION: "remote-expert:decide-permission",
  ON_EVENT: "remote-expert:on-event",
} as const;

export type RemoteExpertIpcChannel =
  (typeof REMOTE_EXPERT_IPC_CHANNELS)[keyof typeof REMOTE_EXPERT_IPC_CHANNELS];

export interface RemoteExpertApi {
  getAvailability(): Promise<RemoteExpertAvailability>;
  listCatalog(): Promise<RemoteExpertCatalogList>;
  getSession(sessionId: string): Promise<RemoteAcpSessionRef | null>;
  submit(
    input: RemoteExpertTurnRequest,
  ): Promise<{ requestId: string; sessionId: string }>;
  cancel(input: { sessionId: string }): Promise<void>;
  close(input: { sessionId: string }): Promise<void>;
  resume(input: {
    sessionId: string;
    authGeneration: string;
  }): Promise<RemoteAcpSessionRef | null>;
  decidePermission(input: {
    sessionId: string;
    requestId: string;
    optionId: RemoteExpertPermissionOption;
    authGeneration: string;
  }): Promise<void>;
  onEvent(listener: (event: RemoteExpertSemanticEvent) => void): () => void;
}

const FORBIDDEN_DTO_KEYS = [
  "skillName",
  "taskId",
  "HermesTask",
  "runtime_run_id",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "executionCapability",
  "execution_capability",
  "internal_token",
  "Authorization",
  "authorization",
] as const;

function walkForbidden(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkForbidden(item, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (
        (FORBIDDEN_DTO_KEYS as readonly string[]).includes(key) &&
        child !== undefined
      ) {
        throw new RemoteExpertError(
          "REMOTE_EXPERT_CREDENTIAL_LEAK_GUARD",
          `forbidden field ${key}`,
        );
      }
      walkForbidden(child, `${path}.${key}`);
    }
  }
}

export function sanitizeRemoteExpertDto<T>(value: T): T {
  walkForbidden(value, "$");
  return value;
}

export function isRemoteExpertCallable(item: RemoteExpertCatalogItem): boolean {
  return (
    item.status === "ready" &&
    item.capabilities.acp.protocolVersion === 1 &&
    item.capabilities.acp.remoteTransport === true
  );
}

export function pinnedDiscovery(): RemoteExpertDiscovery {
  return {
    frontendContractVersion: REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION,
    frontendContractDigest: FRONTEND_CONTRACT_DIGEST,
    catalogContractVersion: CATALOG_CONTRACT_VERSION,
    catalogContractDigest: CATALOG_CONTRACT_DIGEST,
    remoteAcpContractVersion: REMOTE_ACP_CONTRACT_VERSION,
    remoteAcpContractDigest: REMOTE_ACP_CONTRACT_DIGEST,
    acpProtocolVersion: ACP_PROTOCOL_VERSION,
    transportProfile: TRANSPORT_PROFILE,
  };
}

export function listDiscoveryMismatches(
  discovery: RemoteExpertDiscovery,
): RemoteExpertDiscoveryMismatch[] {
  const pinned = pinnedDiscovery();
  const fields = Object.keys(pinned) as Array<keyof RemoteExpertDiscovery>;
  const mismatches: RemoteExpertDiscoveryMismatch[] = [];
  for (const field of fields) {
    if (discovery[field] !== pinned[field]) {
      mismatches.push({
        field,
        expected: pinned[field],
        observed: discovery[field],
      });
    }
  }
  return mismatches;
}

export function formatDiscoveryMismatchReason(
  mismatches: RemoteExpertDiscoveryMismatch[],
): string {
  if (mismatches.length === 0) {
    return "provider discovery does not match pinned consumer lock";
  }
  return mismatches
    .map(
      (m) =>
        `${m.field}: expected ${String(m.expected)}, got ${String(m.observed)}`,
    )
    .join("; ");
}

export function discoveryExactMatch(
  discovery: RemoteExpertDiscovery,
): boolean {
  return listDiscoveryMismatches(discovery).length === 0;
}
