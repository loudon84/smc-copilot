/**
 * Composer ↔ File Platform ingest helpers.
 * Prefer hermesAPI.files when available; fall back to legacy processFiles.
 */

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_TARGET_BYTES,
  type Attachment,
} from "../../../../shared/attachments";
import type {
  FileImportContext,
  FileImportResult,
  ManagedFileStatus,
  ManagedFileView,
} from "../../../../shared/files";
import {
  compressImageToFit,
  processFiles,
  type AttachmentError,
} from "./attachmentUtils";

export interface ComposerIngestContext {
  profile?: string;
  sessionId?: string | null;
  remoteMode?: boolean;
}

export interface ComposerIngestResult {
  attachments: Attachment[];
  statusById: Record<string, ManagedFileStatus>;
  errors: AttachmentError[];
  /** File Platform error messages (import failures). */
  platformErrors: string[];
}

function importContext(ctx: ComposerIngestContext): FileImportContext {
  return {
    profile: ctx.profile,
    sessionId: ctx.sessionId || "default",
    mode: ctx.remoteMode ? "remote" : "local",
    source: "picker",
  };
}

function fileErrorToAttachmentError(
  name: string,
  code: string,
): AttachmentError {
  switch (code) {
    case "FILE_TOO_LARGE":
      return { code: "image-too-large", filename: name };
    case "FILE_TYPE_DENIED":
    case "FILE_REMOTE_UNSUPPORTED":
      return { code: "unsupported-type", filename: name };
    case "FILE_ENCODING_FAILED":
    case "FILE_READ_FAILED":
    case "FILE_STORAGE_FAILED":
      return { code: "read-failed", filename: name };
    default:
      return { code: "read-failed", filename: name };
  }
}

async function maybeCompressImageAttachment(
  attachment: Attachment,
): Promise<Attachment> {
  if (attachment.kind !== "image" || !attachment.dataUrl) return attachment;
  if (attachment.size <= MAX_IMAGE_TARGET_BYTES) return attachment;

  const comma = attachment.dataUrl.indexOf(",");
  const base64 = comma >= 0 ? attachment.dataUrl.slice(comma + 1) : "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: attachment.mime });
  const file = new File([blob], attachment.name, { type: attachment.mime });
  try {
    const compressed = await compressImageToFit(file, MAX_IMAGE_TARGET_BYTES);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.readAsDataURL(compressed);
    });
    return {
      ...attachment,
      mime: compressed.type || attachment.mime,
      name: compressed.name || attachment.name,
      size: compressed.size,
      dataUrl,
      originalSize: attachment.size,
    };
  } catch {
    return attachment;
  }
}

async function resolveManagedResults(
  results: FileImportResult[],
  ctx: ComposerIngestContext,
  existingCount: number,
): Promise<ComposerIngestResult> {
  const statusById: Record<string, ManagedFileStatus> = {};
  const errors: AttachmentError[] = [];
  const platformErrors: string[] = [];
  const okViews: ManagedFileView[] = [];

  const slots = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - existingCount);
  let used = 0;

  for (const result of results) {
    if (!result.ok) {
      platformErrors.push(result.error.message);
      errors.push(
        fileErrorToAttachmentError("file", result.error.code),
      );
      continue;
    }
    if (used >= slots) {
      errors.push({ code: "too-many", filename: result.file.name });
      continue;
    }
    used += 1;
    okViews.push(result.file);
    statusById[result.file.id] = result.file.status;
  }

  if (okViews.length === 0) {
    return { attachments: [], statusById, errors, platformErrors };
  }

  const filesApi = window.hermesAPI?.files;
  if (!filesApi?.toAttachments) {
    return {
      attachments: [],
      statusById,
      errors: [
        ...errors,
        ...okViews.map((v) => ({
          code: "read-failed" as const,
          filename: v.name,
        })),
      ],
      platformErrors: [...platformErrors, "files.toAttachments unavailable"],
    };
  }

  let attachments = await filesApi.toAttachments({
    profile: ctx.profile,
    fileIds: okViews.map((v) => v.id),
    mode: ctx.remoteMode ? "remote" : "local",
  });

  attachments = await Promise.all(
    attachments.map((a) => maybeCompressImageAttachment(a)),
  );

  return { attachments, statusById, errors, platformErrors };
}

/** Native managed picker → ManagedFile → Attachment. */
export async function ingestViaPicker(
  ctx: ComposerIngestContext,
  existingCount: number,
): Promise<ComposerIngestResult> {
  const filesApi = window.hermesAPI?.files;
  if (!filesApi?.pickFiles) {
    return {
      attachments: [],
      statusById: {},
      errors: [],
      platformErrors: ["files.pickFiles unavailable"],
    };
  }
  const results = await filesApi.pickFiles(
    { multiple: true },
    { ...importContext(ctx), source: "picker" },
  );
  return resolveManagedResults(results, ctx, existingCount);
}

