/**
 * Main Knowledge HTTP provider — contract paths only.
 * Schema-validate before handing results to features. Fail-closed; never mock.
 */

import { randomUUID } from "crypto";
import { AccessTokenError } from "../auth/ensure-access-token";
import { AuthorizedBackendTransportError } from "../auth/authorized-backend-transport";
import { resolveKnowledgeServiceUrl } from "./knowledge-service-url";
import type {
  KnowledgeActivateFileVersionInput,
  KnowledgeBaseCreateInput,
  KnowledgeBaseDeleteInput,
  KnowledgeBaseFilePage,
  KnowledgeBaseFileSnapshot,
  KnowledgeBaseGetInput,
  KnowledgeBaseListFilesInput,
  KnowledgeBaseListInput,
  KnowledgeBasePage,
  KnowledgeBaseSnapshot,
  KnowledgeBaseUpdateInput,
  KnowledgeBuildIdInput,
  KnowledgeBuildJobSnapshot,
  KnowledgeBuildProfileView,
  KnowledgeFileChunkAvailabilityResult,
  KnowledgeFileChunkImageResult,
  KnowledgeFileChunkPage,
  KnowledgeFileIdInput,
  KnowledgeFileVersionSnapshot,
  KnowledgeGetFileChunkImageInput,
  KnowledgeIndexState,
  KnowledgeListFileChunksInput,
  KnowledgeSetFileChunkAvailabilityInput,
  KnowledgeStartBuildInput,
  KnowledgeUpdateBuildProfileInput,
} from "../../shared/knowledge/knowledge-base-ipc";
import type {
  KnowledgeProfileIdInput,
  KnowledgeRetrievalProfileSnapshot,
  KnowledgeSetBindBaseInput,
  KnowledgeSetCreateInput,
  KnowledgeSetCreateProfileInput,
  KnowledgeSetGetInput,
  KnowledgeSetListInput,
  KnowledgeSetListProfilesInput,
  KnowledgeSetPage,
  KnowledgeSetRollbackProfileInput,
  KnowledgeSetSnapshot,
  KnowledgeSetUnbindBaseInput,
  KnowledgeSetUpdateInput,
  KnowledgeSetUpdateProfileInput,
} from "../../shared/knowledge/knowledge-set-ipc";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import {
  KnowledgeFacadeError,
  mapHttpStatusToKnowledgeError,
} from "../../shared/knowledge/knowledge-errors";
import {
  createKnowledgeAuthorizedTransport,
  type KnowledgeAuthorizedTransport,
} from "./knowledge-authorized-transport";
import {
  parseErrorEnvelope,
  parseIngestionJob,
  parseKnowledgeBaseFilePage,
  parseKnowledgeBaseFileSnapshot,
  parseKnowledgeBasePage,
  parseKnowledgeBaseSnapshot,
  parseKnowledgeBuildJobList,
  parseKnowledgeBuildJobSnapshot,
  parseKnowledgeBuildProfileView,
  parseKnowledgeFileChunkAvailabilityResult,
  parseKnowledgeFileChunkImageResult,
  parseKnowledgeFileChunkPage,
  parseKnowledgeFileVersionList,
  parseKnowledgeIndexStates,
  parseKnowledgeRetrievalProfileList,
  parseKnowledgeRetrievalProfileSnapshot,
  parseKnowledgeSetPage,
  parseKnowledgeSetSnapshot,
  parseUploadAccepted,
  type ParsedIngestionJob,
  type ParsedUploadAccepted,
} from "./knowledge-schema";

