/**
 * Builds `FilePreviewDescriptor`s for the File Preview Panel.
 * Reads are capped and streamed — Main never buffers an entire large file
 * before answering a preview request (PRD §26 perf constraints).
 */

import { createReadStream, existsSync, statSync } from "fs";
import { pathToFileURL } from "url";
import {
  makeFileError,
  type FileError,
  type FilePreviewDescriptor,
  type FilePreviewOptions,
  type ManagedFile,
  type ManagedFileCategory,
  type PreviewType,
} from "../../shared/files";
import {
  getManagedFile,
  getParsedDocument,
  normalizeProfileId,
} from "./file-association-store";

/** Text preview cap — larger files are truncated, never fully buffered. */
export const PREVIEW_TEXT_LIMIT = 2 * 1024 * 1024;

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  java: "java",
  go: "go",
  rs: "rust",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  vue: "javascript",
  svelte: "javascript",
};

function resolvedPath(file: ManagedFile): string | undefined {
  return file.managedPath || file.originalPath;
}

/** Stream a byte range of a file as utf-8 text. */
function readTextPreview(
  path: string,
  limit: number,
  offset = 0,
): Promise<{
  content: string;
  truncated: boolean;
  offset: number;
  nextOffset?: number;
  totalBytes: number;
}> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    try {
      size = statSync(path).size;
    } catch (err) {
      reject(err);
      return;
    }
    const start = Math.max(0, Math.min(offset, size));
    const endExclusive = Math.min(size, start + Math.max(1, limit));
    const truncated = endExclusive < size;
    if (start >= size) {
      resolvePromise({
        content: "",
        truncated: false,
        offset: start,
        totalBytes: size,
      });
      return;
    }
    const chunks: Buffer[] = [];
    let received = 0;
    const stream = createReadStream(path, {
      start,
      end: Math.max(start, endExclusive - 1),
    });
    stream.on("data", (chunk: string | Buffer) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      chunks.push(buf);
      received += buf.length;
    });
    stream.on("error", reject);
    stream.on("end", () => {
      const content = Buffer.concat(chunks, received).toString("utf-8");
      resolvePromise({
        content,
        truncated,
        offset: start,
        nextOffset: truncated ? endExclusive : undefined,
        totalBytes: size,
      });
    });
  });
}

function unsupported(
  fileId: string,
  title: string,
  mime: string,
  reason: string,
): FilePreviewDescriptor {
  return {
    fileId,
    type: "unsupported",
    title,
    mime,
    canOpenExternal: true,
    canSaveAs: true,
    canCopyText: false,
    canAddToContext: false,
    canRetryParse: false,
    unsupportedReason: reason,
  };
}

function previewTypeForCategory(category: ManagedFileCategory): PreviewType {
  switch (category) {
    case "image":
      return "image";
    case "pdf":
      return "pdf";
    case "markdown":
      return "markdown";
    case "code":
      return "code";
    case "text":
      return "text";
    case "html":
      return "html";
    case "office":
      return "office";
    default:
      return "unsupported";
  }
}

/**
 * Build the preview descriptor for a managed file. Renderer-safe — never
 * includes absolute paths beyond a `file://` localUrl for image/pdf types.
 */
// @lat: [[file-platform#File preview]]
export async function getPreviewDescriptor(
  profile: string | undefined,
  fileId: string,
  options?: FilePreviewOptions,
): Promise<FilePreviewDescriptor | { error: FileError }> {
  const profileId = normalizeProfileId(profile);
  const file = getManagedFile(profileId, fileId);
  if (!file) {
    return { error: makeFileError("FILE_NOT_FOUND", "Managed file not found") };
  }

  const path = resolvedPath(file);
  if (!path || !existsSync(path)) {
    return {
      error: makeFileError("FILE_NOT_FOUND", "File is missing from disk", {
        detail: "missing-on-disk",
      }),
    };
  }

  const type = previewTypeForCategory(file.category);

  if (type === "image") {
    return {
      fileId,
      type: "image",
      title: file.name,
      mime: file.mime,
      localUrl: pathToFileURL(path).toString(),
      canOpenExternal: true,
      canSaveAs: true,
      canCopyText: false,
      canAddToContext: false,
      canRetryParse: false,
    };
  }

  if (type === "pdf") {
    return {
      fileId,
      type: "pdf",
      title: file.name,
      mime: file.mime,
      localUrl: pathToFileURL(path).toString(),
      canOpenExternal: true,
      canSaveAs: true,
      canCopyText: false,
      canAddToContext: false,
      canRetryParse: false,
    };
  }

  if (type === "office") {
    const doc = getParsedDocument(fileId);
    if (doc && doc.text) {
      return {
        fileId,
        type: "office",
        title: file.name,
        mime: file.mime,
        content: doc.text,
        truncated: doc.truncated,
        canOpenExternal: true,
        canSaveAs: true,
        canCopyText: true,
        canAddToContext: false,
        canRetryParse: false,
      };
    }
    return unsupported(fileId, file.name, file.mime, "Parse in Phase 4");
  }

  if (type === "text" || type === "markdown" || type === "code" || type === "html") {
    try {
      const limit = Math.max(1, options?.limit ?? PREVIEW_TEXT_LIMIT);
      const offset = Math.max(0, options?.offset ?? 0);
      const {
        content,
        truncated,
        offset: start,
        nextOffset,
        totalBytes,
      } = await readTextPreview(path, limit, offset);
      return {
        fileId,
        type,
        title: file.name,
        mime: file.mime,
        content,
        truncated,
        offset: start,
        nextOffset,
        totalBytes,
        encoding: "utf-8",
        language:
          type === "code" ? EXTENSION_TO_LANGUAGE[file.extension] || undefined : undefined,
        canOpenExternal: true,
        canSaveAs: true,
        canCopyText: true,
        canAddToContext: false,
        canRetryParse: false,
      };
    } catch (err) {
      return {
        error: makeFileError("FILE_READ_FAILED", "Failed to read file for preview", {
          detail: err instanceof Error ? err.message : String(err),
        }),
      };
    }
  }

  return unsupported(
    fileId,
    file.name,
    file.mime,
    `Preview is not available for ${file.category} files`,
  );
}
