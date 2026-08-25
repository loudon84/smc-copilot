/**
 * Builds `FilePreviewDescriptor`s for the File Preview Panel.
 * Reads are capped and streamed — Main never buffers an entire large file
 * before answering a preview request (PRD §26 perf constraints).
 */

import { createReadStream, existsSync, readFileSync, renameSync, rmSync, statSync } from "fs";
import { protocol } from "electron";
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
  ExpertGatewayError,
  getExpertGatewayClient,
} from "../expert/expert-gateway-client";
import {
  getManagedFile,
  getParsedDocument,
  normalizeProfileId,
  upsertManagedFile,
} from "./file-association-store";
import { readDesktopFilesConfig } from "./file-config";
import { FilePlatformError } from "./file-security";
import {
  invalidatePreviewCache,
  resolvePreviewCachePath,
  streamExpertArtifactBytes,
} from "./expert-artifact-transfer";
import { nowIso } from "./file-metadata";

/** Text preview cap — larger files are truncated, never fully buffered. */
export const PREVIEW_TEXT_LIMIT = 2 * 1024 * 1024;

export const FILE_PREVIEW_SCHEME = "hermes-file-preview";

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

/** fileId → absolute preview cache path (Main only; never sent to Renderer). */
const previewCacheByFileId = new Map<string, string>();

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
    canOpenExternal: false,
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

function previewSchemeUrl(fileId: string): string {
  return `${FILE_PREVIEW_SCHEME}://${encodeURIComponent(fileId)}`;
}

function markAvailability(
  file: ManagedFile,
  availability: NonNullable<ManagedFile["availability"]>,
): void {
  upsertManagedFile({
    ...file,
    availability,
    updatedAt: nowIso(),
  });
  if (availability === "forbidden" && file.provider && file.remoteArtifactId) {
    invalidatePreviewCache({
      profile: file.profileId,
      provider: file.provider,
      remoteArtifactId: file.remoteArtifactId,
      contentHash: file.contentHash,
    });
    previewCacheByFileId.delete(file.id);
  }
}

function mapRemotePreviewError(
  err: unknown,
  file: ManagedFile,
): { error: FileError } {
  if (err instanceof ExpertGatewayError) {
    if (err.status === 403) {
      markAvailability(file, "forbidden");
      return {
        error: makeFileError("FILE_REMOTE_FORBIDDEN", err.message, {
          detail: err.errorCode ?? undefined,
        }),
      };
    }
    if (err.status === 404) {
      markAvailability(file, "not-found");
      return {
        error: makeFileError("FILE_REMOTE_NOT_FOUND", err.message, {
          detail: err.errorCode ?? undefined,
        }),
      };
    }
    markAvailability(file, "unavailable");
    return {
      error: makeFileError("FILE_REMOTE_UNAVAILABLE", err.message, {
        retryable: true,
        detail: err.errorCode ?? undefined,
      }),
    };
  }
  if (err instanceof FilePlatformError) {
    if (err.fileError.code === "FILE_REMOTE_FORBIDDEN") {
      markAvailability(file, "forbidden");
    } else if (err.fileError.code === "FILE_REMOTE_NOT_FOUND") {
      markAvailability(file, "not-found");
    } else if (
      err.fileError.code === "FILE_REMOTE_UNAVAILABLE" ||
      err.fileError.code === "FILE_TOO_LARGE" ||
      err.fileError.code === "FILE_INTEGRITY_MISMATCH"
    ) {
      markAvailability(file, "unavailable");
    }
    return { error: err.fileError };
  }
  return {
    error: makeFileError(
      "FILE_REMOTE_UNAVAILABLE",
      err instanceof Error ? err.message : "Remote preview failed",
      { retryable: true },
    ),
  };
}

