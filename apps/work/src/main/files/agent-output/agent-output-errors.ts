/**
 * Typed errors for AgentOutputService (message → ManagedFile pipeline).
 */

import { makeFileError, type FileError, type FileErrorCode } from "../../../shared/files";
import { FilePlatformError } from "../file-security";

export type AgentOutputErrorCode =
  | "INVALID_MESSAGE_CONTENT"
  | "INVALID_FILE_TITLE"
  | "GENERATED_DIRECTORY_FAILED"
  | "GENERATED_FILE_WRITE_FAILED"
  | "MANAGED_FILE_SAVE_FAILED"
  | "FILE_ASSOCIATION_SAVE_FAILED"
  | "FILE_NOT_FOUND"
  | "FILE_PATH_DENIED"
  | "FILE_SAVE_AS_FAILED"
  | "PROFILE_MISMATCH";

export function agentOutputError(
  code: AgentOutputErrorCode,
  message: string,
  options?: { retryable?: boolean; detail?: string },
): FilePlatformError {
  return FilePlatformError.fromCode(
    code as FileErrorCode,
    message,
    options,
  );
}

export function toAgentOutputFileError(err: unknown): FileError {
  if (err instanceof FilePlatformError) {
    return err.fileError;
  }
  return makeFileError(
    "GENERATED_FILE_WRITE_FAILED",
    err instanceof Error ? err.message : "Agent output operation failed",
    { retryable: true },
  );
}
