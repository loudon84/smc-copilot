/**
 * Category / MIME helpers for managed file import (Main Process).
 * Wraps shared classify helpers for Main-side call sites.
 */

import { classifyFileCategory, guessMime } from "../../shared/files/classify";
import { detectMagicKind, extensionFromName } from "./file-security";
import type { ManagedFileCategory } from "../../shared/files";

export { classifyFileCategory, guessMime };
export { extensionFromName, detectMagicKind };
export type { MagicKind } from "./file-security";

/**
 * Resolve category preferring extension/MIME, with optional magic-byte hint.
 */
export function resolveFileCategory(
  name: string,
  mime?: string,
  magic?: ReturnType<typeof detectMagicKind>,
): ManagedFileCategory {
  const fromName = classifyFileCategory(name, mime);
  if (fromName !== "unknown") return fromName;
  if (magic === "pdf") return "pdf";
  if (magic === "image") return "image";
  if (magic === "text") return "text";
  if (magic === "zip") {
    const ext = extensionFromName(name);
    if (ext === "docx" || ext === "doc") return "office";
    if (ext === "xlsx" || ext === "xls") return "spreadsheet";
    if (ext === "pptx" || ext === "ppt") return "presentation";
    if (ext === "epub") return "epub";
    return "archive";
  }
  return fromName;
}

export function resolveMime(name: string, mime?: string): string {
  if (mime && mime.trim()) return mime;
  return guessMime(name);
}
