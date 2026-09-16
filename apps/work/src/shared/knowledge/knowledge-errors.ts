/**
 * Sanitized Knowledge Facade errors for IPC and UI branching.
 * UI keys off `code` / `httpStatus` / `messageKey` — never localized `message`.
 */

import {
  KNOWLEDGE_ERROR_CODES,
  type KnowledgeFacadeErrorShape,
} from "./knowledge-base-ipc";

function newOperationId(): string {
  return `kb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class KnowledgeFacadeError extends Error implements KnowledgeFacadeErrorShape {
  readonly code: string;
  readonly httpStatus?: number;
  readonly messageKey?: string;
  readonly retryable: boolean;
  readonly operationId: string;

  constructor(input: {
    code: string;
    httpStatus?: number;
    messageKey?: string;
    retryable?: boolean;
    operationId?: string;
  }) {
    super(input.code);
    this.name = "KnowledgeFacadeError";
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.messageKey = input.messageKey;
    this.retryable = input.retryable ?? false;
    this.operationId = input.operationId ?? newOperationId();
  }

  toShape(): KnowledgeFacadeErrorShape {
    return {
      code: this.code,
      httpStatus: this.httpStatus,
      messageKey: this.messageKey,
      retryable: this.retryable,
      operationId: this.operationId,
    };
  }
}

export function toKnowledgeFacadeError(
  err: unknown,
  fallbackCode = KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
  operationId?: string,
): KnowledgeFacadeError {
  if (err instanceof KnowledgeFacadeError) {
    return err;
  }
  if (err instanceof Error) {
    const code = err.message.split(/\s/)[0] ?? fallbackCode;
    if (/^[A-Z][A-Z0-9_]+$/.test(code)) {
      return new KnowledgeFacadeError({
        code,
        retryable: code === KNOWLEDGE_ERROR_CODES.TIMEOUT,
        operationId,
      });
    }
  }
  return new KnowledgeFacadeError({
    code: fallbackCode,
    retryable: false,
    operationId,
  });
}

export function mapHttpStatusToKnowledgeError(
  status: number,
  messageKey?: string | null,
  operationId?: string,
): KnowledgeFacadeError {
  if (status === 401) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED,
      httpStatus: 401,
      messageKey: messageKey ?? undefined,
      retryable: false,
      operationId,
    });
  }
  if (status === 403) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.FORBIDDEN,
      httpStatus: 403,
      messageKey: messageKey ?? undefined,
      retryable: false,
      operationId,
    });
  }
  if (status === 404) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.NOT_FOUND,
      httpStatus: 404,
      messageKey: messageKey ?? undefined,
      retryable: false,
      operationId,
    });
  }
  if (status === 409) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.CONFLICT,
      httpStatus: 409,
      messageKey: messageKey ?? undefined,
      retryable: false,
      operationId,
    });
  }
  if (status === 0) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.TIMEOUT,
      httpStatus: 0,
      messageKey: messageKey ?? undefined,
      retryable: true,
      operationId,
    });
  }
  if (messageKey?.includes("ragflow")) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
      httpStatus: status,
      messageKey: messageKey ?? undefined,
      retryable: true,
      operationId,
    });
  }
  if (status === 400 || status === 422) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
      httpStatus: status,
      messageKey: messageKey ?? undefined,
      retryable: false,
      operationId,
    });
  }
  if (status >= 500) {
    return new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
      httpStatus: status,
      messageKey: messageKey ?? undefined,
      retryable: true,
      operationId,
    });
  }
  return new KnowledgeFacadeError({
    code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
    httpStatus: status,
    messageKey: messageKey ?? undefined,
    retryable: false,
    operationId,
  });
}
