/**
 * Typed Knowledge Base IPC (Renderer ↔ Main).
 * Maps knowledge-frontend-contract v1.0.0 Base/File/Ingestion types.
 * Never carry tokens, absolute paths, or localized server `message`.
 */

export const KNOWLEDGE_BASE_IPC_CHANNELS = {
  list: "knowledge-base:list",
  get: "knowledge-base:get",
  create: "knowledge-base:create",
  update: "knowledge-base:update",
  delete: "knowledge-base:delete",
  listFiles: "knowledge-base:list-files",
  getFile: "knowledge-base:get-file",
  listFileVersions: "knowledge-base:list-file-versions",
  addFileVersion: "knowledge-base:add-file-version",
  activateFileVersion: "knowledge-base:activate-file-version",
  archiveFile: "knowledge-base:archive-file",
  unarchiveFile: "knowledge-base:unarchive-file",
  reparseFile: "knowledge-base:reparse-file",
  deleteFile: "knowledge-base:delete-file",
  resolveDocumentPreview: "knowledge-base:resolve-document-preview",
  listIndexes: "knowledge-base:list-indexes",
  getBuildProfile: "knowledge-base:get-build-profile",
  updateBuildProfile: "knowledge-base:update-build-profile",
  startBuild: "knowledge-base:start-build",
  getBuild: "knowledge-base:get-build",
  retryBuild: "knowledge-base:retry-build",
  watchBuild: "knowledge-base:watch-build",
  unwatchBuild: "knowledge-base:unwatch-build",
  buildChanged: "knowledge-base:build-changed",
  listFileChunks: "knowledge-base:list-file-chunks",
  setFileChunkAvailability: "knowledge-base:set-file-chunk-availability",
  getFileChunkImage: "knowledge-base:get-file-chunk-image",
} as const;

export type KnowledgeBaseIpcChannel =
  (typeof KNOWLEDGE_BASE_IPC_CHANNELS)[keyof typeof KNOWLEDGE_BASE_IPC_CHANNELS];

export type KnowledgeBaseStatus =
  | "provisioning"
  | "active"
  | "updating"
  | "degraded"
  | "error"
  | "deleting";

export type KnowledgeBaseVisibility = "private" | "department" | "organization";

export type KnowledgeSourceFileStatus =
  | "pending"
  | "active"
  | "updating"
  | "error"
  | "deleting";

export interface KnowledgeBaseSnapshot {
  id: string;
  name: string;
  description: string | null;
  status: KnowledgeBaseStatus;
  visibility: KnowledgeBaseVisibility;
  orgId?: string;
  ownerMemberId?: string;
  createdAt?: string | null;
}

