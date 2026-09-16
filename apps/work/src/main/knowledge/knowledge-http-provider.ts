/**
 * Main Knowledge HTTP provider — contract paths only.
 * Schema-validate before handing results to features. Fail-closed; never mock.
 */

import { randomUUID } from "crypto";
import { AccessTokenError } from "../auth/ensure-access-token";
import { AuthorizedBackendTransportError } from "../auth/authorized-backend-transport";
import { resolveKnowledgeServiceUrl } from "./knowledge-service-url";
import type {
  KnowledgeBaseCreateInput,
  KnowledgeBaseDeleteInput,
  KnowledgeBaseFilePage,
  KnowledgeBaseGetInput,
  KnowledgeBaseListFilesInput,
  KnowledgeBaseListInput,
  KnowledgeBasePage,
  KnowledgeBaseSnapshot,
  KnowledgeBaseUpdateInput,
} from "../../shared/knowledge/knowledge-base-ipc";
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
  parseKnowledgeBasePage,
  parseKnowledgeBaseSnapshot,
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
  probeCapability(): Promise<{
    available: boolean;
    status: "available" | "blocked_provider_unavailable" | "auth_required";
  }>;
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
