/**
 * Work Explicit Expert cross-process DTO owner.
 * Derived from WORK-EXPERT-CONTRACT v1.0.2 (OpenAPI / SSE / MCP / fixtures).
 * Do not invent fields from wiki prose — keep in sync with contract artifacts.
 */

/** Contract identity pinned by consumer lock (tag + SHA + SHA256SUMS when available). */
export const WORK_EXPERT_CONTRACT_NAME = "WORK-EXPERT-CONTRACT";
export const WORK_EXPERT_CONTRACT_VERSION = "1.0.2";

/** Local Expert request lifecycle (not HermesTask status). */
export type ExpertLocalPhase =
  | "queued"
  | "starting"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "unauthorized";

export type ExpertTerminalPhase = Extract<
  ExpertLocalPhase,
  "succeeded" | "failed" | "cancelled" | "expired" | "unauthorized"
>;

export function isExpertTerminalPhase(
  phase: ExpertLocalPhase,
): phase is ExpertTerminalPhase {
  switch (phase) {
    case "succeeded":
    case "failed":
    case "cancelled":
    case "expired":
    case "unauthorized":
      return true;
    case "queued":
    case "starting":
    case "running":
      return false;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

/** HermesTask remote status values observed in contract fixtures / OpenAPI. */
export type HermesTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | string;

/** Minimum UI stages when runtimeProgress=false. */
export type ExpertDisplayStage =
  | "preparing"
  | "running"
  | "finalizing"
  | string;

/** Immutable snapshot taken at submit time — never re-read live toolbar state. */
export interface ExpertRequest {
  kind: "expert";
  expertSlug: string;
  skillName: string;
  prompt: string;
  /** Allowed attachment refs only (no raw URLs). */
  attachmentRefs: string[];
  sessionId: string;
  profileId: string;
  clientRequestId: string;
  /** Auth generation / user id at call time for generation mismatch checks. */
  authGeneration: string;
}

export interface ExpertCatalogItem {
  name: string;
  description?: string;
  slug: string;
  kind?: string;
  displayName?: string;
  /** `ready` is callable; missing/unknown must not be treated as ready. */
  status?: string;
  publicSkillCount?: number;
  callableSkillCount?: number;
  inputSchema?: Record<string, unknown>;
}

export interface ExpertSkillItem {
  name: string;
  description?: string;
  displayName?: string;
  status?: string;
  callEnabled?: boolean;
  riskLevel?: string | null;
  approvalMode?: string | null;
  inputSchema?: Record<string, unknown>;
}

export type ExpertGatewayStatus =
  | "checking"
  | "ready"
  | "error"
  | "unavailable"
  | "unknown";

export interface ExpertHealthResponse {
  ok: boolean;
  status: string;
  gateway: Record<string, unknown>;
  catalog: Record<string, unknown>;
}

export interface SelectedCallability {
  catalogStatus: string | null;
  skillStatus: string | null;
  callEnabled: boolean;
  riskLevel: string | null;
  approvalMode: string | null;
  canSilentCall: boolean;
}

export function canSilentCallExpertSkill(
  catalogItem: ExpertCatalogItem,
  skillItem: ExpertSkillItem,
): boolean {
  return (
    catalogItem.status === "ready" &&
    skillItem.status === "ready" &&
    skillItem.callEnabled === true &&
    skillItem.riskLevel === "low" &&
    skillItem.approvalMode === "auto"
  );
}

/** User-facing reasons when silent-call allowlist fails (fail-closed). */
export function describeSilentCallDenial(
  snap: SelectedCallability | null,
): string {
  const prefix = "Selected expert skill cannot be called silently";
  if (!snap) return `${prefix}.`;
  const reasons: string[] = [];
  if (snap.catalogStatus !== "ready") {
    reasons.push(`expert status is ${snap.catalogStatus ?? "missing"}`);
  }
  if (snap.skillStatus !== "ready") {
    reasons.push(`skill status is ${snap.skillStatus ?? "missing"}`);
  }
  if (snap.callEnabled !== true) {
    reasons.push("callEnabled is not true");
  }
  if (snap.riskLevel !== "low") {
    reasons.push(`riskLevel is ${snap.riskLevel ?? "missing"} (need low)`);
  }
  if (snap.approvalMode !== "auto") {
    reasons.push(
      `approvalMode is ${snap.approvalMode ?? "missing"} (need auto)`,
    );
  }
  if (reasons.length === 0) return `${prefix}.`;
  return `${prefix}: ${reasons.join("; ")}.`;
}

export interface ExpertWaitStrategy {
  type: string;
  fallback?: string;
  poll_url?: string;
  poll_tool?: string;
  result_url?: string;
}

/** Accepted tools/call structuredContent (not final result). */
export interface ExpertAcceptedStructuredContent {
  committed: boolean;
  task_id: string;
  task_no?: string;
  status: HermesTaskStatus;
  event_stream: string;
  event_url?: string;
  event_token_url: string;
  result_url: string;
  artifact_url: string;
  wait_strategy: ExpertWaitStrategy;
  catalog_slug?: string;
  skill_name?: string;
  invocation_id?: string;
}

export interface ExpertJsonRpcErrorData {
  errorCode: string;
  message_key?: string | null;
  forbiddenKeys?: string[] | null;
}

export interface ExpertJsonRpcError {
  code: number;
  message: string;
  data?: ExpertJsonRpcErrorData | Record<string, unknown> | null;
}

export interface ExpertApiErrorBody {
  code: number;
  error_code: number;
  message_key: string;
  message: string;
  data?: null;
  message_params?: Record<string, string> | null;
  details?: Record<string, unknown> | null;
}

export interface HermesTaskRead {
  id: string;
  org_id?: string;
  task_no?: string;
  status: HermesTaskStatus;
  skill_id?: string | null;
  tool_name?: string | null;
  agent_id?: string | null;
  profile_id?: string | null;
  workspace_id?: string | null;
  user_id?: string | null;
  [key: string]: unknown;
}

export interface HermesTaskResult {
  ready: boolean;
  status?: HermesTaskStatus;
  task_id?: string;
  task_no?: string;
  result_summary?: string | null;
  result_content?: string | null;
  /** Full result body — same as result_content per contract. */
  content?: string | null;
  summary?: string | null;
}

export interface ExpertArtifactDescriptor {
  id: string;
  org_id: string;
  task_id?: string | null;
  created_by?: string | null;
  title?: string | null;
  file_name: string;
  file_path?: string;
  content_type?: string | null;
  artifact_type?: string | null;
  size_bytes?: number | null;
  sha256?: string | null;
  /** Nullable locator — must NOT be trusted for navigation; use artifact_id + configured base URL. */
  preview_url?: string | null;
  download_url?: string | null;
  [key: string]: unknown;
}

export interface HermesTaskSnapshot {
  task?: HermesTaskRead | { id: string; status: HermesTaskStatus };
  status: HermesTaskStatus;
  timeline?: unknown[];
  result?: {
    ready: boolean;
    summary?: string | null;
    result_content?: string | null;
    content?: string | null;
  };
  artifacts?: {
    ready: boolean;
    items?: ExpertArtifactDescriptor[];
    server_artifacts?: unknown[];
  };
  links?: {
    event_stream?: string;
    result_url?: string;
    artifact_url?: string;
  };
  last_events?: ExpertTaskEvent[];
}

export interface ExpertEventsToken {
  event_url: string;
  expires_in: number;
  expires_at: string;
}

/** Base SSE event envelope (task-event.schema.json). */
export interface ExpertTaskEventBase {
  event: string;
  task_id: string;
  timestamp?: string | null;
  event_type: string;
  event_seq: number;
}

export interface ExpertTaskProgressEvent extends ExpertTaskEventBase {
  event: "task.progress";
  stage?: string | null;
  progress?: number | null;
  message?: string | null;
}

export interface ExpertTaskStartedEvent extends ExpertTaskEventBase {
  event: "task.started";
}

export interface ExpertTaskFailedEvent extends ExpertTaskEventBase {
  event: "task.failed";
  message?: string | null;
  error_code?: string | null;
}

export interface ExpertTaskCompletedEvent extends ExpertTaskEventBase {
  event: "task.completed";
  result?: {
    summary?: string | null;
    content?: string | null;
    artifacts?: Record<string, unknown>[];
    artifact_mode?: string | null;
    kb_status?: string | null;
  };
  artifact_mode?: string | null;
  kb_status?: string | null;
}

export interface ExpertTaskArtifactReadyEvent extends ExpertTaskEventBase {
  event: "task.artifact_ready";
  artifact_id?: string;
  [key: string]: unknown;
}

export type ExpertTaskEvent =
  | ExpertTaskProgressEvent
  | ExpertTaskStartedEvent
  | ExpertTaskFailedEvent
  | ExpertTaskCompletedEvent
  | ExpertTaskArtifactReadyEvent
  | ExpertTaskEventBase;

/** UI projection only — HermesTask remains authoritative truth. */
export interface ExpertRunProjection {
  clientRequestId: string;
  taskId: string | null;
  phase: ExpertLocalPhase;
  displayStage: ExpertDisplayStage | null;
  expertSlug: string;
  skillName: string;
  prompt: string;
  sessionId: string;
  profileId: string;
  lastEventId: string | null;
  lastEventSeq: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  resultSummary: string | null;
  resultContent: string | null;
  /** Live assistant bubble text from SSE task.progress (running only). */
  progressMessage: string | null;
  artifactIds: string[];
  updatedAt: string;
}

/** Stable ids for Expert → chat transcript bubbles (renderer + state.db markers). */
export function expertTranscriptBubbleIds(clientRequestId: string): {
  user: string;
  assistant: string;
} {
  return {
    user: `expert-run:${clientRequestId}:user`,
    assistant: `expert-run:${clientRequestId}:assistant`,
  };
}

/** Assistant bubble / messages.content body for an Expert projection. */
export function buildExpertTranscriptAssistantContent(projection: {
  phase: ExpertLocalPhase;
  resultContent?: string | null;
  resultSummary?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  progressMessage?: string | null;
}): string {
  switch (projection.phase) {
    case "succeeded": {
      const body =
        projection.resultContent?.trim() ||
        projection.resultSummary?.trim() ||
        "";
      return body || "Expert completed with no content.";
    }
    case "failed": {
      const detail =
        projection.errorMessage?.trim() ||
        (projection.errorCode ? `error ${projection.errorCode}` : "");
      return detail ? `Expert failed: ${detail}` : "Expert failed.";
    }
    case "cancelled":
      return "Expert run cancelled.";
    case "expired":
      return "Expert run expired.";
    case "unauthorized":
      return "Expert run unauthorized.";
    case "queued":
    case "starting":
      return "专家正在分析…";
    case "running":
      return projection.progressMessage?.trim() || "专家正在分析…";
    default: {
      const _exhaustive: never = projection.phase;
      return _exhaustive;
    }
  }
}

/** Restart projection member for session continuation (schemaVersion: 1). */
export interface ExpertRunContinuationItem {
  kind: "expert-run";
  schemaVersion: 1;
  taskId: string;
  clientRequestId: string;
  expertSlug: string;
  skillName: string;
  promptSummary: string;
  sessionId: string;
  profileId: string;
  authGeneration: string;
  lastEventId: string | null;
  phase: ExpertLocalPhase;
  updatedAt: string;
}

export const EXPERT_IPC_CHANNELS = {
  listCatalog: "expert:list-catalog",
  listSkills: "expert:list-skills",
  getHealth: "expert:get-health",
  refreshCatalog: "expert:refresh-catalog",
  start: "expert:start",
  cancel: "expert:cancel",
  retry: "expert:retry",
  getProjection: "expert:get-projection",
  listProjections: "expert:list-projections",
  rehydrateSession: "expert:rehydrate-session",
  downloadArtifact: "expert:download-artifact",
  onProjectionChanged: "expert:projection-changed",
} as const;

export type ExpertIpcChannel =
  (typeof EXPERT_IPC_CHANNELS)[keyof typeof EXPERT_IPC_CHANNELS];

export interface ExpertStartInput {
  request: ExpertRequest;
}

export interface ExpertCancelInput {
  clientRequestId: string;
  taskId?: string | null;
}

export interface ExpertRetryInput {
  /** Previous terminal failure's clientRequestId — never reused for the new call. */
  previousClientRequestId: string;
  request: ExpertRequest;
}

export interface ExpertDownloadArtifactInput {
  taskId: string;
  artifactId: string;
  sessionId: string;
  profileId?: string;
}

export interface ExpertApi {
  listCatalog: () => Promise<ExpertCatalogItem[]>;
  listSkills: (expertSlug: string) => Promise<ExpertSkillItem[]>;
  getHealth: () => Promise<ExpertHealthResponse>;
  refreshCatalog: () => Promise<ExpertCatalogItem[]>;
  start: (input: ExpertStartInput) => Promise<ExpertRunProjection>;
  cancel: (input: ExpertCancelInput) => Promise<ExpertRunProjection | null>;
  retry: (input: ExpertRetryInput) => Promise<ExpertRunProjection>;
  getProjection: (
    clientRequestId: string,
  ) => Promise<ExpertRunProjection | null>;
  listProjections: (sessionId: string) => Promise<ExpertRunProjection[]>;
  rehydrateSession: (sessionId: string) => Promise<ExpertRunProjection[]>;
  downloadArtifact: (
    input: ExpertDownloadArtifactInput,
  ) => Promise<{ fileId: string }>;
  onProjectionChanged: (
    callback: (projection: ExpertRunProjection) => void,
  ) => () => void;
}

export function createClientRequestId(): string {
  return `expert-req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function extractJsonRpcErrorCode(
  error: ExpertJsonRpcError | undefined,
): string | null {
  if (!error?.data || typeof error.data !== "object") return null;
  const data = error.data as ExpertJsonRpcErrorData;
  return typeof data.errorCode === "string" ? data.errorCode : null;
}

/** Payload that survives Electron IPC (only Error.message is reliable). */
export interface ExpertIpcErrorPayload {
  name: "ExpertGatewayError";
  message: string;
  status: number;
  errorCode: string | null;
}

export function encodeExpertIpcError(payload: {
  message: string;
  status: number;
  errorCode?: string | null;
}): Error {
  const body: ExpertIpcErrorPayload = {
    name: "ExpertGatewayError",
    message: payload.message,
    status: payload.status,
    errorCode: payload.errorCode ?? null,
  };
  const err = new Error(JSON.stringify(body));
  err.name = "ExpertGatewayError";
  return err;
}

function tryParseExpertIpcPayload(raw: string): ExpertIpcErrorPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ExpertIpcErrorPayload>;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.message === "string" &&
      typeof parsed.status === "number"
    ) {
      return {
        name: "ExpertGatewayError",
        message: parsed.message,
        status: parsed.status,
        errorCode:
          typeof parsed.errorCode === "string" ? parsed.errorCode : null,
      };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/**
 * Decode Expert gateway errors after Electron IPC.
 * Handles: direct payload object, Error with JSON message, and
 * `Error invoking remote method '...': {json}`.
 */
export function decodeExpertIpcError(
  err: unknown,
): ExpertIpcErrorPayload | null {
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    if (
      typeof record.status === "number" &&
      typeof record.message === "string" &&
      !String(record.message).startsWith("Error invoking remote method")
    ) {
      return {
        name: "ExpertGatewayError",
        message: record.message,
        status: record.status,
        errorCode:
          typeof record.errorCode === "string" ? record.errorCode : null,
      };
    }
    if (typeof record.message === "string") {
      const msg = record.message;
      const direct = tryParseExpertIpcPayload(msg);
      if (direct) return direct;
      const brace = msg.indexOf("{");
      if (brace >= 0) {
        const nested = tryParseExpertIpcPayload(msg.slice(brace));
        if (nested) return nested;
      }
    }
  }
  return null;
}

export function formatExpertHealthUserMessage(
  status: ExpertGatewayStatus,
  payload: ExpertIpcErrorPayload | null,
  fallback: unknown,
): string {
  if (status === "unavailable") return "Expert Gateway unavailable.";
  if (status === "error") {
    if (payload?.errorCode === "INVALID_HEALTH_PAYLOAD") {
      return "Expert Gateway returned an invalid health payload.";
    }
    if (payload?.message?.trim()) return payload.message;
    return "Expert Gateway error.";
  }
  if (payload?.message?.trim()) return payload.message;
  if (fallback instanceof Error && fallback.message.trim()) {
    return fallback.message;
  }
  return "Expert Gateway unavailable.";
}
