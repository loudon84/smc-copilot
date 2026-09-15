/**
 * Sanitized Knowledge Upload Job IPC contract (Renderer ↔ Main).
 * No Electron / React imports. Never carry tokens, absolute paths, or provider raw errors.
 */

export const KNOWLEDGE_BASE_ID_UNBOUND = "unbound" as const;

/** Stage statuses. Never mint `completed` without a real provider. */
export type KnowledgeJobStatus =
  | "draft"
  | "queued"
  | "uploading"
  | "processing"
  | "interrupted"
  | "failed"
  | "cancelled"
  | "blocked_provider_unavailable";

export type KnowledgeTenantScope =
  | { kind: "tenant"; tenantId: string }
  | { kind: "personal" };

export interface KnowledgeJobPartition {
  workProfileId: string;
  authSubject: string;
  tenantScope: KnowledgeTenantScope;
}

export interface KnowledgeJobSnapshot {
  jobId: string;
  knowledgeBaseId: string;
  status: KnowledgeJobStatus;
  attempt: number;
  partition: KnowledgeJobPartition;
  errorCode?: string;
  updatedAt: string;
}

export type KnowledgeCapabilityStatus =
  | "available"
  | "blocked_provider_unavailable";

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

export const KNOWLEDGE_JOB_IPC_CHANNELS = {
  createDraft: "knowledge-job:create-draft",
  getSnapshot: "knowledge-job:get-snapshot",
  listSnapshots: "knowledge-job:list-snapshots",
  cancel: "knowledge-job:cancel",
  retry: "knowledge-job:retry",
  getCapability: "knowledge-job:get-capability",
  snapshotChanged: "knowledge-job:snapshot-changed",
} as const;

export type KnowledgeJobIpcChannel =
  (typeof KNOWLEDGE_JOB_IPC_CHANNELS)[keyof typeof KNOWLEDGE_JOB_IPC_CHANNELS];

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

export const KNOWLEDGE_JOB_TERMINAL_STATUSES: ReadonlySet<KnowledgeJobStatus> =
  new Set([
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
