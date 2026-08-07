/** v7.0 — Hermes Client local error codes (PRD §16). */

export type HermesClientErrorCode =
  | "HERMES_CLIENT_NOT_AUTHENTICATED"
  | "HERMES_CLIENT_BOOTSTRAP_FAILED"
  | "HERMES_CLIENT_AGENT_ALIAS_NOT_FOUND"
  | "HERMES_CLIENT_TOOLS_LIST_FAILED"
  | "HERMES_CLIENT_READINESS_FAILED"
  | "HERMES_CLIENT_EVENTS_TOKEN_FAILED"
  | "HERMES_CLIENT_TASK_RESULT_FAILED"
  | "HERMES_CLIENT_ARTIFACT_PREVIEW_FAILED"
  | "HERMES_CLIENT_ARTIFACT_DOWNLOAD_FAILED"
  | "HERMES_CLIENT_EVENT_STREAM_EXPIRED"
  | "HERMES_CLIENT_EVENT_STREAM_FORBIDDEN"
  | "HERMES_CLIENT_BACKEND_NOT_CONFIGURED"
  | "HERMES_CLIENT_API_FAILED";

export class HermesClientError extends Error {
  readonly code: HermesClientErrorCode;

  constructor(code: HermesClientErrorCode, message: string) {
    super(message);
    this.name = "HermesClientError";
    this.code = code;
  }
}

export function isHermesClientError(err: unknown): err is HermesClientError {
  return err instanceof HermesClientError;
}
