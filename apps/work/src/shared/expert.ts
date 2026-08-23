/**
 * Work Explicit Expert cross-process DTO owner.
 * Derived from WORK-EXPERT-CONTRACT v1.0.1 (OpenAPI / SSE / MCP / fixtures).
 * Do not invent fields from wiki prose — keep in sync with contract artifacts.
 */

/** Contract identity pinned by consumer lock (tag + SHA + SHA256SUMS when available). */
export const WORK_EXPERT_CONTRACT_NAME = "WORK-EXPERT-CONTRACT";
export const WORK_EXPERT_CONTRACT_VERSION = "1.0.1";

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
export type ExpertDisplayStage = "preparing" | "running" | "finalizing" | string;

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
  inputSchema?: Record<string, unknown>;
}

export interface ExpertSkillItem {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
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
  artifactIds: string[];
  updatedAt: string;
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
  start: (input: ExpertStartInput) => Promise<ExpertRunProjection>;
  cancel: (input: ExpertCancelInput) => Promise<ExpertRunProjection | null>;
  retry: (input: ExpertRetryInput) => Promise<ExpertRunProjection>;
  getProjection: (clientRequestId: string) => Promise<ExpertRunProjection | null>;
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
