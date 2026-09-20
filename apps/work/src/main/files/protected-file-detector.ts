/**
 * P0 File Content Readability Gate — prefix signature vs declared extension.
 * Does not decrypt, does not claim confirmed vendor encryption.
 */

import { open } from "fs/promises";
import { randomUUID } from "crypto";
import {
  detectStrictContentKind,
  extensionFromName,
  type StrictContentKind,
} from "./file-security";
import { FILE_CONTENT_UNREADABLE_MESSAGE } from "../../shared/files";

export { FILE_CONTENT_UNREADABLE_MESSAGE };

export type FileContentValidationStatus =
  | "VALID_PLAINTEXT"
  | "INVALID_OR_ENCRYPTED"
  | "NOT_APPLICABLE";

export type FileContentKind = StrictContentKind;

export type FileContentValidationReason =
  | "signature-match"
  | "signature-mismatch"
  | "type-not-applicable";

export interface FileContentValidationResult {
  status: FileContentValidationStatus;
  extension: string;
  expectedKinds: FileContentKind[];
  actualKind: FileContentKind;
  bytesInspected: number;
  reason: FileContentValidationReason;
}

export const MAX_PREFIX_BYTES = 16 * 1024;

const STRICT_EXTENSION_KINDS: Record<string, FileContentKind[]> = {
  pdf: ["pdf"],
  docx: ["zip"],
  xlsx: ["zip"],
  pptx: ["zip"],
  ods: ["zip"],
  epub: ["zip"],
  doc: ["ole"],
  xls: ["ole"],
  ppt: ["ole"],
  png: ["png"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  gif: ["gif"],
  webp: ["webp"],
  bmp: ["bmp"],
};

export function expectedContentKinds(extension: string): FileContentKind[] {
  return STRICT_EXTENSION_KINDS[extension] ?? [];
}

export async function readFilePrefix(
  filePath: string,
  maxBytes: number = MAX_PREFIX_BYTES,
): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(Math.max(0, maxBytes));
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function validateFileContent(
  filePath: string,
  fileName: string,
): Promise<FileContentValidationResult> {
  const extension = extensionFromName(fileName);
  const expectedKinds = expectedContentKinds(extension);

  if (expectedKinds.length === 0) {
    return {
      status: "NOT_APPLICABLE",
      extension,
      expectedKinds: [],
      actualKind: "unknown",
      bytesInspected: 0,
      reason: "type-not-applicable",
    };
  }

  const prefix = await readFilePrefix(filePath, MAX_PREFIX_BYTES);
  const actualKind = detectStrictContentKind(prefix);

  if (expectedKinds.includes(actualKind)) {
    return {
      status: "VALID_PLAINTEXT",
      extension,
      expectedKinds,
      actualKind,
      bytesInspected: prefix.length,
      reason: "signature-match",
    };
  }

  return {
    status: "INVALID_OR_ENCRYPTED",
    extension,
    expectedKinds,
    actualKind,
    bytesInspected: prefix.length,
    reason: "signature-mismatch",
  };
}

export type ContentCheckLogStatus = "PASS" | "BLOCK" | "SKIP" | "ERROR";

function basenameSafe(name: string): string {
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return slash >= 0 ? name.slice(slash + 1) : name;
}

/** Structured metadata-only CONTENT_CHECK log. Must never include file bytes. */
export function logContentCheckEvent(input: {
  validation: FileContentValidationResult;
  errorCode?: string | null;
  operationId?: string;
  fileName?: string;
}): void {
  try {
    let status: ContentCheckLogStatus;
    if (input.errorCode === "FILE_READ_FAILED") status = "ERROR";
    else if (input.validation.status === "VALID_PLAINTEXT") status = "PASS";
    else if (input.validation.status === "NOT_APPLICABLE") status = "SKIP";
    else status = "BLOCK";

    console.info(
      JSON.stringify({
        operationId: input.operationId ?? randomUUID(),
        stage: "CONTENT_CHECK",
        status,
        fileName: input.fileName ? basenameSafe(input.fileName) : undefined,
        extension: input.validation.extension,
        expectedKinds: input.validation.expectedKinds,
        actualKind: input.validation.actualKind,
        bytesInspected: input.validation.bytesInspected,
        errorCode: input.errorCode ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    // Logger failure must not change Gate decision.
  }
}
