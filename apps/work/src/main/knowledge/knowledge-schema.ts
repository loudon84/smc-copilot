/**
 * Fail-closed schema validation for Knowledge HTTP payloads.
 * Invalid contract → KNOWLEDGE_CONTRACT_INVALID. Does not rewrite HTTP schema.
 */

import type {
  KnowledgeBaseFileSnapshot,
  KnowledgeBaseSnapshot,
  KnowledgeBaseStatus,
  KnowledgeBaseVisibility,
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
  };
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