export type KnowledgeHttpProvider = {
  listBases(input?: KnowledgeBaseListInput): Promise<KnowledgeBasePage>;
  getBase(input: KnowledgeBaseGetInput): Promise<KnowledgeBaseSnapshot>;
  createBase(input: KnowledgeBaseCreateInput): Promise<KnowledgeBaseSnapshot>;
  updateBase(input: KnowledgeBaseUpdateInput): Promise<KnowledgeBaseSnapshot>;
  deleteBase(input: KnowledgeBaseDeleteInput): Promise<void>;
  listBaseFiles(input: KnowledgeBaseListFilesInput): Promise<KnowledgeBaseFilePage>;
  uploadBaseFile(input: {
    knowledgeBaseId: string;
    fileName: string;
    bytes: Uint8Array;
    mimeType?: string;
  }): Promise<ParsedUploadAccepted>;
  getIngestionJob(jobId: string): Promise<ParsedIngestionJob>;
  retryIngestionJob(jobId: string): Promise<ParsedIngestionJob>;
  cancelIngestionJob(jobId: string): Promise<ParsedIngestionJob>;
  getFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  listFileVersions(
    input: KnowledgeFileIdInput,
  ): Promise<KnowledgeFileVersionSnapshot[]>;
  addFileVersion(input: {
    sourceFileId: string;
    fileName: string;
    bytes: Uint8Array;
    mimeType?: string;
  }): Promise<ParsedUploadAccepted>;
  activateFileVersion(
    input: KnowledgeActivateFileVersionInput,
  ): Promise<KnowledgeBaseFileSnapshot>;
  archiveFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  unarchiveFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  reparseFile(input: KnowledgeFileIdInput): Promise<KnowledgeBaseFileSnapshot>;
  deleteFile(input: KnowledgeFileIdInput): Promise<void>;
  /**
   * F10 download — DH-01: response bytes are the current active version.
   * Main-only; never expose token/path to Renderer.
   */
  downloadSourceFile(input: KnowledgeFileIdInput): Promise<{
    bytes: Uint8Array;
    fileName?: string;
  }>;
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
  listSets(input?: KnowledgeSetListInput): Promise<KnowledgeSetPage>;
  getSet(input: KnowledgeSetGetInput): Promise<KnowledgeSetSnapshot>;
  createSet(input: KnowledgeSetCreateInput): Promise<KnowledgeSetSnapshot>;
  updateSet(input: KnowledgeSetUpdateInput): Promise<KnowledgeSetSnapshot>;
  bindSetBase(input: KnowledgeSetBindBaseInput): Promise<KnowledgeSetSnapshot>;
  unbindSetBase(input: KnowledgeSetUnbindBaseInput): Promise<KnowledgeSetSnapshot>;
  listRetrievalProfiles(
    input: KnowledgeSetListProfilesInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot[]>;
  createRetrievalProfile(
    input: KnowledgeSetCreateProfileInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  getRetrievalProfile(
    input: KnowledgeProfileIdInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  updateRetrievalProfile(
    input: KnowledgeSetUpdateProfileInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  publishRetrievalProfile(
    input: KnowledgeProfileIdInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  rollbackRetrievalProfile(
    input: KnowledgeSetRollbackProfileInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  probeCapability(): Promise<{
    available: boolean;
    status: "available" | "blocked_provider_unavailable" | "auth_required";
  }>;
  listFileChunks(
    input: KnowledgeListFileChunksInput,
  ): Promise<KnowledgeFileChunkPage>;
  setFileChunkAvailability(
    input: KnowledgeSetFileChunkAvailabilityInput,
  ): Promise<KnowledgeFileChunkAvailabilityResult>;
  getFileChunkImage(
    input: KnowledgeGetFileChunkImageInput,
  ): Promise<KnowledgeFileChunkImageResult>;
};

function logSanitized(
  operationId: string,
  stage: string,
  code: string,
): void {
  let origin = "unknown";
  try {
    origin = new URL(resolveKnowledgeServiceUrl()).origin;
  } catch {
    origin = "invalid";
  }
  console.info("[knowledge-http]", { operationId, stage, code, origin });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _malformed: true };
  }
}

function mapTransportError(
  err: unknown,
  operationId: string,
): KnowledgeFacadeError {
  if (err instanceof KnowledgeFacadeError) return err;
  if (err instanceof AccessTokenError) {
    return mapHttpStatusToKnowledgeError(401, undefined, operationId);
  }
  if (err instanceof AuthorizedBackendTransportError) {
    if (err.errorCode === "UNAUTHORIZED") {
      return mapHttpStatusToKnowledgeError(401, undefined, operationId);
    }
    if (err.errorCode === "FETCH_ABORTED") {
      return mapHttpStatusToKnowledgeError(0, undefined, operationId);
    }
    if (err.status > 0) {
      const envelope = parseErrorEnvelope(err.body);
      return mapHttpStatusToKnowledgeError(
        err.status,
        envelope.messageKey,
        operationId,
      );
    }
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
      retryable: true,
      operationId,
    });
  }
  return new KnowledgeFacadeError({
    code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
    retryable: true,
    operationId,
  });
}

export function createKnowledgeHttpProvider(
  transport: KnowledgeAuthorizedTransport = createKnowledgeAuthorizedTransport(),
): KnowledgeHttpProvider {
  async function requestJson(
    path: string,
    init: RequestInit & { idempotencyKey?: string },
    operationId: string,
    stage: string,
    _options: { allowNonIdempotentRetry?: boolean } = {},
  ): Promise<{ status: number; body: unknown }> {
    try {
      const response = await transport.withAuthRetry(() =>
        transport.authorizedFetch(path, init),
      );
      const body = await readJson(response);
      if (!response.ok) {
        if (body && typeof body === "object" && "_malformed" in body) {
          const err = new KnowledgeFacadeError({
            code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
            httpStatus: response.status,
            retryable: false,
            operationId,
          });
          logSanitized(operationId, stage, err.code);
          throw err;
        }
        const envelope = parseErrorEnvelope(body);
        const err = mapHttpStatusToKnowledgeError(
          response.status,
          envelope.messageKey,
          operationId,
        );
        logSanitized(operationId, stage, err.code);
        throw err;
      }
      if (body && typeof body === "object" && "_malformed" in body) {
        const err = new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
          httpStatus: response.status,
          retryable: false,
          operationId,
        });
        logSanitized(operationId, stage, err.code);
        throw err;
      }
      logSanitized(operationId, stage, "OK");
      return { status: response.status, body };
    } catch (err) {
      if (err instanceof KnowledgeFacadeError) throw err;
      const mapped = mapTransportError(err, operationId);
      logSanitized(operationId, stage, mapped.code);
      throw mapped;
    }
  }

  return {
    async listBases(input = {}): Promise<KnowledgeBasePage> {
      const operationId = randomUUID();
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 50;
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (input.visibility) params.set("visibility", input.visibility);
      if (input.q?.trim()) params.set("q", input.q.trim());
      const { body } = await requestJson(
        `/api/v2/knowledge-bases?${params.toString()}`,
        { method: "GET" },
        operationId,
        "listBases",
      );
      return parseKnowledgeBasePage(body, operationId);
    },

    async getBase(input): Promise<KnowledgeBaseSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}`,
        { method: "GET" },
        operationId,
        "getBase",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseSnapshot(data, operationId);
    },

    async createBase(input): Promise<KnowledgeBaseSnapshot> {
      const operationId = randomUUID();
      const payload = {
        name: input.name.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        visibility: input.visibility ?? "organization",
      };
      const { body } = await requestJson(
        "/api/v2/knowledge-bases",
        { method: "POST", body: JSON.stringify(payload) },
        operationId,
        "createBase",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseSnapshot(data, operationId);
    },

    async updateBase(input): Promise<KnowledgeBaseSnapshot> {
      const operationId = randomUUID();
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.description !== undefined) {
        payload.description = input.description?.trim()
          ? input.description.trim()
          : null;
      }
      if (input.visibility !== undefined) payload.visibility = input.visibility;
      const { body } = await requestJson(
        `/api/v2/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        operationId,
        "updateBase",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseSnapshot(data, operationId);
    },

    async deleteBase(input): Promise<void> {
      const operationId = randomUUID();
      await requestJson(
        `/api/v1/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}`,
        { method: "DELETE" },
        operationId,
        "deleteBase",
      );
    },

    async listBaseFiles(input): Promise<KnowledgeBaseFilePage> {
      const operationId = randomUUID();
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 50;
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      const { body } = await requestJson(
        `/api/v1/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}/files?${params.toString()}`,
        { method: "GET" },
        operationId,
        "listBaseFiles",
      );
      return parseKnowledgeBaseFilePage(body, operationId);
    },

    async uploadBaseFile(input): Promise<ParsedUploadAccepted> {
      const operationId = randomUUID();
      const form = new FormData();
      const blob = new Blob([Uint8Array.from(input.bytes)], {
        type: input.mimeType || "application/octet-stream",
      });
      form.append("file", blob, input.fileName);
      form.append("metadata", JSON.stringify({}));
      const { body } = await requestJson(
        `/api/v1/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}/files`,
        { method: "POST", body: form },
        operationId,
        "uploadBaseFile",
      );
      return parseUploadAccepted(body, operationId);
    },

    async getIngestionJob(jobId): Promise<ParsedIngestionJob> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/ingestion-jobs/${encodeURIComponent(jobId)}`,
        { method: "GET" },
        operationId,
        "getIngestionJob",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseIngestionJob(data, operationId);
    },

    async retryIngestionJob(jobId): Promise<ParsedIngestionJob> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/ingestion-jobs/${encodeURIComponent(jobId)}/retry`,
        { method: "POST" },
        operationId,
        "retryIngestionJob",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseIngestionJob(data, operationId);
    },

    async cancelIngestionJob(jobId): Promise<ParsedIngestionJob> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/ingestion-jobs/${encodeURIComponent(jobId)}/cancel`,
        { method: "POST" },
        operationId,
        "cancelIngestionJob",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseIngestionJob(data, operationId);
    },

    async getFile(input): Promise<KnowledgeBaseFileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}`,
        { method: "GET" },
        operationId,
        "getFile",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseFileSnapshot(data, operationId);
    },

    async listFileVersions(input): Promise<KnowledgeFileVersionSnapshot[]> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}/versions`,
        { method: "GET" },
        operationId,
        "listFileVersions",
      );
      return parseKnowledgeFileVersionList(body, operationId);
    },

    async addFileVersion(input): Promise<ParsedUploadAccepted> {
      const operationId = randomUUID();
      const form = new FormData();
      const blob = new Blob([Uint8Array.from(input.bytes)], {
        type: input.mimeType || "application/octet-stream",
      });
      form.append("file", blob, input.fileName);
      form.append("metadata", JSON.stringify({}));
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}/versions`,
        { method: "POST", body: form },
        operationId,
        "addFileVersion",
      );
      return parseUploadAccepted(body, operationId);
    },

    async activateFileVersion(input): Promise<KnowledgeBaseFileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}/versions/${encodeURIComponent(input.versionId)}/activate`,
        { method: "POST" },
        operationId,
        "activateFileVersion",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseFileSnapshot(data, operationId);
    },

    async archiveFile(input): Promise<KnowledgeBaseFileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}/archive`,
        { method: "POST" },
        operationId,
        "archiveFile",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseFileSnapshot(data, operationId);
    },

    async unarchiveFile(input): Promise<KnowledgeBaseFileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}/unarchive`,
        { method: "POST" },
        operationId,
        "unarchiveFile",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseFileSnapshot(data, operationId);
    },

    async reparseFile(input): Promise<KnowledgeBaseFileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}/reparse`,
        { method: "POST" },
        operationId,
        "reparseFile",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeBaseFileSnapshot(data, operationId);
    },

    async deleteFile(input): Promise<void> {
      const operationId = randomUUID();
      await requestJson(
        `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}`,
        { method: "DELETE" },
        operationId,
        "deleteFile",
        { allowNonIdempotentRetry: false },
      );
    },

    /**
     * F10 — GET /api/v1/source-files/{id}/download
     * Contract assumption DH-01: bytes are the current active version.
     */
    async downloadSourceFile(input): Promise<{
      bytes: Uint8Array;
      fileName?: string;
    }> {
      const operationId = randomUUID();
      const path = `/api/v1/source-files/${encodeURIComponent(input.sourceFileId)}/download`;
      try {
        const response = await transport.withAuthRetry(() =>
          transport.authorizedFetch(path, {
            method: "GET",
            timeoutMs: 60_000,
          }),
        );
        if (!response.ok) {
          const err = mapHttpStatusToKnowledgeError(
            response.status,
            null,
            operationId,
          );
          logSanitized(operationId, "downloadSourceFile", err.code);
          throw err;
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        const disposition = response.headers.get("content-disposition");
        let fileName: string | undefined;
        if (disposition) {
          const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
          const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
          const raw = utfMatch?.[1] ?? plainMatch?.[1];
          if (raw) {
            try {
              fileName = decodeURIComponent(raw.trim());
            } catch {
              fileName = raw.trim();
            }
          }
        }
        logSanitized(operationId, "downloadSourceFile", "OK");
        return { bytes: buffer, fileName };
      } catch (err) {
        if (err instanceof KnowledgeFacadeError) throw err;
        const mapped = mapTransportError(err, operationId);
        logSanitized(operationId, "downloadSourceFile", mapped.code);
        throw mapped;
      }
    },

    async listIndexes(input): Promise<KnowledgeIndexState[]> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}/indexes`,
        { method: "GET" },
        operationId,
        "listIndexes",
      );
      return parseKnowledgeIndexStates(body, operationId);
    },

    async getBuildProfile(input): Promise<KnowledgeBuildProfileView> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}/build-profile`,
        { method: "GET" },
        operationId,
        "getBuildProfile",
      );
      return parseKnowledgeBuildProfileView(body, operationId);
    },

    async updateBuildProfile(input): Promise<KnowledgeBuildProfileView> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}/build-profile`,
        {
          method: "PUT",
          body: JSON.stringify({ build_profile_id: input.buildProfileId }),
        },
        operationId,
        "updateBuildProfile",
      );
      return parseKnowledgeBuildProfileView(body, operationId);
    },

    async startBuild(input): Promise<KnowledgeBuildJobSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}/builds`,
        {
          method: "POST",
          body: JSON.stringify({
            index_types: input.indexTypes,
            force: input.force === true,
          }),
        },
        operationId,
        "startBuild",
        { allowNonIdempotentRetry: false },
      );
      try {
        const jobs = parseKnowledgeBuildJobList(body, operationId);
        if (jobs[0]) return jobs[0];
      } catch (err) {
        if (
          !(err instanceof KnowledgeFacadeError) ||
          err.code !== KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID
        ) {
          throw err;
        }
      }
      return parseKnowledgeBuildJobSnapshot(body, operationId);
    },

    async getBuild(input): Promise<KnowledgeBuildJobSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/builds/${encodeURIComponent(input.buildId)}`,
        { method: "GET" },
        operationId,
        "getBuild",
      );
      return parseKnowledgeBuildJobSnapshot(body, operationId);
    },

    async retryBuild(input): Promise<KnowledgeBuildJobSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/builds/${encodeURIComponent(input.buildId)}/retry`,
        { method: "POST" },
        operationId,
        "retryBuild",
        { allowNonIdempotentRetry: false },
      );
      return parseKnowledgeBuildJobSnapshot(body, operationId);
    },

    async listSets(input = {}): Promise<KnowledgeSetPage> {
      const operationId = randomUUID();
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 50;
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (input.q?.trim()) params.set("q", input.q.trim());
      const { body } = await requestJson(
        `/api/v2/knowledge-sets?${params.toString()}`,
        { method: "GET" },
        operationId,
        "listSets",
      );
      return parseKnowledgeSetPage(body, operationId);
    },

    async getSet(input): Promise<KnowledgeSetSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v2/knowledge-sets/${encodeURIComponent(input.knowledgeSetId)}`,
        { method: "GET" },
        operationId,
        "getSet",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeSetSnapshot(data, operationId);
    },

    async createSet(input): Promise<KnowledgeSetSnapshot> {
      const operationId = randomUUID();
      const payload = {
        name: input.name.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        visibility: input.visibility ?? "organization",
      };
      const { body } = await requestJson(
        "/api/v2/knowledge-sets",
        { method: "POST", body: JSON.stringify(payload) },
        operationId,
        "createSet",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeSetSnapshot(data, operationId);
    },

    async updateSet(input): Promise<KnowledgeSetSnapshot> {
      const operationId = randomUUID();
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.description !== undefined) {
        payload.description = input.description?.trim()
          ? input.description.trim()
          : null;
      }
      if (input.status !== undefined) payload.status = input.status;
      if (input.visibility !== undefined) payload.visibility = input.visibility;
      const { body } = await requestJson(
        `/api/v2/knowledge-sets/${encodeURIComponent(input.knowledgeSetId)}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        operationId,
        "updateSet",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeSetSnapshot(data, operationId);
    },

    async bindSetBase(input): Promise<KnowledgeSetSnapshot> {
      const operationId = randomUUID();
      const payload: Record<string, unknown> = {
        knowledge_base_id: input.knowledgeBaseId,
      };
      if (input.weight !== undefined) payload.weight = input.weight;
      if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
      await requestJson(
        `/api/v2/knowledge-sets/${encodeURIComponent(input.knowledgeSetId)}/knowledge-bases`,
        { method: "POST", body: JSON.stringify(payload) },
        operationId,
        "bindSetBase",
        { allowNonIdempotentRetry: false },
      );
      return this.getSet({ knowledgeSetId: input.knowledgeSetId });
    },

    async unbindSetBase(input): Promise<KnowledgeSetSnapshot> {
      const operationId = randomUUID();
      await requestJson(
        `/api/v2/knowledge-sets/${encodeURIComponent(input.knowledgeSetId)}/knowledge-bases/${encodeURIComponent(input.knowledgeBaseId)}`,
        { method: "DELETE" },
        operationId,
        "unbindSetBase",
        { allowNonIdempotentRetry: false },
      );
      return this.getSet({ knowledgeSetId: input.knowledgeSetId });
    },

    async listRetrievalProfiles(
      input,
    ): Promise<KnowledgeRetrievalProfileSnapshot[]> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/knowledge-sets/${encodeURIComponent(input.knowledgeSetId)}/retrieval-profiles`,
        { method: "GET" },
        operationId,
        "listRetrievalProfiles",
      );
      return parseKnowledgeRetrievalProfileList(body, operationId);
    },

    async createRetrievalProfile(
      input,
    ): Promise<KnowledgeRetrievalProfileSnapshot> {
      const operationId = randomUUID();
      const payload = {
        config: input.config ?? null,
      };
      const { body } = await requestJson(
        `/api/v1/knowledge-sets/${encodeURIComponent(input.knowledgeSetId)}/retrieval-profiles`,
        { method: "POST", body: JSON.stringify(payload) },
        operationId,
        "createRetrievalProfile",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeRetrievalProfileSnapshot(data, operationId);
    },

    async getRetrievalProfile(
      input,
    ): Promise<KnowledgeRetrievalProfileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/retrieval-profiles/${encodeURIComponent(input.profileId)}`,
        { method: "GET" },
        operationId,
        "getRetrievalProfile",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeRetrievalProfileSnapshot(data, operationId);
    },

    async updateRetrievalProfile(
      input,
    ): Promise<KnowledgeRetrievalProfileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/retrieval-profiles/${encodeURIComponent(input.profileId)}`,
        { method: "PATCH", body: JSON.stringify({ config: input.config }) },
        operationId,
        "updateRetrievalProfile",
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeRetrievalProfileSnapshot(data, operationId);
    },

    async publishRetrievalProfile(
      input,
    ): Promise<KnowledgeRetrievalProfileSnapshot> {
      const operationId = randomUUID();
      const { body } = await requestJson(
        `/api/v1/retrieval-profiles/${encodeURIComponent(input.profileId)}/publish`,
        { method: "POST" },
        operationId,
        "publishRetrievalProfile",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeRetrievalProfileSnapshot(data, operationId);
    },

    async rollbackRetrievalProfile(
      input,
    ): Promise<KnowledgeRetrievalProfileSnapshot> {
      const operationId = randomUUID();
      const payload =
        input.publish === undefined ? {} : { publish: input.publish };
      const { body } = await requestJson(
        `/api/v1/retrieval-profiles/${encodeURIComponent(input.profileId)}/rollback`,
        { method: "POST", body: JSON.stringify(payload) },
        operationId,
        "rollbackRetrievalProfile",
        { allowNonIdempotentRetry: false },
      );
      const data = (body as { data?: unknown })?.data ?? body;
      return parseKnowledgeRetrievalProfileSnapshot(data, operationId);
    },

    async probeCapability() {
      const operationId = randomUUID();
      try {
        await requestJson(
          "/api/v2/knowledge-bases?page=1&page_size=1",
          { method: "GET" },
          operationId,
          "probeCapability",
        );
        return { available: true, status: "available" as const };
      } catch (err) {
        if (
          err instanceof KnowledgeFacadeError &&
          err.code === KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED
        ) {
          return { available: false, status: "auth_required" as const };
        }
        return {
          available: false,
          status: "blocked_provider_unavailable" as const,
        };
      }
    },

    async listFileChunks(input): Promise<KnowledgeFileChunkPage> {
      const operationId = randomUUID();
      const sourceFileId = input.sourceFileId?.trim() ?? "";
      if (!sourceFileId) {
        throw new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
          retryable: false,
          operationId,
        });
      }
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 50;
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      ) {
        throw new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
          retryable: false,
          operationId,
        });
      }
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      const keywords =
        typeof input.keywords === "string" ? input.keywords.trim() : "";
      if (keywords.length > 200) {
        throw new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
          retryable: false,
          operationId,
        });
      }
      if (keywords) params.set("keywords", keywords);
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(sourceFileId)}/chunks?${params.toString()}`,
        { method: "GET" },
        operationId,
        "listFileChunks",
      );
      return parseKnowledgeFileChunkPage(body, operationId);
    },

    async setFileChunkAvailability(
      input,
    ): Promise<KnowledgeFileChunkAvailabilityResult> {
      const operationId = randomUUID();
      const sourceFileId = input.sourceFileId?.trim() ?? "";
      const chunkId = input.chunkId?.trim() ?? "";
      const fileVersionId = input.fileVersionId?.trim() ?? "";
      if (!sourceFileId || !chunkId || !fileVersionId) {
        throw new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
          retryable: false,
          operationId,
        });
      }
      if (typeof input.available !== "boolean") {
        throw new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
          retryable: false,
          operationId,
        });
      }
      const { body } = await requestJson(
        `/api/v1/source-files/${encodeURIComponent(sourceFileId)}/chunks/${encodeURIComponent(chunkId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_version_id: fileVersionId,
            available: input.available,
          }),
        },
        operationId,
        "setFileChunkAvailability",
        { allowNonIdempotentRetry: false },
      );
      return parseKnowledgeFileChunkAvailabilityResult(body, operationId);
    },

    async getFileChunkImage(
      input,
    ): Promise<KnowledgeFileChunkImageResult> {
      const operationId = randomUUID();
      const sourceFileId = input.sourceFileId?.trim() ?? "";
      const chunkId = input.chunkId?.trim() ?? "";
      const fileVersionId = input.fileVersionId?.trim() ?? "";
      if (!sourceFileId || !chunkId || !fileVersionId) {
        throw new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
          retryable: false,
          operationId,
        });
      }
      const params = new URLSearchParams();
      params.set("file_version_id", fileVersionId);
      const path = `/api/v1/source-files/${encodeURIComponent(sourceFileId)}/chunks/${encodeURIComponent(chunkId)}/image?${params.toString()}`;
      try {
        const response = await transport.withAuthRetry(() =>
          transport.authorizedFetch(path, {
            method: "GET",
            timeoutMs: 60_000,
          }),
        );
        if (!response.ok) {
          const errBody = await readJson(response).catch(() => null);
          const envelope = parseErrorEnvelope(errBody);
          const err = mapHttpStatusToKnowledgeError(
            response.status,
            envelope.messageKey,
            operationId,
          );
          logSanitized(operationId, "getFileChunkImage", err.code);
          throw err;
        }
        const contentType = response.headers.get("content-type");
        const buffer = Buffer.from(await response.arrayBuffer());
        const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const result = parseKnowledgeFileChunkImageResult(
          contentType,
          bytes,
          operationId,
        );
        logSanitized(operationId, "getFileChunkImage", "OK");
        return result;
      } catch (err) {
        if (err instanceof KnowledgeFacadeError) throw err;
        const mapped = mapTransportError(err, operationId);
        logSanitized(operationId, "getFileChunkImage", mapped.code);
        throw mapped;
      }
    },
  };
}

let sharedProvider: KnowledgeHttpProvider | null = null;

export function getKnowledgeHttpProvider(): KnowledgeHttpProvider {
  if (!sharedProvider) {
    sharedProvider = createKnowledgeHttpProvider();
  }
  return sharedProvider;
}

export function resetKnowledgeHttpProviderForTests(): void {
  sharedProvider = null;
}

export function setKnowledgeHttpProviderForTests(
  provider: KnowledgeHttpProvider | null,
): void {
  sharedProvider = provider;
}
