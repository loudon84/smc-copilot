/**
 * Sanitized Knowledge Upload Job IPC contract (Renderer ↔ Main).
 * No Electron / React imports. Never carry tokens, absolute paths, or provider raw errors.
 *
 * Mode / facade snapshot+command types live here so T6 does not invent a second contract file.
 */

export const KNOWLEDGE_BASE_ID_UNBOUND = "unbound" as const;

/**
 * Stage statuses including `completed`.
 * Provider must not mint `completed` without a real executor; mock executor is T4.
 */
export type KnowledgeJobStatus =
  | "draft"
  | "queued"
  | "uploading"
  | "processing"
  | "completed"
  | "interrupted"
  | "failed"
  | "cancelled"
  | "blocked_provider_unavailable";

/** Persisted / snapshot dataMode values (includes migration sentinel). */
export type KnowledgeDataMode = "mock" | "provider" | "legacy-unclassified";

/** Runtime active mode (never legacy-unclassified). */
export type KnowledgeActiveDataMode = "mock" | "provider";

export type KnowledgeTenantScope =
  | { kind: "tenant"; tenantId: string }
  | { kind: "personal" };

export interface KnowledgeJobPartition {
  workProfileId: string;
  authSubject: string;
  tenantScope: KnowledgeTenantScope;
}

/** Optional file summary — display name only; never absolute paths. */
export interface KnowledgeJobFileSummary {
  displayName: string;
  byteSize?: number;
  mimeType?: string;
}

export interface KnowledgeJobSnapshot {
  jobId: string;
  knowledgeBaseId: string;
  status: KnowledgeJobStatus;
  attempt: number;
  partition: KnowledgeJobPartition;
  dataMode: KnowledgeDataMode;
  synthetic: boolean;
  /** Progress percent 0–100. */
  progress: number;
  fileSummary?: KnowledgeJobFileSummary;
  errorCode?: string;
  updatedAt: string;
}

export type KnowledgeCapabilityStatus =
  | "available"
  | "blocked_provider_unavailable"
  | "auth_required";

export interface KnowledgeCapabilitySnapshot {
  available: boolean;
  status: KnowledgeCapabilityStatus;
}

export interface KnowledgeJobCreateDraftInput {
  /** Opaque base id, or sentinel `unbound`. */
  knowledgeBaseId?: string;
}

export interface KnowledgeJobCommandInput {
  jobId: string;
  commandId?: string;
}

/** Sanitized Main-owned mode snapshot for badge / diagnostics (no tokens). */
export interface KnowledgeModeSnapshot {
  dataMode: KnowledgeActiveDataMode;
  allowSyntheticData: boolean;
  channel?: string;
  configSource?: string;
}

export type KnowledgeFacadeEntityKind =
  | "base"
  | "set"
  | "document"
  | "session"
  | "citation";

/** Display-only permission; never authorizes File/Chat/Settings/provider. */
export interface KnowledgeFacadePermissionDisplay {
  role?: string;
  visibility?: string;
}

export interface KnowledgeFacadeEntitySnapshot {
  id: string;
  kind: KnowledgeFacadeEntityKind;
  dataMode: KnowledgeActiveDataMode;
  partition: KnowledgeJobPartition;
  title?: string;
  permission?: KnowledgeFacadePermissionDisplay;
}

export interface KnowledgeFacadeListInput {
  kind: KnowledgeFacadeEntityKind;
  parentId?: string;
}

export interface KnowledgeFacadeGetInput {
  kind: KnowledgeFacadeEntityKind;
  entityId: string;
}

export interface KnowledgeFacadeMutateInput {
  kind: KnowledgeFacadeEntityKind;
  entityId?: string;
  commandId?: string;
  /** Opaque sanitized mutation payload (no paths/tokens). */
  patch?: Record<string, unknown>;
}

export const KNOWLEDGE_JOB_IPC_CHANNELS = {
  createDraft: "knowledge-job:create-draft",
  getSnapshot: "knowledge-job:get-snapshot",
  listSnapshots: "knowledge-job:list-snapshots",
  cancel: "knowledge-job:cancel",
  retry: "knowledge-job:retry",
  getCapability: "knowledge-job:get-capability",
  snapshotChanged: "knowledge-job:snapshot-changed",
} as const;

export const KNOWLEDGE_MODE_IPC_CHANNELS = {
  getSnapshot: "knowledge-mode:get-snapshot",
} as const;

export const KNOWLEDGE_FACADE_IPC_CHANNELS = {
  listEntities: "knowledge-facade:list-entities",
  getEntity: "knowledge-facade:get-entity",
  mutateEntity: "knowledge-facade:mutate-entity",
} as const;

export type KnowledgeJobIpcChannel =
  (typeof KNOWLEDGE_JOB_IPC_CHANNELS)[keyof typeof KNOWLEDGE_JOB_IPC_CHANNELS];

export type KnowledgeModeIpcChannel =
  (typeof KNOWLEDGE_MODE_IPC_CHANNELS)[keyof typeof KNOWLEDGE_MODE_IPC_CHANNELS];

export type KnowledgeFacadeIpcChannel =
  (typeof KNOWLEDGE_FACADE_IPC_CHANNELS)[keyof typeof KNOWLEDGE_FACADE_IPC_CHANNELS];

export interface HermesKnowledgeJobsAPI {
  createDraft(
    input?: KnowledgeJobCreateDraftInput,
  ): Promise<KnowledgeJobSnapshot>;
  getSnapshot(jobId: string): Promise<KnowledgeJobSnapshot>;
  listSnapshots(): Promise<KnowledgeJobSnapshot[]>;
  cancel(input: KnowledgeJobCommandInput): Promise<KnowledgeJobSnapshot>;
  retry(input: KnowledgeJobCommandInput): Promise<KnowledgeJobSnapshot>;
  getCapability(): Promise<KnowledgeCapabilitySnapshot>;
  onSnapshotChanged(
    callback: (snapshot: KnowledgeJobSnapshot) => void,
  ): () => void;
}

export interface HermesKnowledgeModeAPI {
  getSnapshot(): Promise<KnowledgeModeSnapshot>;
}

export interface HermesKnowledgeFacadeAPI {
  listEntities(
    input: KnowledgeFacadeListInput,
  ): Promise<KnowledgeFacadeEntitySnapshot[]>;
  getEntity(
    input: KnowledgeFacadeGetInput,
  ): Promise<KnowledgeFacadeEntitySnapshot | null>;
  mutateEntity(
    input: KnowledgeFacadeMutateInput,
  ): Promise<KnowledgeFacadeEntitySnapshot>;
}

export const KNOWLEDGE_JOB_TERMINAL_STATUSES: ReadonlySet<KnowledgeJobStatus> =
  new Set([
    "completed",
    "failed",
    "cancelled",
    "interrupted",
    "blocked_provider_unavailable",
  ]);

export function isKnowledgeJobTerminal(
  status: KnowledgeJobStatus,
): boolean {
  return KNOWLEDGE_JOB_TERMINAL_STATUSES.has(status);
}
