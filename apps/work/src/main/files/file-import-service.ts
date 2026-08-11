/**
 * File import pipeline: path import + clipboard staging → ManagedFile + association.
 */

import { randomUUID } from "crypto";
import { basename, extname } from "path";
import { existsSync } from "fs";
import {
  makeFileError,
  type ClipboardFileInput,
  type FileAssociation,
  type FileImportContext,
  type FileImportResult,
  type ManagedFile,
} from "../../shared/files";
import { readDesktopFilesConfig } from "./file-config";
import {
  assertImportAllowed,
  FilePlatformError,
} from "./file-security";
import {
  ensureFilesLayout,
  stageClipboardBytes,
  storeManagedCopy,
} from "./file-store";
import {
  findByHash,
  insertAssociation,
  normalizeProfileId,
  upsertManagedFile,
} from "./file-association-store";
import { scheduleParseAfterImport } from "./file-parse-service";
import { extensionFromName, resolveFileCategory, resolveMime } from "./file-category";
import {
  hashOrError,
  nowIso,
  readFileSize,
  toManagedFileView,
} from "./file-metadata";
import { defaultFilePathPolicy } from "./file-path-policy";

function profileOrDefault(profile?: string): string {
  return normalizeProfileId(profile);
}

export async function importOnePath(
  filePath: string,
  context: FileImportContext,
): Promise<FileImportResult> {
  const profileId = profileOrDefault(context.profile);
  const config = readDesktopFilesConfig(context.profile);

  let canonical: string;
  try {
    const resolved = await defaultFilePathPolicy.resolveAndValidate(filePath);
    canonical = resolved.realPath;
  } catch (err) {
    const fe =
      err instanceof FilePlatformError
        ? err.fileError
        : makeFileError("FILE_PATH_OUTSIDE_POLICY", "Invalid file path");
    return { ok: false, error: fe };
  }

  const sizeResult = readFileSize(canonical);
  if ("error" in sizeResult) return { ok: false, error: sizeResult.error };
  const size = sizeResult.size;

  const name = basename(canonical);
  const denied = assertImportAllowed(name, size, config);
  if (denied) return { ok: false, error: denied };

  const hashResult = await hashOrError(canonical);
  if ("error" in hashResult) return { ok: false, error: hashResult.error };
  const hash = hashResult.hash;

  const existing = findByHash(profileId, hash);
  const ts = nowIso();
  let managedPath: string | undefined = existing?.managedPath;
  const shouldCopy =
    config.managedStorage &&
    (context.source === "clipboard" || config.copyPickerFiles);

  if (shouldCopy && !managedPath) {
    try {
      managedPath = await storeManagedCopy(canonical, hash, context.profile);
    } catch (err) {
      const fe =
        err instanceof FilePlatformError
          ? err.fileError
          : makeFileError("FILE_STORAGE_FAILED", "Failed to store managed copy");
      return { ok: false, error: fe };
    }
  }

  const mime = resolveMime(name);
  const category = resolveFileCategory(name, mime);
  const file: ManagedFile = existing
    ? {
        ...existing,
        name,
        extension: extensionFromName(name),
        mime,
        category,
        source: context.source,
        status: managedPath || existing.managedPath ? "stored" : "ready",
        size,
        originalPath: canonical,
        managedPath: managedPath || existing.managedPath,
        contentHash: hash,
        updatedAt: ts,
      }
    : {
        id: randomUUID(),
        profileId,
        name,
        extension: extensionFromName(name),
        mime,
        category,
        source: context.source,
        status: managedPath ? "stored" : "ready",
        size,
        originalPath: canonical,
        managedPath,
        contentHash: hash,
        createdAt: ts,
        updatedAt: ts,
      };

  upsertManagedFile(file);
  scheduleParseAfterImport(context.profile, file.id);

  const assoc: FileAssociation = {
    id: randomUUID(),
    fileId: file.id,
    profileId,
    sessionId: context.sessionId,
    role: "prompt-attachment",
    ordinal: 0,
    createdAt: ts,
  };
  insertAssociation(assoc);

  return {
    ok: true,
    file: toManagedFileView(file, {
      associationRole: assoc.role,
      ordinal: assoc.ordinal,
    }),
  };
}

export async function stageClipboardImport(
  input: ClipboardFileInput,
  context: FileImportContext,
): Promise<FileImportResult> {
  const profileId = profileOrDefault(context.profile);
  const config = readDesktopFilesConfig(context.profile);
  const filename =
    input?.filename || `clipboard${extname(input?.filename || "") || ".bin"}`;
  const base64 = input?.base64Bytes || "";
  let size = 0;
  try {
    size = Buffer.from(base64, "base64").byteLength;
  } catch {
    return {
      ok: false,
      error: makeFileError("FILE_ENCODING_FAILED", "Invalid base64 payload"),
    };
  }

  const denied = assertImportAllowed(filename, size, config);
  if (denied) return { ok: false, error: denied };

  let stagedPath: string;
  try {
    stagedPath = stageClipboardBytes(context.sessionId, filename, base64);
  } catch (err) {
    return {
      ok: false,
      error: makeFileError("FILE_STORAGE_FAILED", "Failed to stage clipboard file", {
        detail: err instanceof Error ? err.message : String(err),
      }),
    };
  }

  ensureFilesLayout(context.profile);

  let hash: string | undefined;
  let managedPath: string | undefined = stagedPath;
  try {
    const hashResult = await hashOrError(stagedPath);
    if ("hash" in hashResult) {
      hash = hashResult.hash;
      if (config.managedStorage) {
        managedPath = await storeManagedCopy(stagedPath, hash, context.profile);
      }
    }
  } catch {
    hash = undefined;
  }

  const existing = hash ? findByHash(profileId, hash) : null;
  const ts = nowIso();
  const mime = resolveMime(filename, input.mime);
  const category = resolveFileCategory(filename, mime);
  const file: ManagedFile = existing
    ? {
        ...existing,
        name: filename,
        extension: extensionFromName(filename),
        mime,
        category,
        source: "clipboard",
        status: "stored",
        size,
        originalPath: stagedPath,
        managedPath: managedPath || existing.managedPath || stagedPath,
        contentHash: hash || existing.contentHash,
        updatedAt: ts,
      }
    : {
        id: randomUUID(),
        profileId,
        name: filename,
        extension: extensionFromName(filename),
        mime,
        category,
        source: "clipboard",
        status: "stored",
        size,
        originalPath: stagedPath,
        managedPath: managedPath || stagedPath,
        contentHash: hash,
        createdAt: ts,
        updatedAt: ts,
      };

  upsertManagedFile(file);
  scheduleParseAfterImport(context.profile, file.id);
  const assoc: FileAssociation = {
    id: randomUUID(),
    fileId: file.id,
    profileId,
    sessionId: context.sessionId,
    role: "prompt-attachment",
    ordinal: 0,
    createdAt: ts,
  };
  insertAssociation(assoc);

  return {
    ok: true,
    file: toManagedFileView(file, {
      associationRole: assoc.role,
      ordinal: assoc.ordinal,
    }),
  };
}

/** Re-export for agent-output registration path checks. */
export { existsSync };
