/** Normalize Runtime HTTP error envelopes to a stable client error. */

export interface RuntimeApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class RuntimeApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;
  readonly status: number | null;
  readonly body: unknown;

  constructor(options: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
    requestId?: string | null;
    status?: number | null;
    body?: unknown;
  }) {
    super(options.message);
    this.name = "RuntimeApiError";
    this.code = options.code ?? "runtime_error";
    this.details = options.details ?? {};
    this.requestId = options.requestId ?? null;
    this.status = options.status ?? null;
    this.body = options.body;
  }
}

export function normalizeRuntimeError(options: {
  status: number;
  body: unknown;
  requestId?: string | null;
  fallbackMessage?: string;
}): RuntimeApiError {
  const { status, body, requestId, fallbackMessage } = options;
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: Partial<RuntimeApiErrorBody> }).error;
    if (err && typeof err === "object") {
      return new RuntimeApiError({
        message: String(err.message ?? fallbackMessage ?? `HTTP ${status}`),
        code: String(err.code ?? "runtime_error"),
        details: (err.details as Record<string, unknown>) ?? {},
        requestId: err.requestId ?? requestId ?? null,
        status,
        body,
      });
    }
  }
  return new RuntimeApiError({
    message: fallbackMessage ?? `HTTP ${status}`,
    code: "http_error",
    requestId: requestId ?? null,
    status,
    body,
  });
}
