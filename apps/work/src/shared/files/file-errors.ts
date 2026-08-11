/**
 * Shared FileError model for File Platform IPC and Main services.
 */

export type FileErrorCode =
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE_DENIED"
  | "FILE_READ_FAILED"
  | "FILE_PARSE_FAILED"
  | "FILE_PREVIEW_UNSUPPORTED"
  | "FILE_ENCODING_FAILED"
  | "FILE_REMOTE_UNSUPPORTED"
  | "FILE_PATH_OUTSIDE_POLICY"
  | "FILE_STORAGE_FAILED"
  | "FILE_NOT_IMPLEMENTED"
  | "INVALID_MESSAGE_CONTENT"
  | "INVALID_FILE_TITLE"
  | "GENERATED_DIRECTORY_FAILED"
  | "GENERATED_FILE_WRITE_FAILED"
  | "MANAGED_FILE_SAVE_FAILED"
  | "FILE_ASSOCIATION_SAVE_FAILED"
  | "FILE_PATH_DENIED"
  | "FILE_SAVE_AS_FAILED"
  | "PROFILE_MISMATCH"
  | "IPC_HANDLER_NOT_REGISTERED";

export interface FileError {
  code: FileErrorCode;
  message: string;
  retryable: boolean;
  detail?: string;
}

export function makeFileError(
  code: FileErrorCode,
  message: string,
  options?: { retryable?: boolean; detail?: string },
): FileError {
  return {
    code,
    message,
    retryable: options?.retryable ?? false,
    detail: options?.detail,
  };
}
