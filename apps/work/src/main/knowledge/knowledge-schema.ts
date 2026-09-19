/**
 * Fail-closed schema validation for Knowledge HTTP payloads.
 * Invalid contract → KNOWLEDGE_CONTRACT_INVALID. Does not rewrite HTTP schema.
 */

import type {
  KnowledgeBaseFileSnapshot,
  KnowledgeBaseSnapshot,
  KnowledgeBaseStatus,
  KnowledgeBaseVisibility,
  KnowledgeBuildJobSnapshot,
  KnowledgeBuildJobStatus,
  KnowledgeBuildProfileView,
  KnowledgeFileChunk,
  KnowledgeFileChunkAvailabilityResult,
  KnowledgeFileChunkPage,
  KnowledgeFileParseStatus,
  KnowledgeFileVersionSnapshot,
  KnowledgeIndexBuildStatus,
  KnowledgeIndexRetrievalStatus,
  KnowledgeIndexState,
  KnowledgeSourceFileStatus,
} from "../../shared/knowledge/knowledge-base-ipc";
import type {
  KnowledgeRetrievalProfileSnapshot,
  KnowledgeRetrievalProfileStatus,
  KnowledgeSetBoundBase,
  KnowledgeSetSnapshot,
  KnowledgeSetStatus,
  KnowledgeSetVisibility,
} from "../../shared/knowledge/knowledge-set-ipc";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";

const BASE_STATUSES: ReadonlySet<KnowledgeBaseStatus> = new Set([
  "provisioning",
  "active",
  "updating",
  "degraded",
  "error",
  "deleting",
]);

const VISIBILITIES: ReadonlySet<KnowledgeBaseVisibility> = new Set([
  "private",
  "department",
  "organization",
]);

const FILE_STATUSES: ReadonlySet<KnowledgeSourceFileStatus> = new Set([
  "pending",
  "active",
  "updating",
  "error",
  "deleting",
]);

const INGESTION_STATUSES = new Set([
  "pending",
  "uploading",
  "upload_unknown",
  "ragflow_uploaded",
  "metadata_synced",
  "parse_dispatched",
  "parsing",
  "validating",
  "active",
  "failed",
  "cancelled",
]);

