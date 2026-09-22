/**
 * Platform Attachment Upload-Byte Gate (P0.1).
 * Validates the bytes about to leave the client — independent of Import P0 path gate.
 */

import { randomUUID } from "crypto";
import {
  detectStrictContentKind,
  extensionFromName,
  type StrictContentKind,
} from "./file-security";
import { FILE_UPLOAD_CONTENT_UNREADABLE_MESSAGE } from "../../shared/files";

export { FILE_UPLOAD_CONTENT_UNREADABLE_MESSAGE };

export type UploadByteGateStatus = "PASS" | "NOT_APPLICABLE" | "REJECT";

export type UploadByteGateReason =
  | "signature-match"
  | "signature-mismatch"
  | "type-not-applicable"
  | "empty-bytes";

export interface UploadByteGateResult {
  status: UploadByteGateStatus;
  extension: string;
  expectedKinds: StrictContentKind[];
  actualKind: StrictContentKind;
  bytesInspected: number;
  reason: UploadByteGateReason;
}

/** Knowledge-required STRICT set for this release (PRD §4.1). */
const UPLOAD_STRICT_KINDS: Record<string, StrictContentKind[]> = {
  pdf: ["pdf"],
  docx: ["zip"],
  xlsx: ["zip"],
  doc: ["ole"],
  xls: ["ole"],
};

const SIGNATURE_WINDOW = 16 * 1024;

export function uploadStrictExpectedKinds(
  extension: string,
): StrictContentKind[] {
  return UPLOAD_STRICT_KINDS[extension] ?? [];
}

/**
 * Assert upload buffer is readable as declared type for STRICT extensions.
 * MUST depend only on fileName + bytes (no path I/O, no SDK).
 */
export function assertUploadBytesReadable(
  fileName: string,
  bytes: Uint8Array | Buffer,
): UploadByteGateResult {
  const extension = extensionFromName(fileName);
  const expectedKinds = uploadStrictExpectedKinds(extension);

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

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length === 0) {
    return {
      status: "REJECT",
      extension,
      expectedKinds,
      actualKind: "unknown",
      bytesInspected: 0,
      reason: "empty-bytes",
    };
  }

  const window = buf.subarray(0, Math.min(buf.length, SIGNATURE_WINDOW));
  const actualKind = detectStrictContentKind(window);

  if (expectedKinds.includes(actualKind)) {
    return {
      status: "PASS",
      extension,
      expectedKinds,
      actualKind,
      bytesInspected: window.length,
      reason: "signature-match",
    };
  }

  return {
    status: "REJECT",
    extension,
    expectedKinds,
    actualKind,
    bytesInspected: window.length,
    reason: "signature-mismatch",
  };
}

/** Metadata-only CONTENT_UPLOAD_CHECK log. Never log file bytes. */
export function logUploadByteCheckEvent(input: {
  result: UploadByteGateResult;
  errorCode?: string | null;
  fileName?: string;
  operationId?: string;
}): void {
  try {
    const status =
      input.result.status === "PASS"
        ? "PASS"
        : input.result.status === "NOT_APPLICABLE"
          ? "SKIP"
          : "BLOCK";
    const base =
      input.fileName?.replace(/^.*[/\\]/, "") ?? undefined;
    console.info(
      JSON.stringify({
        operationId: input.operationId ?? randomUUID(),
        stage: "CONTENT_UPLOAD_CHECK",
        status,
        fileName: base,
        extension: input.result.extension,
        expectedKinds: input.result.expectedKinds,
        actualKind: input.result.actualKind,
        bytesInspected: input.result.bytesInspected,
        errorCode: input.errorCode ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    // Logger failure must not change Gate decision.
  }
}