export interface KnowledgeBasePage {
  items: KnowledgeBaseSnapshot[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeBaseListInput {
  page?: number;
  pageSize?: number;
  visibility?: KnowledgeBaseVisibility;
  q?: string;
}

export interface KnowledgeBaseGetInput {
  knowledgeBaseId: string;
}

export interface KnowledgeBaseCreateInput {
  name: string;
  description?: string | null;
  visibility?: KnowledgeBaseVisibility;
}

export interface KnowledgeBaseUpdateInput {
  knowledgeBaseId: string;
  name?: string;
  description?: string | null;
  visibility?: KnowledgeBaseVisibility;
}

export interface KnowledgeBaseDeleteInput {
  knowledgeBaseId: string;
}

export interface KnowledgeBaseListFilesInput {
  knowledgeBaseId: string;
  page?: number;
  pageSize?: number;
}

export interface KnowledgeBaseFileSnapshot {
  id: string;
  knowledgeBaseId: string;
  fileName: string;
  status: KnowledgeSourceFileStatus;
  mimeType?: string | null;
  lastError?: string | null;
  activeVersionId?: string | null;
  archivedAt?: string | null;
  ownerMemberId?: string | null;
  createdAt?: string | null;
}

export type KnowledgeFileParseStatus =
  | "pending"
  | "parsing"
  | "active"
  | "failed"
  | "superseded";

export interface KnowledgeFileVersionSnapshot {
  id: string;
  sourceFileId: string;
  versionNo: number;
  parseStatus: KnowledgeFileParseStatus;
  createdAt?: string | null;
  uploadedByMemberId?: string | null;
}

export interface KnowledgeFileIdInput {
  sourceFileId: string;
}

export interface KnowledgeResolveDocumentPreviewInput {
  sourceFileId: string;
  activeVersionId?: string | null;
  forceRefresh?: boolean;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface KnowledgeResolveDocumentPreviewResult {
  managedFileId: string;
}

export interface KnowledgeActivateFileVersionInput {
  sourceFileId: string;
  versionId: string;
}

export interface KnowledgeAddFileVersionInput {
  sourceFileId: string;
  managedFileId: string;
}

export type KnowledgeIndexBuildStatus =
  | "not_built"
  | "building"
  | "ready"
  | "stale"
  | "failed"
  | "unsupported";

export type KnowledgeIndexRetrievalStatus =
  | "unavailable"
  | "ready"
  | "degraded"
  | "unsupported";

export interface KnowledgeIndexState {
  indexType: string;
  buildStatus: KnowledgeIndexBuildStatus;
  retrievalStatus: KnowledgeIndexRetrievalStatus;
}

export function isKnowledgeIndexRetrievalReady(
  state: KnowledgeIndexState,
): boolean {
  return state.buildStatus === "ready" && state.retrievalStatus === "ready";
}

export interface KnowledgeBuildProfileView {
  activeBuildProfileId: string | null;
  profileId: string;
  profileName: string;
}

export interface KnowledgeUpdateBuildProfileInput {
  knowledgeBaseId: string;
  buildProfileId: string;
}

export interface KnowledgeStartBuildInput {
  knowledgeBaseId: string;
  indexTypes: string[];
  force?: boolean;
}

export interface KnowledgeBuildIdInput {
  buildId: string;
}

export type KnowledgeBuildJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface KnowledgeBuildJobSnapshot {
  id: string;
  status: KnowledgeBuildJobStatus;
  progress: number;
  errorCode?: string | null;
  knowledgeBaseId?: string | null;
}

export const KNOWLEDGE_BUILD_TERMINAL_STATUSES: ReadonlySet<KnowledgeBuildJobStatus> =
  new Set(["completed", "partial", "failed", "cancelled"]);

export function isKnowledgeBuildJobTerminal(
  status: KnowledgeBuildJobStatus,
): boolean {
  return KNOWLEDGE_BUILD_TERMINAL_STATUSES.has(status);
}

export interface KnowledgeBaseFilePage {
  items: KnowledgeBaseFileSnapshot[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeFacadeErrorShape {
  code: string;
  httpStatus?: number;
  messageKey?: string;
  retryable: boolean;
  operationId: string;
}

export const KNOWLEDGE_ERROR_CODES = {
  CONTRACT_INVALID: "KNOWLEDGE_CONTRACT_INVALID",
  AUTH_REQUIRED: "KNOWLEDGE_AUTH_REQUIRED",
  FORBIDDEN: "KNOWLEDGE_FORBIDDEN",
  NOT_FOUND: "KNOWLEDGE_NOT_FOUND",
  CONFLICT: "KNOWLEDGE_CONFLICT",
  UNAVAILABLE: "KNOWLEDGE_UNAVAILABLE",
  TIMEOUT: "KNOWLEDGE_TIMEOUT",
  MODE_ERROR: "KNOWLEDGE_MODE_ERROR",
  JOB_TARGET_MISMATCH: "KNOWLEDGE_JOB_TARGET_MISMATCH",
  JOB_FILE_MISSING: "KNOWLEDGE_JOB_FILE_MISSING",
  PREVIEW_TOO_LARGE: "KNOWLEDGE_PREVIEW_TOO_LARGE",
} as const;

export function isKnowledgeFacadeErrorShape(
  value: unknown,
): value is KnowledgeFacadeErrorShape {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.code === "string" &&
    typeof rec.retryable === "boolean" &&
    typeof rec.operationId === "string"
  );
}

/** Chunk Thin Gateway item (public DTO — no provider runtime IDs). */
export interface KnowledgeFileChunk {
  id: string;
  content: string;
  available: boolean | null;
  positions: unknown[] | null;
  importantKeywords: string[];
  questions: string[];
  /** True when provider advertises an image for this chunk; missing wire field → false. */
  hasImage: boolean;
}

export interface KnowledgeFileChunkPage {
  sourceFileId: string;
  fileVersionId: string;
  items: KnowledgeFileChunk[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeListFileChunksInput {
  sourceFileId: string;
  page?: number;
  pageSize?: number;
  keywords?: string;
}

export interface KnowledgeSetFileChunkAvailabilityInput {
  sourceFileId: string;
  chunkId: string;
  fileVersionId: string;
  available: boolean;
}

export interface KnowledgeFileChunkAvailabilityResult {
  sourceFileId: string;
  fileVersionId: string;
  chunkId: string;
  available: boolean;
}

export interface KnowledgeGetFileChunkImageInput {
  sourceFileId: string;
  chunkId: string;
  fileVersionId: string;
}

export interface KnowledgeFileChunkImageResult {
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Structured IPC envelope for Chunk channels only.
 * Non-Chunk Knowledge IPC continues to throw Error(code).
 */
export type KnowledgeChunkIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: KnowledgeFacadeErrorShape };

export function isKnowledgeChunkIpcResult<T = unknown>(
  value: unknown,
): value is KnowledgeChunkIpcResult<T> {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  if (rec.ok === true) return "data" in rec;
  if (rec.ok === false) return isKnowledgeFacadeErrorShape(rec.error);
  return false;
}

export type KnowledgeBaseMutationAction = "save" | "upload" | "delete";

export function knowledgeBaseActionAllowed(
  status: KnowledgeBaseStatus | undefined,
  action: KnowledgeBaseMutationAction,
): boolean {
  switch (status) {
    case "active":
    case "degraded":
      return true;
    case "error":
      return action !== "upload";
    case "provisioning":
    case "updating":
    case "deleting":
    default:
      return false;
  }
}

export interface HermesKnowledgeBasesAPI {
  list(input?: KnowledgeBaseListInput): Promise<KnowledgeBasePage>;
  get(input: KnowledgeBaseGetInput): Promise<KnowledgeBaseSnapshot>;
  create(input: KnowledgeBaseCreateInput): Promise<KnowledgeBaseSnapshot>;
  update(input: KnowledgeBaseUpdateInput): Promise<KnowledgeBaseSnapshot>;
  delete(input: KnowledgeBaseDeleteInput): Promise<void>;
  listFiles(input: KnowledgeBaseListFilesInput): Promise<KnowledgeBaseFilePage>;
  getFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  listFileVersions(
    input: KnowledgeFileIdInput,
  ): Promise<KnowledgeFileVersionSnapshot[]>;
  addFileVersion(
    input: KnowledgeAddFileVersionInput,
  ): Promise<KnowledgeBaseFileSnapshot>;
  activateFileVersion(
    input: KnowledgeActivateFileVersionInput,
  ): Promise<KnowledgeBaseFileSnapshot>;
  archiveFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  unarchiveFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  reparseFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  deleteFile(input: KnowledgeFileIdInput): Promise<void>;
  resolveDocumentPreview(
    input: KnowledgeResolveDocumentPreviewInput,
  ): Promise<KnowledgeResolveDocumentPreviewResult>;
  listIndexes(input: KnowledgeBaseGetInput): Promise<KnowledgeIndexState[]>;
  getBuildProfile(
    input: KnowledgeBaseGetInput,
  ): Promise<KnowledgeBuildProfileView>;
  updateBuildProfile(
    input: KnowledgeUpdateBuildProfileInput,
  ): Promise<KnowledgeBuildProfileView>;
  startBuild(input: KnowledgeStartBuildInput): Promise<KnowledgeBuildJobSnapshot>;
  getBuild(input: KnowledgeBuildIdInput): Promise<KnowledgeBuildJobSnapshot>;
  retryBuild(input: KnowledgeBuildIdInput): Promise<KnowledgeBuildJobSnapshot>;
  watchBuild(input: KnowledgeBuildIdInput): Promise<KnowledgeBuildJobSnapshot>;
  unwatchBuild(input?: KnowledgeBuildIdInput): Promise<void>;
  onBuildChanged(
    callback: (snapshot: KnowledgeBuildJobSnapshot) => void,
  ): () => void;
  listFileChunks(
    input: KnowledgeListFileChunksInput,
  ): Promise<KnowledgeFileChunkPage>;
  setFileChunkAvailability(
    input: KnowledgeSetFileChunkAvailabilityInput,
  ): Promise<KnowledgeFileChunkAvailabilityResult>;
  getFileChunkImage(
    input: KnowledgeGetFileChunkImageInput,
  ): Promise<KnowledgeFileChunkImageResult>;
}