function contractInvalid(operationId?: string): KnowledgeFacadeError {
  return new KnowledgeFacadeError({
    code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
    retryable: false,
    operationId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function unwrapApiData(payload: unknown, operationId?: string): unknown {
  if (!isRecord(payload)) throw contractInvalid(operationId);
  if (!("data" in payload)) return payload;
  return payload.data;
}

export function parseKnowledgeBaseSnapshot(
  raw: unknown,
  operationId?: string,
): KnowledgeBaseSnapshot {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const status = raw.status;
  const visibility = raw.visibility;
  if (
    !id ||
    !name ||
    typeof status !== "string" ||
    !BASE_STATUSES.has(status as KnowledgeBaseStatus) ||
    typeof visibility !== "string" ||
    !VISIBILITIES.has(visibility as KnowledgeBaseVisibility)
  ) {
    throw contractInvalid(operationId);
  }
  const description =
    raw.description === null || raw.description === undefined
      ? null
      : typeof raw.description === "string"
        ? raw.description
        : null;
  const snap: KnowledgeBaseSnapshot = {
    id,
    name,
    description,
    status: status as KnowledgeBaseStatus,
    visibility: visibility as KnowledgeBaseVisibility,
  };
  if (typeof raw.org_id === "string") snap.orgId = raw.org_id;
  if (typeof raw.owner_member_id === "string") {
    snap.ownerMemberId = raw.owner_member_id;
  }
  if (typeof raw.created_at === "string") snap.createdAt = raw.created_at;
  return snap;
}

export function parseKnowledgeBasePage(
  raw: unknown,
  operationId?: string,
): {
  items: KnowledgeBaseSnapshot[];
  total: number;
  page: number;
  pageSize: number;
} {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data) || !Array.isArray(data.items)) {
    throw contractInvalid(operationId);
  }
  return {
    items: data.items.map((item) => parseKnowledgeBaseSnapshot(item, operationId)),
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : data.items.length,
    page: Number.isFinite(Number(data.page)) ? Number(data.page) : 1,
    pageSize: Number.isFinite(Number(data.page_size))
      ? Number(data.page_size)
      : data.items.length,
  };
}

export function parseKnowledgeBaseFileSnapshot(
  raw: unknown,
  operationId?: string,
): KnowledgeBaseFileSnapshot {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const knowledgeBaseId =
    typeof raw.knowledge_base_id === "string" ? raw.knowledge_base_id.trim() : "";
  const fileName = typeof raw.file_name === "string" ? raw.file_name.trim() : "";
  const status = raw.status;
  if (
    !id ||
    !knowledgeBaseId ||
    !fileName ||
    typeof status !== "string" ||
    !FILE_STATUSES.has(status as KnowledgeSourceFileStatus)
  ) {
    throw contractInvalid(operationId);
  }
  return {
    id,
    knowledgeBaseId,
    fileName,
    status: status as KnowledgeSourceFileStatus,
    mimeType: typeof raw.mime_type === "string" ? raw.mime_type : null,
    lastError: typeof raw.last_error === "string" ? raw.last_error : null,
    activeVersionId:
      typeof raw.active_version_id === "string" ? raw.active_version_id : null,
    archivedAt: typeof raw.archived_at === "string" ? raw.archived_at : null,
    ownerMemberId:
      typeof raw.owner_member_id === "string" ? raw.owner_member_id : null,
    createdAt: typeof raw.created_at === "string" ? raw.created_at : null,
  };
}

const PARSE_STATUSES: ReadonlySet<KnowledgeFileParseStatus> = new Set([
  "pending",
  "parsing",
  "active",
  "failed",
  "superseded",
]);

const BUILD_STATUSES: ReadonlySet<KnowledgeIndexBuildStatus> = new Set([
  "not_built",
  "building",
  "ready",
  "stale",
  "failed",
  "unsupported",
]);

const RETRIEVAL_STATUSES: ReadonlySet<KnowledgeIndexRetrievalStatus> = new Set([
  "unavailable",
  "ready",
  "degraded",
  "unsupported",
]);

const BUILD_JOB_STATUSES: ReadonlySet<KnowledgeBuildJobStatus> = new Set([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export function parseKnowledgeFileVersionSnapshot(
  raw: unknown,
  operationId?: string,
): KnowledgeFileVersionSnapshot {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const sourceFileId =
    typeof raw.source_file_id === "string" ? raw.source_file_id.trim() : "";
  const versionNo = Number(raw.version_no);
  const parseStatus = raw.parse_status;
  if (
    !id ||
    !sourceFileId ||
    !Number.isFinite(versionNo) ||
    typeof parseStatus !== "string" ||
    !PARSE_STATUSES.has(parseStatus as KnowledgeFileParseStatus)
  ) {
    throw contractInvalid(operationId);
  }
  return {
    id,
    sourceFileId,
    versionNo,
    parseStatus: parseStatus as KnowledgeFileParseStatus,
    createdAt: typeof raw.created_at === "string" ? raw.created_at : null,
    uploadedByMemberId:
      typeof raw.uploaded_by_member_id === "string"
        ? raw.uploaded_by_member_id
        : null,
  };
}

export function parseKnowledgeFileVersionList(
  raw: unknown,
  operationId?: string,
): KnowledgeFileVersionSnapshot[] {
  const data = unwrapApiData(raw, operationId);
  const items = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : null;
  if (!items) throw contractInvalid(operationId);
  return items.map((item) => parseKnowledgeFileVersionSnapshot(item, operationId));
}

export function parseKnowledgeIndexStates(
  raw: unknown,
  operationId?: string,
): KnowledgeIndexState[] {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data)) throw contractInvalid(operationId);
  const states: KnowledgeIndexState[] = [];
  for (const [indexType, value] of Object.entries(data)) {
    if (!isRecord(value)) throw contractInvalid(operationId);
    const buildStatus = value.build_status;
    const retrievalStatus = value.retrieval_status;
    if (
      typeof buildStatus !== "string" ||
      !BUILD_STATUSES.has(buildStatus as KnowledgeIndexBuildStatus) ||
      typeof retrievalStatus !== "string" ||
      !RETRIEVAL_STATUSES.has(retrievalStatus as KnowledgeIndexRetrievalStatus)
    ) {
      throw contractInvalid(operationId);
    }
    states.push({
      indexType,
      buildStatus: buildStatus as KnowledgeIndexBuildStatus,
      retrievalStatus: retrievalStatus as KnowledgeIndexRetrievalStatus,
    });
  }
  return states;
}

export function parseKnowledgeBuildProfileView(
  raw: unknown,
  operationId?: string,
): KnowledgeBuildProfileView {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data) || !isRecord(data.resolved_profile)) {
    throw contractInvalid(operationId);
  }
  const profile = data.resolved_profile;
  const profileId = typeof profile.id === "string" ? profile.id.trim() : "";
  const profileName = typeof profile.name === "string" ? profile.name.trim() : "";
  if (!profileId || !profileName) throw contractInvalid(operationId);
  return {
    activeBuildProfileId:
      typeof data.active_build_profile_id === "string"
        ? data.active_build_profile_id
        : null,
    profileId,
    profileName,
  };
}

