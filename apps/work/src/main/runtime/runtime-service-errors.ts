/**
 * Map @smc/runtime-client RuntimeApiError → Desktop RUNTIME_ERROR_CODES.
 */
import { RuntimeApiError } from "@smc/runtime-client";
import {
  RUNTIME_ERROR_CODES,
  runtimeErrorMessage,
  type RuntimeErrorCode,
} from "./runtime-errors";

export const RUNTIME_SERVICE_ERROR_CODES = {
  ...RUNTIME_ERROR_CODES,
  RUNTIME_SERVICE_UNAVAILABLE: "RUNTIME_SERVICE_UNAVAILABLE",
  RUNTIME_PROFILE_UNSUPPORTED: "RUNTIME_PROFILE_UNSUPPORTED",
} as const;

export type RuntimeServiceErrorCode =
  (typeof RUNTIME_SERVICE_ERROR_CODES)[keyof typeof RUNTIME_SERVICE_ERROR_CODES];

export function isRuntimeServiceUnavailable(err: unknown): boolean {
  if (err instanceof RuntimeApiError) {
    return err.status === null || err.status === 0 || err.status >= 500;
  }
  if (err instanceof TypeError) {
    // fetch network failure
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("fetch failed") ||
      msg.includes("econnrefused") ||
      msg.includes("network")
    );
  }
  return false;
}

export function mapRuntimeApiErrorToCode(err: unknown): RuntimeErrorCode {
  if (isRuntimeServiceUnavailable(err)) {
    return RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE;
  }
  if (err instanceof RuntimeApiError) {
    const code = err.code.toLowerCase();
    if (code.includes("auth")) return RUNTIME_ERROR_CODES.GATEWAY_AUTH_FAILED;
    if (code.includes("not_found") || code.includes("missing")) {
      return RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND;
    }
    if (code.includes("timeout")) return RUNTIME_ERROR_CODES.GATEWAY_TIMEOUT;
    if (code.includes("start")) return RUNTIME_ERROR_CODES.GATEWAY_START_FAILED;
    if (err.status === 401 || err.status === 403) {
      return RUNTIME_ERROR_CODES.GATEWAY_AUTH_FAILED;
    }
    if (err.status === 404) return RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND;
  }
  return RUNTIME_ERROR_CODES.CONFIGURATION_ERROR;
}

export function mapRuntimeApiErrorMessage(err: unknown): string {
  if (isRuntimeServiceUnavailable(err)) {
    return "Copilot Runtime service is unavailable. Ensure the Runtime daemon is running on port 8765.";
  }
  if (err instanceof RuntimeApiError) {
    return err.message || runtimeErrorMessage(mapRuntimeApiErrorToCode(err));
  }
  if (err instanceof Error) return err.message;
  return runtimeErrorMessage(RUNTIME_ERROR_CODES.CONFIGURATION_ERROR);
}
