/**
 * Work Skill Run cross-process DTO owner.
 * Defines feature mode, catalog models, execution inputs, projection, continuation, and IPC contracts.
 * Distinct from legacy Expert contract v1.0.2.
 */

export const WORK_SKILL_RUN_CONTRACT_NAME = "WORK-SKILL-RUN-CONTRACT";
export const WORK_SKILL_RUN_CONTRACT_VERSION = "1.0.0";

export type SkillRunFeatureMode =
  | "expert-compat"
  | "skill-first"
  | "local-only";

export type SkillRunLocalPhase =
  | "pending-submit"
  | "starting"
  | "running"
  | "waiting-approval"
  | "discovering-artifacts"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "unauthorized";

export type SkillRunTerminalPhase = Extract<
  SkillRunLocalPhase,
  "succeeded" | "failed" | "cancelled" | "expired" | "unauthorized"
>;

export function isSkillRunTerminalPhase(phase: SkillRunLocalPhase): phase is SkillRunTerminalPhase {
  return (
    phase === "succeeded" ||
    phase === "failed" ||
    phase === "cancelled" ||
    phase === "expired" ||
    phase === "unauthorized"
  );
}

export type SkillInvocationMode =
  | "prompt-first"
  | "limited-parameter-form"
  | "parameters-required"
  | "form-required"
  | "unsupported-schema";

export interface SkillRunExtraStringField {
  name: string;
  title?: string;
}

export type SkillInvocationReasonCode =
  | "FORM_REQUIRED"
  | "PROMPT_FIELD_MISSING"
  | "PROMPT_FIELD_INVALID"
  | "EXTRA_REQUIRED_PARAMETERS"
  | "ROOT_SCHEMA_UNSUPPORTED"
  | "COMPOSITE_SCHEMA_UNSUPPORTED"
  | "CONTRACT_MISMATCH";

export interface SkillCatalogToolItem {
  toolName: string;
  title: string;
  description?: string;
  category?: string;
  interactionMode: "chat" | "form";
  promptField?: string | null;
  supportsAttachments: boolean;
  callability: "callable" | "disabled" | "unsupported";
  invocationMode: SkillInvocationMode;
  reasonCode?: SkillInvocationReasonCode;
  /** Main-projected extra required string fields. Renderer must not invent keys from inputSchema. */
  extraStringFields?: SkillRunExtraStringField[];
  /** True when the current auth-scope favorite set contains this Catalog toolName. */
  favorited?: boolean;
  /** 1-based rank in the current auth-scope recent list; omitted when not recent. */
  recentRank?: number;
  /** Read-only projection for display/debug; Renderer must not build Provider arguments from it. */
  inputSchema?: Record<string, unknown>;
}

export type SkillCatalogStatus =
  | "ready"
  | "loading"
  | "unauthorized"
  | "backend-unavailable"
  | "contract-unsupported";

export interface SkillCatalogResponse {
  status: SkillCatalogStatus;
  tools: SkillCatalogToolItem[];
  reason?: string;
}

export interface SkillRunArtifactDescriptor {
  id: string;
  file_name: string;
  size_bytes?: number;
  mime_type?: string;
  sha256?: string;
  preview_supported?: boolean;
}

export type SkillRunActivityKind =
  | "reasoning.summary"
  | "tool.call"
  | "clarify.requested"
  | "approval.requested";

export type SkillRunToolCallStatus = "started" | "completed" | "failed";

/** Work-owned sanitized activity item. Not a Provider event object. */
export interface SkillRunActivityItem {
  eventId: string;
  kind: SkillRunActivityKind;
  /** Durable sidecar ordinal copied onto the live projection. */
  ordinal?: number;
  summary?: string;
  toolName?: string;
  callId?: string;
  status?: SkillRunToolCallStatus;
  question?: string;
  options?: string[];
  approvalId?: string;
}

export type SkillRunNativeRowKind = "reasoning" | "tool_call" | "notice";

/** Shared Native-row derivation. Main and Renderer map this DTO onto HistoryItem / ChatMessage. */
export interface SkillRunNativeActivityRow {
  id: string;
  kind: SkillRunNativeRowKind;
  ordinal: number;
  eventId: string;
  callId?: string;
  toolName?: string;
  status?: SkillRunToolCallStatus;
  summary?: string;
  question?: string;
}