export function parseKnowledgeBuildJobSnapshot(
  raw: unknown,
  operationId?: string,
): KnowledgeBuildJobSnapshot {
  const data = unwrapApiData(raw, operationId);
  const job = isRecord(data) && isRecord(data.jobs) === false && Array.isArray(data.jobs)
    ? data.jobs[0]
    : data;
  if (!isRecord(job)) throw contractInvalid(operationId);
  const id = typeof job.id === "string" ? job.id.trim() : "";
  const status = job.status;
  const progress = Number(job.progress);
  if (
    !id ||
    typeof status !== "string" ||
    !BUILD_JOB_STATUSES.has(status as KnowledgeBuildJobStatus) ||
    !Number.isFinite(progress)
  ) {
    throw contractInvalid(operationId);
  }
  return {
    id,
    status: status as KnowledgeBuildJobStatus,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    errorCode: typeof job.error_code === "string" ? job.error_code : null,
    knowledgeBaseId:
      typeof job.knowledge_base_id === "string" ? job.knowledge_base_id : null,
  };
}

export function parseKnowledgeBuildJobList(
  raw: unknown,
  operationId?: string,
): KnowledgeBuildJobSnapshot[] {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data) || !Array.isArray(data.jobs)) {
    throw contractInvalid(operationId);
  }
  return data.jobs.map((item) => parseKnowledgeBuildJobSnapshot(item, operationId));
}

export function parseKnowledgeBaseFilePage(
  raw: unknown,
  operationId?: string,
): {
  items: KnowledgeBaseFileSnapshot[];
  total: number;
  page: number;
  pageSize: number;
} {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data) || !Array.isArray(data.items)) {
    throw contractInvalid(operationId);
  }
  return {
    items: data.items.map((item) =>
      parseKnowledgeBaseFileSnapshot(item, operationId),
    ),
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : data.items.length,
    page: Number.isFinite(Number(data.page)) ? Number(data.page) : 1,
    pageSize: Number.isFinite(Number(data.page_size))
      ? Number(data.page_size)
      : data.items.length,
  };
}

export interface ParsedIngestionJob {
  id: string;
  sourceFileId: string;
  status: string;
  progress: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ParsedUploadAccepted {
  sourceFileId: string;
  fileVersionId: string;
  job: ParsedIngestionJob;
}

export function parseIngestionJob(
  raw: unknown,
  operationId?: string,
): ParsedIngestionJob {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const sourceFileId =
    typeof raw.source_file_id === "string" ? raw.source_file_id.trim() : "";
  const status = typeof raw.status === "string" ? raw.status : "";
  if (!id || !sourceFileId || !INGESTION_STATUSES.has(status)) {
    throw contractInvalid(operationId);
  }
  return {
    id,
    sourceFileId,
    status,
    progress: Number.isFinite(Number(raw.progress)) ? Number(raw.progress) : 0,
    errorCode: typeof raw.error_code === "string" ? raw.error_code : null,
    errorMessage: typeof raw.error_message === "string" ? raw.error_message : null,
  };
}

export function parseUploadAccepted(
  raw: unknown,
  operationId?: string,
): ParsedUploadAccepted {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data)) throw contractInvalid(operationId);
  const sourceFile = data.source_file;
  const fileVersionId =
    typeof data.file_version_id === "string" ? data.file_version_id.trim() : "";
  if (!isRecord(sourceFile) || typeof sourceFile.id !== "string" || !fileVersionId) {
    throw contractInvalid(operationId);
  }
  return {
    sourceFileId: sourceFile.id,
    fileVersionId,
    job: parseIngestionJob(data.job, operationId),
  };
}

