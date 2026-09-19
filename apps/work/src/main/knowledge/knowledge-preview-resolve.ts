/**
 * Resolve Knowledge source_file_id → ManagedFile for document preview.
 * Path A (cache) → Path A-Job → Path B (F10 download materialize).
 * DH-01: F10 bytes are the current active version content.
 */

import { createHash, randomUUID } from "crypto";
import { existsSync, writeFileSync } from "fs";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import type { KnowledgeActiveDataMode } from "../../shared/knowledge/knowledge-job-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import type { FileAssociation, ManagedFile } from "../../shared/files";
import { readDesktopFilesConfig } from "../files/file-config";
import {
  findByHash,
  getManagedFile,
  insertAssociation,
  normalizeProfileId,
  upsertManagedFile,
} from "../files/file-association-store";
import { resolveFileCategory, resolveMime } from "../files/file-category";
import { nowIso } from "../files/file-metadata";
import {
  allocateTempPath,
  ensureFilesLayout,
  storeManagedCopy,
} from "../files/file-store";
import { assertImportAllowed } from "../files/file-security";
import {
  getPreviewCache,
  unbindPreviewCache,
  upsertPreviewCache,
  versionsMatch,
} from "./knowledge-preview-cache-store";
import { findCompletedJobsByRemoteSourceFileId } from "./knowledge-upload-job-store";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";
import { getKnowledgeModeSnapshot } from "./knowledge-mode-controller";

const DOWNLOAD_TIMEOUT_MS = 60_000;

export type ResolveDocumentPreviewInput = {
  sourceFileId: string;
  activeVersionId?: string | null;
  forceRefresh?: boolean;
  workProfileId?: string;
  /** Display name hint when materializing (optional). */
  fileName?: string | null;
  mimeType?: string | null;
};

export type ResolveDocumentPreviewResult = {
  managedFileId: string;
};

export type DownloadSourceFileResult = {
  bytes: Uint8Array;
  fileName?: string;
};

export type ResolveDocumentPreviewDeps = {
  getCache: typeof getPreviewCache;
  upsertCache: typeof upsertPreviewCache;
  unbindCache: typeof unbindPreviewCache;
  getFile: typeof getManagedFile;
  findJobs: typeof findCompletedJobsByRemoteSourceFileId;
  getDataMode: () => KnowledgeActiveDataMode;
  downloadSourceFile: (input: {
    sourceFileId: string;
  }) => Promise<DownloadSourceFileResult>;
  materializeBytes: (input: {
    workProfileId: string;
    sourceFileId: string;
    activeVersionId: string | null;
    bytes: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  }) => Promise<{ managedFileId: string; associationId: string }>;
};

function managedFileReadable(
  profileId: string,
  managedFileId: string,
  getFile: typeof getManagedFile,
): boolean {
  const file = getFile(profileId, managedFileId);
  if (!file?.managedPath) return false;
  return existsSync(file.managedPath);
}

function pickJobManagedFileId(
  hits: ReturnType<typeof findCompletedJobsByRemoteSourceFileId>,
  dataMode: KnowledgeActiveDataMode,
  workProfileId: string,
  getFile: typeof getManagedFile,
): string | null {
  for (const hit of hits) {
    if (dataMode === "provider" && hit.dataMode === "mock") continue;
    if (dataMode === "mock" && hit.dataMode !== "mock") continue;
    if (hit.dataMode === "legacy-unclassified") continue;
    if (!managedFileReadable(workProfileId, hit.managedFileId, getFile)) {
      continue;
    }
    return hit.managedFileId;
  }
  return null;
}

function isSqliteUniqueConstraint(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    Boolean(e.message && /\bUNIQUE\b/i.test(e.message))
  );
}

