/** Desktop → Renderer error envelope for Serve Runtime (PRD §23). */

export type DesktopRuntimeErrorCode =
  | "RUNTIME_UNAVAILABLE"
  | "RUNTIME_INCOMPATIBLE"
  | "PAIRING_REQUIRED"
  | "PAIRING_EXPIRED"
  | "DEVICE_REVOKED"
  | "INVALID_DEVICE_TOKEN"
  | "INSTANCE_NOT_FOUND"
  | "INSTANCE_NOT_READY"
  | "GATEWAY_NOT_RUNNING"
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "RESOURCE_NOT_READY"
  | "STREAM_DISCONNECTED"
  | "EVENT_REPLAY_REQUIRED"
  | "SESSION_NOT_FOUND"
  | "ATTACHMENT_REJECTED"
  | "ARTIFACT_UNAVAILABLE"
  | "UNKNOWN";

export interface DesktopRuntimeError {
  code: DesktopRuntimeErrorCode;
  message: string;
  requestId?: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export function isDesktopRuntimeError(value: unknown): value is DesktopRuntimeError {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === "string" && typeof v.message === "string" && typeof v.retryable === "boolean";
}
