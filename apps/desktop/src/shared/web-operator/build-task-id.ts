import { createHash } from "crypto";

function normalizeIdentityPart(value: string, field: "source" | "requestId"): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

/** Stable task id from source + requestId (Main process only — uses Node `crypto`). */
export function buildTaskId(source: string, requestId: string): string {
  const normalizedSource = normalizeIdentityPart(source, "source");
  const normalizedRequestId = normalizeIdentityPart(requestId, "requestId");
  const raw = `${normalizedSource}:${normalizedRequestId}`;
  return `wot_${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}