export async function materializeKnowledgePreviewBytes(input: {
  workProfileId: string;
  sourceFileId: string;
  activeVersionId: string | null;
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
}): Promise<{ managedFileId: string; associationId: string }> {
  const profileId = normalizeProfileId(input.workProfileId);
  const profileArg = profileId === "default" ? undefined : profileId;
  const config = readDesktopFilesConfig(profileArg);
  const fileName = (input.fileName || `${input.sourceFileId}.bin`).trim();
  const size = input.bytes.byteLength;
  const denied = assertImportAllowed(fileName, size, config);
  if (denied) {
    throw new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.PREVIEW_TOO_LARGE,
      retryable: false,
      messageKey: "knowledge.documents.previewTooLarge",
    });
  }

  const hash = createHash("sha256").update(input.bytes).digest("hex");
  let existing = findByHash(profileId, hash);
  const ts = nowIso();
  const mime = resolveMime(fileName, input.mimeType ?? undefined);
  const category = resolveFileCategory(fileName, mime);
  const extension = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
    : "bin";

  let managedPath = existing?.managedPath;
  const pathReadable = Boolean(managedPath && existsSync(managedPath));

  if (!pathReadable) {
    ensureFilesLayout(profileArg);
    const tempPath = allocateTempPath(fileName, profileArg);
    writeFileSync(tempPath, Buffer.from(input.bytes));
    managedPath = config.managedStorage
      ? await storeManagedCopy(tempPath, hash, profileArg)
      : tempPath;
  }

  let file: ManagedFile = existing
    ? {
        ...existing,
        name: fileName,
        extension,
        mime,
        category,
        source: existing.source ?? "workspace",
        status: "stored",
        size,
        managedPath: managedPath || existing.managedPath,
        contentHash: hash,
        updatedAt: ts,
        locality: "local",
      }
    : {
        id: randomUUID(),
        profileId,
        name: fileName,
        extension,
        mime,
        category,
        source: "workspace",
        status: "stored",
        size,
        managedPath,
        contentHash: hash,
        createdAt: ts,
        updatedAt: ts,
        locality: "local",
      };

  try {
    upsertManagedFile(file);
  } catch (err) {
    // Concurrent Path B / prior upload: same (profile, hash) already inserted.
    if (!isSqliteUniqueConstraint(err)) throw err;
    existing = findByHash(profileId, hash);
    if (!existing) throw err;
    file = {
      ...existing,
      name: fileName,
      extension,
      mime,
      category,
      source: existing.source ?? "workspace",
      status: "stored",
      size,
      managedPath: existing.managedPath || managedPath,
      contentHash: hash,
      updatedAt: ts,
      locality: "local",
    };
    upsertManagedFile(file);
  }

  const associationId = randomUUID();
  const assoc: FileAssociation = {
    id: associationId,
    fileId: file.id,
    profileId,
    role: "reference",
    ordinal: 0,
    createdAt: ts,
    dataMode: "provider",
  };
  insertAssociation(assoc);

  return { managedFileId: file.id, associationId };
}

function defaultDeps(): ResolveDocumentPreviewDeps {
  return {
    getCache: getPreviewCache,
    upsertCache: upsertPreviewCache,
    unbindCache: unbindPreviewCache,
    getFile: getManagedFile,
    findJobs: findCompletedJobsByRemoteSourceFileId,
    getDataMode: () => getKnowledgeModeSnapshot().dataMode,
    downloadSourceFile: (input) =>
      getKnowledgeHttpProvider().downloadSourceFile(input),
    materializeBytes: materializeKnowledgePreviewBytes,
  };
}

/**
 * Resolve a ManagedFile id for Knowledge document preview.
 * forceRefresh / version mismatch unbinds prior cache (materialize assoc only).
 */
export async function resolveDocumentPreview(
  input: ResolveDocumentPreviewInput,
  deps: ResolveDocumentPreviewDeps = defaultDeps(),
): Promise<ResolveDocumentPreviewResult> {
  const sourceFileId = input.sourceFileId.trim();
  if (!sourceFileId) {
    throw new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
      retryable: false,
    });
  }
  const workProfileId = normalizeProfileId(input.workProfileId);
  const activeVersionId = input.activeVersionId ?? null;
  const forceRefresh = Boolean(input.forceRefresh);

  if (forceRefresh) {
    deps.unbindCache(workProfileId, sourceFileId);
  }

  if (!forceRefresh) {
    const cached = deps.getCache(workProfileId, sourceFileId);
    if (
      cached &&
      versionsMatch(cached.activeVersionId, activeVersionId) &&
      managedFileReadable(workProfileId, cached.managedFileId, deps.getFile)
    ) {
      return { managedFileId: cached.managedFileId };
    }
    if (cached && !versionsMatch(cached.activeVersionId, activeVersionId)) {
      deps.unbindCache(workProfileId, sourceFileId);
    }
  }

  const jobHits = deps.findJobs({
    workProfileId,
    sourceFileId,
  });
  const jobManagedId = pickJobManagedFileId(
    jobHits,
    deps.getDataMode(),
    workProfileId,
    deps.getFile,
  );
  if (jobManagedId) {
    deps.upsertCache({
      workProfileId,
      sourceFileId,
      managedFileId: jobManagedId,
      activeVersionId,
      materializeAssociationId: null,
    });
    return { managedFileId: jobManagedId };
  }

  // Path B — F10 download (DH-01: active version bytes).
  const downloaded = await deps.downloadSourceFile({ sourceFileId });
  const fileName =
    downloaded.fileName?.trim() ||
    input.fileName?.trim() ||
    `${sourceFileId}.bin`;
  const materialized = await deps.materializeBytes({
    workProfileId,
    sourceFileId,
    activeVersionId,
    bytes: downloaded.bytes,
    fileName,
    mimeType: input.mimeType,
  });
  deps.upsertCache({
    workProfileId,
    sourceFileId,
    managedFileId: materialized.managedFileId,
    activeVersionId,
    materializeAssociationId: materialized.associationId,
  });
  return { managedFileId: materialized.managedFileId };
}

export const KNOWLEDGE_PREVIEW_DOWNLOAD_TIMEOUT_MS = DOWNLOAD_TIMEOUT_MS;