export function skillRunNativeUserMessageId(clientRequestId: string): string {
  return `skill-run:${clientRequestId}:user`;
}

export function skillRunNativeAssistantMessageId(clientRequestId: string): string {
  return `skill-run:${clientRequestId}:assistant`;
}

export function skillRunNativeActivityRowId(
  clientRequestId: string,
  item: Pick<SkillRunActivityItem, "kind" | "eventId" | "callId">,
): string {
  if (item.kind === "tool.call" && item.callId) {
    return `skill-run:${clientRequestId}:tool:${item.callId}`;
  }
  return `skill-run:${clientRequestId}:activity:${item.eventId}`;
}

function activityOrdinal(item: SkillRunActivityItem): number {
  return typeof item.ordinal === "number" ? item.ordinal : Number.MAX_SAFE_INTEGER;
}

function rankToolStatus(status: SkillRunToolCallStatus | undefined): number {
  if (status === "failed") return 3;
  if (status === "completed") return 2;
  if (status === "started") return 1;
  return 0;
}

export function compactSkillRunActivityItems(
  items: ReadonlyArray<SkillRunActivityItem>,
): SkillRunActivityItem[] {
  const byEventId = new Map<string, SkillRunActivityItem>();
  for (const item of items) {
    if (!byEventId.has(item.eventId)) {
      byEventId.set(item.eventId, item);
    }
  }
  const ordered = Array.from(byEventId.values()).sort(
    (left, right) => activityOrdinal(left) - activityOrdinal(right) || left.eventId.localeCompare(right.eventId),
  );
  const output: SkillRunActivityItem[] = [];
  const toolIndexByCall = new Map<string, number>();
  for (const item of ordered) {
    if (item.kind === "tool.call" && item.callId) {
      const existing = toolIndexByCall.get(item.callId);
      if (existing === undefined) {
        toolIndexByCall.set(item.callId, output.length);
        output.push(item);
        continue;
      }
      if (rankToolStatus(item.status) >= rankToolStatus(output[existing]?.status)) {
        output[existing] = {
          ...item,
          ordinal: output[existing]?.ordinal ?? item.ordinal,
        };
      }
      continue;
    }
    output.push(item);
  }
  return output;
}