export function parseErrorEnvelope(raw: unknown): {
  messageKey?: string;
  details?: Record<string, unknown>;
} {
  if (!isRecord(raw)) return {};
  return {
    messageKey: typeof raw.message_key === "string" ? raw.message_key : undefined,
    details: isRecord(raw.details) ? raw.details : undefined,
  };
}

const SET_STATUSES: ReadonlySet<KnowledgeSetStatus> = new Set([
  "active",
  "disabled",
]);

const SET_VISIBILITIES: ReadonlySet<KnowledgeSetVisibility> = new Set([
  "private",
  "department",
  "organization",
]);

const PROFILE_STATUSES: ReadonlySet<KnowledgeRetrievalProfileStatus> = new Set([
  "draft",
  "active",
  "archived",
]);

function parseBoundBase(
  raw: unknown,
  operationId?: string,
): KnowledgeSetBoundBase {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const knowledgeBaseId =
    typeof raw.knowledge_base_id === "string" ? raw.knowledge_base_id.trim() : "";
  if (!knowledgeBaseId) throw contractInvalid(operationId);
  const bound: KnowledgeSetBoundBase = { knowledgeBaseId };
  if (typeof raw.name === "string") bound.name = raw.name;
  if (Number.isFinite(Number(raw.weight))) bound.weight = Number(raw.weight);
  return bound;
}

export function parseKnowledgeSetSnapshot(
  raw: unknown,
  operationId?: string,
): KnowledgeSetSnapshot {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const status = raw.status;
  const visibility = raw.visibility;
  if (
    !id ||
    !name ||
    typeof status !== "string" ||
    !SET_STATUSES.has(status as KnowledgeSetStatus) ||
    typeof visibility !== "string" ||
    !SET_VISIBILITIES.has(visibility as KnowledgeSetVisibility)
  ) {
    throw contractInvalid(operationId);
  }
  const description =
    raw.description === null || raw.description === undefined
      ? null
      : typeof raw.description === "string"
        ? raw.description
        : null;
  const knowledgeBases = Array.isArray(raw.knowledge_bases)
    ? raw.knowledge_bases.map((item) => parseBoundBase(item, operationId))
    : [];
  const snap: KnowledgeSetSnapshot = {
    id,
    name,
    description,
    status: status as KnowledgeSetStatus,
    visibility: visibility as KnowledgeSetVisibility,
    usageCount: Number.isFinite(Number(raw.usage_count))
      ? Number(raw.usage_count)
      : 0,
    knowledgeBases,
  };
  if (typeof raw.owner_member_id === "string") {
    snap.ownerMemberId = raw.owner_member_id;
  }
  if (typeof raw.last_used_at === "string") snap.lastUsedAt = raw.last_used_at;
  return snap;
}

export function parseKnowledgeSetPage(
  raw: unknown,
  operationId?: string,
): {
  items: KnowledgeSetSnapshot[];
  total: number;
  page: number;
  pageSize: number;
} {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data) || !Array.isArray(data.items)) {
    throw contractInvalid(operationId);
  }
  return {
    items: data.items.map((item) => parseKnowledgeSetSnapshot(item, operationId)),
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : data.items.length,
    page: Number.isFinite(Number(data.page)) ? Number(data.page) : 1,
    pageSize: Number.isFinite(Number(data.page_size))
      ? Number(data.page_size)
      : data.items.length,
  };
}

