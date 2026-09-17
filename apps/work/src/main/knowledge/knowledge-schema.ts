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
  KnowledgeFileParseStatus,
  KnowledgeFileVersionSnapshot,
  KnowledgeIndexBuildStatus,
  KnowledgeIndexRetrievalStatus,
  KnowledgeIndexState,
  KnowledgeSourceFileStatus,
} from "../../shared/knowledge/knowledge-base-ipc";
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