function nativeKindForActivity(kind: SkillRunActivityKind): SkillRunNativeRowKind {
  switch (kind) {
    case "reasoning.summary":
      return "reasoning";
    case "tool.call":
      return "tool_call";
    case "clarify.requested":
    case "approval.requested":
      return "notice";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function projectSkillRunActivitiesToNativeRows(
  clientRequestId: string,
  activities: ReadonlyArray<SkillRunActivityItem>,
): SkillRunNativeActivityRow[] {
  return compactSkillRunActivityItems(activities).map((item) => {
    const row: SkillRunNativeActivityRow = {
      id: skillRunNativeActivityRowId(clientRequestId, item),
      kind: nativeKindForActivity(item.kind),
      ordinal: activityOrdinal(item),
      eventId: item.eventId,
    };
    if (item.callId) row.callId = item.callId;
    if (item.toolName) row.toolName = item.toolName;
    if (item.status) row.status = item.status;
    if (item.summary) row.summary = item.summary;
    if (item.question) row.question = item.question;
    return row;
  });
}

export interface SkillRunProjection {
  clientRequestId: string;
  providerRunId: string | null;
  toolName: string;
  promptSummary: string;
  sessionId: string;
  profileId: string;
  authGeneration?: string;
  phase: SkillRunLocalPhase;
  displayStage: string;
  lastEventId: string | null;
  eventSeq: number;
  text?: string;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: SkillRunArtifactDescriptor[];
  /** Bounded sanitized activity; omitted when empty. Not persisted on continuation. */
  activities?: SkillRunActivityItem[];
  /** True when artifact list failed after a succeeded run; retryable via existing IPC. */
  artifactDiscoveryError?: boolean;
  /** Renderer-safe discovery error text; never URLs, paths, or bytes. */
  artifactDiscoveryMessage?: string;
  /** Last approval_id successfully submitted via decideApproval; never the idempotency key. */
  decidedApprovalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillRunContinuationItem {
  kind: "skill-run";
  schemaVersion: 1;
  clientRequestId: string;
  providerRunId: string | null;
  toolName: string;
  promptSummary: string;
  sessionId: string;
  profileId: string;
  authGeneration?: string;
  lastEventId: string | null;
  phase: SkillRunLocalPhase;
  text?: string;
  updatedAt: string;
}

export interface SkillRunStartInput {
  toolName: string;
  prompt: string;
  clientRequestId: string;
  sessionId: string;
  profileId: string;
  authGeneration?: string;
  extraParameters?: Record<string, string>;
  /** File Platform ManagedFile ids only. Never Provider attachment refs. */
  fileIds?: string[];
}

export type SkillRunStartResult =
  | {
      accepted: true;
      projection: SkillRunProjection;
    }
  | {
      accepted: false;
      errorCode: string;
      message: string;
      clientRequestId: string;
    };

export interface SkillRunCancelInput {
  clientRequestId: string;
  sessionId: string;
}

export interface SkillRunCancelResult {
  success: boolean;
  errorCode?: string;
  message?: string;
  projection?: SkillRunProjection;
}

export interface SkillRunRetryArtifactDiscoveryInput {
  clientRequestId: string;
  sessionId: string;
}

export interface SkillRunDecideApprovalInput {
  clientRequestId: string;
  sessionId: string;
  decision: "allow" | "deny";
}

export interface SkillRunDecideApprovalResult {
  success: boolean;
  errorCode?: string;
  message?: string;
  projection?: SkillRunProjection;
}

export interface SkillRunSessionModeSnapshot {
  executionMode: "skill-run";
  toolName: string;
  toolTitle: string;
  updatedAt: string;
}

export const SKILL_RUN_IPC_CHANNELS = {
  LIST_CATALOG: "skill-run:list-catalog",
  REFRESH_CATALOG: "skill-run:refresh-catalog",
  START: "skill-run:start",
  CANCEL: "skill-run:cancel",
  GET_FEATURE_MODE: "skill-run:get-feature-mode",
  GET_PROJECTION: "skill-run:get-projection",
  LIST_PROJECTIONS: "skill-run:list-projections",
  REHYDRATE_SESSION: "skill-run:rehydrate-session",
  RETRY_ARTIFACT_DISCOVERY: "skill-run:retry-artifact-discovery",
  GET_SESSION_MODE: "skill-run:get-session-mode",
  SET_CATALOG_FAVORITE: "skill-run:set-catalog-favorite",
  DECIDE_APPROVAL: "skill-run:decide-approval",
  ON_PROJECTION_CHANGED: "skill-run:on-projection-changed",
} as const;

export interface SkillRunSetCatalogFavoriteInput {
  toolName: string;
  favorited: boolean;
}

export interface SkillRunApi {
  listCatalog(): Promise<SkillCatalogResponse>;
  refreshCatalog(): Promise<SkillCatalogResponse>;
  setCatalogFavorite(input: SkillRunSetCatalogFavoriteInput): Promise<SkillCatalogResponse>;
  start(input: SkillRunStartInput): Promise<SkillRunStartResult>;
  cancel(input: SkillRunCancelInput): Promise<SkillRunCancelResult>;
  getFeatureMode(): Promise<{ mode: SkillRunFeatureMode }>;
  getProjection(clientRequestId: string): Promise<SkillRunProjection | null>;
  listProjections(sessionId: string): Promise<SkillRunProjection[]>;
  rehydrateSession(sessionId: string): Promise<SkillRunProjection[]>;
  retryArtifactDiscovery(input: SkillRunRetryArtifactDiscoveryInput): Promise<SkillRunProjection | null>;
  decideApproval(input: SkillRunDecideApprovalInput): Promise<SkillRunDecideApprovalResult>;
  getSessionMode(sessionId: string): Promise<SkillRunSessionModeSnapshot | null>;
  onProjectionChanged(listener: (projection: SkillRunProjection) => void): () => void;
}