async function getRemotePreviewDescriptor(
  profileId: string,
  file: ManagedFile,
  options?: FilePreviewOptions,
): Promise<FilePreviewDescriptor | { error: FileError }> {
  if (file.availability === "forbidden") {
    return {
      error: makeFileError(
        "FILE_REMOTE_FORBIDDEN",
        "Artifact is forbidden",
      ),
    };
  }
  if (file.availability === "not-found") {
    return {
      error: makeFileError("FILE_REMOTE_NOT_FOUND", "Artifact was not found"),
    };
  }
  if (file.canPreview === false) {
    return unsupported(
      file.id,
      file.name,
      file.mime,
      "Preview is not supported for this artifact",
    );
  }

  const config = readDesktopFilesConfig(
    profileId === "default" ? undefined : profileId,
  );
  const type = previewTypeForCategory(file.category);
  const artifactId = file.remoteArtifactId;
  if (!artifactId || !file.provider) {
    return {
      error: makeFileError("FILE_NOT_FOUND", "Remote artifact identity missing"),
    };
  }

  const textTypes: PreviewType[] = ["text", "markdown", "code", "html"];
  const useProviderPreview =
    file.providerPreviewSupported === true && textTypes.includes(type);

  if (useProviderPreview) {
    try {
      const gateway = getExpertGatewayClient();
      const preview = await gateway.getArtifactPreview(artifactId);
      const limit = Math.max(1, options?.limit ?? PREVIEW_TEXT_LIMIT);
      const offset = Math.max(0, options?.offset ?? 0);
      const full = preview.content;
      const slice = full.slice(offset, offset + limit);
      const truncated =
        preview.truncated === true || offset + limit < full.length;
      if (file.availability !== "available") {
        markAvailability(file, "available");
      }
      return {
        fileId: file.id,
        type,
        title: file.name,
        mime: file.mime,
        content: slice,
        truncated,
        offset,
        nextOffset: truncated ? offset + slice.length : undefined,
        totalBytes: full.length,
        encoding: preview.encoding || "utf-8",
        language:
          type === "code"
            ? EXTENSION_TO_LANGUAGE[file.extension] || undefined
            : undefined,
        canOpenExternal: false,
        canSaveAs: true,
        canCopyText: true,
        canAddToContext: true,
        canRetryParse: false,
      };
    } catch (err) {
      return mapRemotePreviewError(err, file);
    }
  }

  // Binary/rich client preview via authorized Download → preview cache.
  if (type !== "image" && type !== "pdf") {
    return unsupported(
      file.id,
      file.name,
      file.mime,
      "Preview is not available for this remote artifact type",
    );
  }

  const cachePath = resolvePreviewCachePath({
    profile: profileId,
    provider: file.provider,
    remoteArtifactId: artifactId,
    contentHash: file.contentHash,
  });

  const allowOffline = config.preview.allowOfflineCachedCopy === true;
  if (existsSync(cachePath)) {
    if (!allowOffline) {
      // Still allow using cache only after a successful network check is not
      // required when we just wrote it in this session — but PRD: offline denied
      // by default. Prefer re-fetch; if network fails and allowOffline false, error.
    } else {
      previewCacheByFileId.set(file.id, cachePath);
      return {
        fileId: file.id,
        type,
        title: file.name,
        mime: file.mime,
        localUrl: previewSchemeUrl(file.id),
        canOpenExternal: false,
        canSaveAs: true,
        canCopyText: false,
        canAddToContext: true,
        canRetryParse: false,
        cachedCopy: true,
      };
    }
  }

  try {
    const maxBytes = Math.max(1, config.preview.maxPreviewMb) * 1024 * 1024;
    const transferred = await streamExpertArtifactBytes({
      artifactId,
      expectedSha256: file.contentHash,
      profile: profileId === "default" ? undefined : profileId,
      maxBytes,
    });
    try {
      if (existsSync(cachePath)) rmSync(cachePath, { force: true });
      renameSync(transferred.path, cachePath);
    } catch {
      // Fall back to temp path if rename fails.
      previewCacheByFileId.set(file.id, transferred.path);
      if (file.availability !== "available") {
        markAvailability(file, "available");
      }
      return {
        fileId: file.id,
        type,
        title: file.name,
        mime: file.mime,
        localUrl: previewSchemeUrl(file.id),
        canOpenExternal: false,
        canSaveAs: true,
        canCopyText: false,
        canAddToContext: true,
        canRetryParse: false,
      };
    }
    previewCacheByFileId.set(file.id, cachePath);
    if (file.availability !== "available") {
      markAvailability(file, "available");
    }
    return {
      fileId: file.id,
      type,
      title: file.name,
      mime: file.mime,
      localUrl: previewSchemeUrl(file.id),
      canOpenExternal: false,
      canSaveAs: true,
      canCopyText: false,
      canAddToContext: true,
      canRetryParse: false,
    };
  } catch (err) {
    if (existsSync(cachePath) && allowOffline) {
      previewCacheByFileId.set(file.id, cachePath);
      return {
        fileId: file.id,
        type,
        title: file.name,
        mime: file.mime,
        localUrl: previewSchemeUrl(file.id),
        canOpenExternal: false,
        canSaveAs: true,
        canCopyText: false,
        canAddToContext: true,
        canRetryParse: false,
        cachedCopy: true,
      };
    }
    return mapRemotePreviewError(err, file);
  }
}

/**
 * Build the preview descriptor for a managed file. Renderer-safe — never
 * includes absolute paths for remote resources (uses hermes-file-preview://).
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

  if (file.locality === "remote") {
    return getRemotePreviewDescriptor(profileId, file, options);
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
          type === "code"
            ? EXTENSION_TO_LANGUAGE[file.extension] || undefined
            : undefined,
        canOpenExternal: true,
        canSaveAs: true,
        canCopyText: true,
        canAddToContext: false,
        canRetryParse: false,
      };
    } catch (err) {
      return {
        error: makeFileError(
          "FILE_READ_FAILED",
          "Failed to read file for preview",
          {
            detail: err instanceof Error ? err.message : String(err),
          },
        ),
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

/** Call before `app.whenReady()` so hermes-file-preview:// is privileged. */
export function registerFilePreviewSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FILE_PREVIEW_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/** Register protocol handler after app ready — serves preview cache by fileId. */
export function registerFilePreviewProtocolHandler(): void {
  protocol.handle(FILE_PREVIEW_SCHEME, (request) => {
    try {
      const url = new URL(request.url);
      const fileId = decodeURIComponent(url.hostname || url.pathname.replace(/^\//, ""));
      const path = previewCacheByFileId.get(fileId);
      if (!path || !existsSync(path)) {
        return new Response("Not found", { status: 404 });
      }
      const buf = readFileSync(path);
      const lower = path.toLowerCase();
      let mime = "application/octet-stream";
      if (lower.endsWith(".pdf")) mime = "application/pdf";
      else if (lower.endsWith(".png")) mime = "image/png";
      else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        mime = "image/jpeg";
      } else if (lower.endsWith(".webp")) mime = "image/webp";
      else if (lower.endsWith(".gif")) mime = "image/gif";
      return new Response(buf, {
        status: 200,
        headers: { "Content-Type": mime },
      });
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  });
}
