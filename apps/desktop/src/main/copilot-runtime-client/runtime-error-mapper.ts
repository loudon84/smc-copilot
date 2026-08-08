import type {
  DesktopRuntimeError,
  DesktopRuntimeErrorCode,
} from "../../shared/copilot-runtime/runtime-error-contract";

const RETRYABLE = new Set<DesktopRuntimeErrorCode>([
  "RUNTIME_UNAVAILABLE",
  "STREAM_DISCONNECTED",
  "EVENT_REPLAY_REQUIRED",
  "INSTANCE_NOT_READY",
  "GATEWAY_NOT_RUNNING",
  "PAIRING_EXPIRED",
]);

const CODE_ALIASES: Record<string, DesktopRuntimeErrorCode> = {
  runtime_unavailable: "RUNTIME_UNAVAILABLE",
  unavailable: "RUNTIME_UNAVAILABLE",
  connection_refused: "RUNTIME_UNAVAILABLE",
  runtime_incompatible: "RUNTIME_INCOMPATIBLE",
  incompatible: "RUNTIME_INCOMPATIBLE",
  pairing_required: "PAIRING_REQUIRED",
  unauthorized: "PAIRING_REQUIRED",
  pairing_expired: "PAIRING_EXPIRED",
  expired: "PAIRING_EXPIRED",
  device_revoked: "DEVICE_REVOKED",
  revoked: "DEVICE_REVOKED",
  invalid_device_token: "INVALID_DEVICE_TOKEN",
  instance_not_found: "INSTANCE_NOT_FOUND",
  not_found: "INSTANCE_NOT_FOUND",
  instance_not_ready: "INSTANCE_NOT_READY",
  gateway_not_running: "GATEWAY_NOT_RUNNING",
  policy_denied: "POLICY_DENIED",
  forbidden: "POLICY_DENIED",
  approval_required: "APPROVAL_REQUIRED",
  resource_not_ready: "RESOURCE_NOT_READY",
  stream_disconnected: "STREAM_DISCONNECTED",
  event_replay_required: "EVENT_REPLAY_REQUIRED",
  session_not_found: "SESSION_NOT_FOUND",
  attachment_rejected: "ATTACHMENT_REJECTED",
  artifact_unavailable: "ARTIFACT_UNAVAILABLE",
};

function normalizeCode(raw: string | undefined | null): DesktopRuntimeErrorCode {
  if (!raw) return "UNKNOWN";
  const upper = raw.trim().toUpperCase().replace(/[-\s]/g, "_");
  if (
    (
      [
        "RUNTIME_UNAVAILABLE",
        "RUNTIME_INCOMPATIBLE",
        "PAIRING_REQUIRED",
        "PAIRING_EXPIRED",
        "DEVICE_REVOKED",
        "INVALID_DEVICE_TOKEN",
        "INSTANCE_NOT_FOUND",
        "INSTANCE_NOT_READY",
        "GATEWAY_NOT_RUNNING",
        "POLICY_DENIED",
        "APPROVAL_REQUIRED",
        "RESOURCE_NOT_READY",
        "STREAM_DISCONNECTED",
        "EVENT_REPLAY_REQUIRED",
        "SESSION_NOT_FOUND",
        "ATTACHMENT_REJECTED",
        "ARTIFACT_UNAVAILABLE",
        "UNKNOWN",
      ] as DesktopRuntimeErrorCode[]
    ).includes(upper as DesktopRuntimeErrorCode)
  ) {
    return upper as DesktopRuntimeErrorCode;
  }
  const lower = raw.trim().toLowerCase().replace(/[-\s]/g, "_");
  return CODE_ALIASES[lower] ?? "UNKNOWN";
}

function codeFromHttpStatus(status: number): DesktopRuntimeErrorCode {
  if (status === 401) return "PAIRING_REQUIRED";
  if (status === 403) return "POLICY_DENIED";
  if (status === 404) return "INSTANCE_NOT_FOUND";
  if (status === 409) return "APPROVAL_REQUIRED";
  if (status === 422) return "ATTACHMENT_REJECTED";
  if (status >= 500) return "RUNTIME_UNAVAILABLE";
  return "UNKNOWN";
}

export function createDesktopRuntimeError(
  code: DesktopRuntimeErrorCode,
  message: string,
  extras?: Partial<DesktopRuntimeError>,
): DesktopRuntimeError {
  return {
    code,
    message,
    retryable: extras?.retryable ?? RETRYABLE.has(code),
    requestId: extras?.requestId,
    details: extras?.details,
  };
}

export function mapServeErrorEnvelope(input: {
  status?: number;
  body?: unknown;
  requestId?: string;
  fallbackMessage?: string;
}): DesktopRuntimeError {
  const body = input.body;
  let code: DesktopRuntimeErrorCode | undefined;
  let message = input.fallbackMessage ?? "Serve request failed";
  let details: Record<string, unknown> | undefined;
  let requestId = input.requestId;

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const err = (obj.error && typeof obj.error === "object" ? obj.error : obj) as Record<
      string,
      unknown
    >;
    if (typeof err.code === "string") code = normalizeCode(err.code);
    if (typeof err.message === "string") message = err.message;
    else if (typeof obj.message === "string") message = obj.message;
    else if (typeof obj.detail === "string") message = obj.detail;
    if (typeof err.requestId === "string") requestId = err.requestId;
    else if (typeof obj.requestId === "string") requestId = obj.requestId;
    if (err.details && typeof err.details === "object") {
      details = err.details as Record<string, unknown>;
    }
  } else if (typeof body === "string" && body.trim()) {
    message = body.trim();
  }

  if (!code) {
    code = input.status != null ? codeFromHttpStatus(input.status) : "UNKNOWN";
  }

  return createDesktopRuntimeError(code, message, { requestId, details });
}

export function mapNetworkError(err: unknown, requestId?: string): DesktopRuntimeError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("network") ||
    lower.includes("aborted") ||
    lower.includes("timeout")
  ) {
    return createDesktopRuntimeError("RUNTIME_UNAVAILABLE", message, { requestId });
  }
  return createDesktopRuntimeError("UNKNOWN", message, { requestId, retryable: true });
}
