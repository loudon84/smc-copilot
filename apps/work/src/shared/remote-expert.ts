export const REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION = "2.0.0" as const;
export const FRONTEND_CONTRACT_DIGEST =
  "22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5";
export const CATALOG_CONTRACT_VERSION = "1.1.0" as const;
export const CATALOG_CONTRACT_DIGEST =
  "d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c";
export const REMOTE_ACP_CONTRACT_VERSION = "1.0.0" as const;
export const REMOTE_ACP_CONTRACT_DIGEST =
  "8a48e74e363c71875739c33b2bcdcb6f6f2ea7ee15897ae9fb9b8e9407ee9d06";
export const ACP_PROTOCOL_VERSION = 1 as const;
export const TRANSPORT_PROFILE = "nodeskclaw.remote-acp.v1" as const;
export const PROVIDER_TAG = "remote-expert-frontend-contract-v2.0.0" as const;
export const PROVIDER_TAG_TARGET =
  "5d36d6f7bebe1e70e7e031eaf384e124c76d98bc" as const;
export const FRONTEND_BUNDLE_DIGEST =
  "3de6c671bd9b22c5d6e35855f9dbb3f8432a6f0291df21b4824dc6ff9a0df43a";

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
  "ACP_PROTOCOL_ERROR",
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
  | { type: "reasoning.delta"; turnId: string; text: string }
  | {
      type: "tool.call";
      turnId: string;
      toolCallId: string;
      toolName: string;
      title?: string;
    }
  | {
      type: "tool.result";
      turnId: string;
      toolCallId: string;
      content?: string;
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