/** Drop/path import when absolute paths are available. */
export async function ingestViaPaths(
  paths: string[],
  ctx: ComposerIngestContext,
  existingCount: number,
): Promise<ComposerIngestResult> {
  const filesApi = window.hermesAPI?.files;
  if (!filesApi?.importDroppedFiles || paths.length === 0) {
    return { attachments: [], statusById: {}, errors: [], platformErrors: [] };
  }
  const results = await filesApi.importDroppedFiles(paths, {
    ...importContext(ctx),
    source: "drag-drop",
  });
  return resolveManagedResults(results, ctx, existingCount);
}

/** Clipboard / blob files without a disk path → stage then resolve. */
export async function ingestViaClipboardFiles(
  files: File[],
  ctx: ComposerIngestContext,
  existingCount: number,
): Promise<ComposerIngestResult> {
  const filesApi = window.hermesAPI?.files;
  if (!filesApi?.stageClipboardFile || files.length === 0) {
    const legacy = await processFiles(files, existingCount, {
      sessionId: ctx.sessionId || undefined,
      remoteMode: !!ctx.remoteMode,
    });
    return {
      attachments: legacy.attachments,
      statusById: {},
      errors: legacy.errors,
      platformErrors: [],
    };
  }

  const statusById: Record<string, ManagedFileStatus> = {};
  const errors: AttachmentError[] = [];
  const platformErrors: string[] = [];
  const okIds: string[] = [];
  let used = existingCount;

  for (const file of files) {
    if (used >= MAX_ATTACHMENTS_PER_MESSAGE) {
      errors.push({ code: "too-many", filename: file.name });
      continue;
    }

    let base64: string;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const comma = dataUrl.indexOf(",");
      base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
    } catch {
      errors.push({ code: "read-failed", filename: file.name });
      continue;
    }

    const result = await filesApi.stageClipboardFile(
      {
        filename: file.name || "clipboard.bin",
        mime: file.type || "application/octet-stream",
        base64Bytes: base64,
      },
      { ...importContext(ctx), source: "clipboard" },
    );

    if (!result.ok) {
      platformErrors.push(result.error.message);
      errors.push(fileErrorToAttachmentError(file.name, result.error.code));
      continue;
    }
    used += 1;
    okIds.push(result.file.id);
    statusById[result.file.id] = result.file.status;
  }

  if (okIds.length === 0) {
    return { attachments: [], statusById, errors, platformErrors };
  }

  let attachments = await filesApi.toAttachments({
    profile: ctx.profile,
    fileIds: okIds,
    mode: ctx.remoteMode ? "remote" : "local",
  });
  attachments = await Promise.all(
    attachments.map((a) => maybeCompressImageAttachment(a)),
  );
  return { attachments, statusById, errors, platformErrors };
}

/**
 * Ingest browser FileList: prefer disk paths via importDroppedFiles,
 * otherwise stage clipboard-style for pathless blobs.
 */
export async function ingestBrowserFiles(
  files: File[] | FileList,
  ctx: ComposerIngestContext,
  existingCount: number,
): Promise<ComposerIngestResult> {
  const list = Array.from(files);
  const withPaths: string[] = [];
  const withoutPaths: File[] = [];

  for (const file of list) {
    const path = window.hermesAPI?.getPathForFile?.(file) || "";
    if (path) withPaths.push(path);
    else withoutPaths.push(file);
  }

  const merged: ComposerIngestResult = {
    attachments: [],
    statusById: {},
    errors: [],
    platformErrors: [],
  };

  if (withPaths.length > 0) {
    const pathResult = await ingestViaPaths(withPaths, ctx, existingCount);
    merged.attachments.push(...pathResult.attachments);
    Object.assign(merged.statusById, pathResult.statusById);
    merged.errors.push(...pathResult.errors);
    merged.platformErrors.push(...pathResult.platformErrors);
  }

  if (withoutPaths.length > 0) {
    const blobResult = await ingestViaClipboardFiles(
      withoutPaths,
      ctx,
      existingCount + merged.attachments.length,
    );
    merged.attachments.push(...blobResult.attachments);
    Object.assign(merged.statusById, blobResult.statusById);
    merged.errors.push(...blobResult.errors);
    merged.platformErrors.push(...blobResult.platformErrors);
  }

  // Absolute fallback if File Platform produced nothing but we had files.
  if (
    merged.attachments.length === 0 &&
    list.length > 0 &&
    !window.hermesAPI?.files?.pickFiles
  ) {
    const legacy = await processFiles(list, existingCount, {
      sessionId: ctx.sessionId || undefined,
      remoteMode: !!ctx.remoteMode,
    });
    return {
      attachments: legacy.attachments,
      statusById: {},
      errors: legacy.errors,
      platformErrors: [],
    };
  }

  return merged;
}
