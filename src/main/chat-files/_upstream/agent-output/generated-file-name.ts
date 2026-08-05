/**
 * Filename sanitization and unique-name resolution for generated agent-output docs.
 */

import { existsSync } from "fs";
import { join } from "path";

/** Strip Windows-illegal / control characters and cap length. */
export function sanitizeGeneratedFileName(title: string): string {
  const cleaned = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 80);

  return cleaned || "generated-report";
}

export function createGeneratedFileName(
  title: string,
  extension: "md" | "txt",
): string {
  return `${sanitizeGeneratedFileName(title)}.${extension}`;
}

/**
 * Sanitize a session id for use as a single directory segment (no path separators).
 */
export function sanitizeSessionDirSegment(sessionId: string): string {
  const cleaned = sessionId
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.\./g, "-")
    .trim()
    .slice(0, 120);
  return cleaned || "session";
}

/**
 * If `baseName` exists under `dir`, append " (1)", " (2)", … before the extension.
 */
export function resolveUniqueFileName(dir: string, baseName: string): string {
  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : "";

  let candidate = baseName;
  let n = 0;
  while (existsSync(join(dir, candidate))) {
    n += 1;
    candidate = `${stem} (${n})${ext}`;
  }
  return candidate;
}