export function parseKnowledgeRetrievalProfileSnapshot(
  raw: unknown,
  operationId?: string,
): KnowledgeRetrievalProfileSnapshot {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const knowledgeSetId =
    typeof raw.knowledge_set_id === "string" ? raw.knowledge_set_id.trim() : "";
  const version = Number(raw.version);
  const status = raw.status;
  if (
    !id ||
    !knowledgeSetId ||
    !Number.isFinite(version) ||
    typeof status !== "string" ||
    !PROFILE_STATUSES.has(status as KnowledgeRetrievalProfileStatus) ||
    !isRecord(raw.config)
  ) {
    throw contractInvalid(operationId);
  }
  const snap: KnowledgeRetrievalProfileSnapshot = {
    id,
    knowledgeSetId,
    version,
    config: { ...raw.config },
    status: status as KnowledgeRetrievalProfileStatus,
  };
  if (typeof raw.created_by_member_id === "string") {
    snap.createdByMemberId = raw.created_by_member_id;
  }
  if (typeof raw.created_at === "string") snap.createdAt = raw.created_at;
  if (typeof raw.updated_at === "string") snap.updatedAt = raw.updated_at;
  if (typeof raw.activated_at === "string") snap.activatedAt = raw.activated_at;
  return snap;
}

export function parseKnowledgeRetrievalProfileList(
  raw: unknown,
  operationId?: string,
): KnowledgeRetrievalProfileSnapshot[] {
  const data = unwrapApiData(raw, operationId);
  const items = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : null;
  if (!items) throw contractInvalid(operationId);
  return items.map((item) =>
    parseKnowledgeRetrievalProfileSnapshot(item, operationId),
  );
}

function parseStringArray(value: unknown, operationId?: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw contractInvalid(operationId);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw contractInvalid(operationId);
    out.push(item);
  }
  return out;
}

/** Fail-closed Chunk item — strips provider-only fields by omission. */
export function parseKnowledgeFileChunk(
  raw: unknown,
  operationId?: string,
): KnowledgeFileChunk {
  if (!isRecord(raw)) throw contractInvalid(operationId);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id || typeof raw.content !== "string") {
    throw contractInvalid(operationId);
  }
  if (
    !(
      raw.available === null ||
      typeof raw.available === "boolean"
    )
  ) {
    throw contractInvalid(operationId);
  }
  const positions =
    raw.positions == null
      ? null
      : Array.isArray(raw.positions)
        ? raw.positions
        : (() => {
            throw contractInvalid(operationId);
          })();
  return {
    id,
    content: raw.content,
    available: raw.available,
    positions,
    importantKeywords: parseStringArray(raw.important_keywords, operationId),
    questions: parseStringArray(raw.questions, operationId),
  };
}

export function parseKnowledgeFileChunkPage(
  raw: unknown,
  operationId?: string,
): KnowledgeFileChunkPage {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data) || !Array.isArray(data.items)) {
    throw contractInvalid(operationId);
  }
  const sourceFileId =
    typeof data.source_file_id === "string" ? data.source_file_id.trim() : "";
  const fileVersionId =
    typeof data.file_version_id === "string" ? data.file_version_id.trim() : "";
  const total = Number(data.total);
  const page = Number(data.page);
  const pageSize = Number(data.page_size);
  if (
    !sourceFileId ||
    !fileVersionId ||
    !Number.isInteger(total) ||
    total < 0 ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw contractInvalid(operationId);
  }
  return {
    sourceFileId,
    fileVersionId,
    items: data.items.map((item) => parseKnowledgeFileChunk(item, operationId)),
    total,
    page,
    pageSize,
  };
}

export function parseKnowledgeFileChunkAvailabilityResult(
  raw: unknown,
  operationId?: string,
): KnowledgeFileChunkAvailabilityResult {
  const data = unwrapApiData(raw, operationId);
  if (!isRecord(data)) throw contractInvalid(operationId);
  const sourceFileId =
    typeof data.source_file_id === "string" ? data.source_file_id.trim() : "";
  const fileVersionId =
    typeof data.file_version_id === "string" ? data.file_version_id.trim() : "";
  const chunkId = typeof data.chunk_id === "string" ? data.chunk_id.trim() : "";
  if (
    !sourceFileId ||
    !fileVersionId ||
    !chunkId ||
    typeof data.available !== "boolean"
  ) {
    throw contractInvalid(operationId);
  }
  return {
    sourceFileId,
    fileVersionId,
    chunkId,
    available: data.available,
  };
}
