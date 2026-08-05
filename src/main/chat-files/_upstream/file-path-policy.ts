/**
 * FilePathPolicy: resolve/validate paths and decide preview/parse/send eligibility.
 */

import { existsSync } from "fs";
import type { ManagedFile } from "../../shared/files";
import { canSendWithStatus } from "../../shared/files";
import {
  assertPathAllowed,
  canonicalizePath,
  FilePlatformError,
  isDeniedExtension,
} from "./file-security";

export interface FilePathPolicy {
  resolveAndValidate(path: string): Promise<{
    originalPath: string;
    realPath: string;
  }>;

  canPreview(file: ManagedFile): boolean;
  canParse(file: ManagedFile): boolean;
  canSend(file: ManagedFile): boolean;
}

export class DefaultFilePathPolicy implements FilePathPolicy {
  async resolveAndValidate(path: string): Promise<{
    originalPath: string;
    realPath: string;
  }> {
    const realPath = canonicalizePath(path);
    assertPathAllowed(realPath, { allowOutsideManaged: true });
    if (!existsSync(realPath)) {
      throw FilePlatformError.fromCode("FILE_NOT_FOUND", "File does not exist");
    }
    return { originalPath: path, realPath };
  }

  canPreview(file: ManagedFile): boolean {
    if (file.status === "missing" || file.status === "deleted") return false;
    if (isDeniedExtension(file.name)) return false;
    return true;
  }

  canParse(file: ManagedFile): boolean {
    if (file.status === "missing" || file.status === "deleted") return false;
    if (isDeniedExtension(file.name)) return false;
    return (
      file.category === "text" ||
      file.category === "markdown" ||
      file.category === "code" ||
      file.category === "pdf" ||
      file.category === "office" ||
      file.category === "spreadsheet" ||
      file.category === "presentation" ||
      file.category === "epub" ||
      file.category === "html"
    );
  }

  canSend(file: ManagedFile): boolean {
    return canSendWithStatus(file.status);
  }
}

export const defaultFilePathPolicy = new DefaultFilePathPolicy();
