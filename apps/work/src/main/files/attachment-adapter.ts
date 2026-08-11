/**
 * Bidirectional bridge between ManagedFile and legacy Attachment.
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { basename } from "path";
import type { Attachment } from "../../shared/attachments";
import {
  isImageMime,
  isTextFile,
  MAX_TEXT_BYTES,
} from "../../shared/attachments";
import {
  classifyFileCategory,
  guessMime,
  makeFileError,
  managedFileToAttachment,
  type ManagedFile,
  type ManagedFileSource,
  type ParsedDocument,
} from "../../shared/files";
import {
  extensionFromName,
  FilePlatformError,
} from "./file-security";

function nowIso(): string {
  return new Date().toISOString();
}

function resolveDiskPath(file: ManagedFile): string | undefined {
  if (file.managedPath && existsSync(file.managedPath)) return file.managedPath;
  if (file.originalPath && existsSync(file.originalPath)) {
    return file.originalPath;
  }
  return file.managedPath || file.originalPath;
}

function readTextFromPath(filePath: string, maxChars: number): string {
  const buf = readFileSync(filePath);
  const text = buf.toString("utf-8");
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function isSmallTextCandidate(
  file: ManagedFile,
  maxInlineTextChars: number,
): boolean {
  if (file.category === "text" || file.category === "markdown" || file.category === "code") {
    return file.size <= Math.min(MAX_TEXT_BYTES, maxInlineTextChars);
  }
  if (isTextFile(file.mime, file.name) && file.size <= Math.min(MAX_TEXT_BYTES, maxInlineTextChars)) {
    return true;
  }
  return false;
}

export async function toManagedFile(
  attachment: Attachment,
  context: {
    profileId: string;
    sessionId: string;
    source: ManagedFileSource;
  },
): Promise<ManagedFile> {
  const name = attachment.name || "file";
  const mime = attachment.mime || guessMime(name);
  const category = classifyFileCategory(name, mime);
  const size =
    typeof attachment.size === "number" && attachment.size >= 0
      ? attachment.size
      : attachment.text
        ? Buffer.byteLength(attachment.text, "utf-8")
        : 0;
  const ts = nowIso();
  const path = attachment.path;

  return {
    id: attachment.id || randomUUID(),
    profileId: context.profileId || "default",
    name,
    extension: extensionFromName(name),
    mime,
    category,
    source: context.source,
    status: path || attachment.dataUrl || attachment.text ? "ready" : "selected",
    size,
    originalPath: path,
    managedPath: path,
    createdAt: ts,
    updatedAt: ts,
  };
}

// @lat: [[file-platform#Attachment adapter]]
export function toHermesAttachment(
  file: ManagedFile,
  options?: {
    parsed?: ParsedDocument;
    mode?: "local" | "remote";
    maxInlineTextChars?: number;
  },
): Attachment {
  const mode = options?.mode ?? "local";
  const maxInline =
    options?.maxInlineTextChars ?? 40_000;
  const id = file.id || randomUUID();
  const name = file.name || "file";
  const mime = file.mime || guessMime(name);
  const diskPath = resolveDiskPath(file);

  // Images → inline data URL (works for local and remote).
  if (file.category === "image" || isImageMime(mime)) {
    if (diskPath && existsSync(diskPath)) {
      const data = readFileSync(diskPath);
      const resolvedMime = mime.startsWith("image/")
        ? mime
        : guessMime(name, "image/png");
      const dataUrl = `data:${resolvedMime};base64,${data.toString("base64")}`;
      return managedFileToAttachment(
        { ...file, id, name, mime: resolvedMime, size: data.length },
        {
          dataUrl,
          path: mode === "local" ? diskPath : undefined,
        },
      );
    }
    throw FilePlatformError.fromCode(
      "FILE_READ_FAILED",
      "Image file is missing on disk",
    );
  }

  // Small text → text-file (prefer parsed text).
  if (isSmallTextCandidate(file, maxInline) || options?.parsed?.text) {
    let text = options?.parsed?.text;
    if (text == null && diskPath && existsSync(diskPath)) {
      try {
        text = readTextFromPath(diskPath, maxInline);
      } catch (err) {
        throw FilePlatformError.fromCode(
          "FILE_READ_FAILED",
          "Failed to read text file",
          { detail: err instanceof Error ? err.message : String(err) },
        );
      }
    }
    if (text != null) {
      const clipped =
        text.length > maxInline ? text.slice(0, maxInline) : text;
      return managedFileToAttachment(
        {
          ...file,
          id,
          name,
          mime: mime.startsWith("text/") ? mime : "text/plain",
          size: Buffer.byteLength(clipped, "utf-8"),
          category:
            file.category === "text" ||
            file.category === "markdown" ||
            file.category === "code"
              ? file.category
              : "text",
        },
        {
          text: clipped,
          path: mode === "local" ? diskPath : undefined,
        },
      );
    }
  }

  // Remote must never emit a local absolute path-ref.
  if (mode === "remote") {
    if (options?.parsed?.text) {
      const clipped =
        options.parsed.text.length > maxInline
          ? options.parsed.text.slice(0, maxInline)
          : options.parsed.text;
      return managedFileToAttachment(
        {
          ...file,
          id,
          name,
          mime: "text/plain",
          size: Buffer.byteLength(clipped, "utf-8"),
          category: "text",
        },
        { text: clipped },
      );
    }
    throw new FilePlatformError(
      makeFileError(
        "FILE_REMOTE_UNSUPPORTED",
        "This file cannot be sent in remote mode without parsed text",
        { detail: file.category },
      ),
    );
  }

  // Local path-ref for PDF / Office / large files.
  const path = diskPath;
  if (!path) {
    throw FilePlatformError.fromCode(
      "FILE_NOT_FOUND",
      "No filesystem path available for path-ref attachment",
    );
  }
  let size = file.size;
  try {
    if (existsSync(path)) size = statSync(path).size;
  } catch {
    // keep existing size
  }

  const attachment = managedFileToAttachment(
    { ...file, id, name: basename(name), mime, size },
    { path },
  );
  return attachment;
}
