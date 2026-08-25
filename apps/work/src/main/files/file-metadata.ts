/**
 * Lightweight metadata helpers used during file import (stat, hash, view mapping).
 */

import { existsSync, statSync } from "fs";
import type { ManagedFile, ManagedFileView } from "../../shared/files";
import { makeFileError, type FileError } from "../../shared/files";
import { FilePlatformError } from "./file-security";
import { hashFileStream } from "./file-store";

export function nowIso(): string {
  return new Date().toISOString();
}

export function readFileSize(filePath: string): { size: number } | { error: FileError } {
  try {
    return { size: statSync(filePath).size };
  } catch (err) {
    return {
      error: makeFileError("FILE_READ_FAILED", "Failed to stat file", {
        detail: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}

export async function hashOrError(
  filePath: string,
): Promise<{ hash: string } | { error: FileError }> {
  try {
    return { hash: await hashFileStream(filePath) };
  } catch (err) {
    const fe =
      err instanceof FilePlatformError
        ? err.fileError
        : makeFileError("FILE_READ_FAILED", "Failed to hash file");
    return { error: fe };
  }
}

export function toManagedFileView(
  file: ManagedFile,
  extra?: {
    associationRole?: ManagedFileView["associationRole"];
    ordinal?: number;
    messageId?: string;
    taskId?: string;
  },
): ManagedFileView {
  const isRemote = file.locality === "remote";
  const hasManagedCopy = !!file.managedPath;
  return {
    id: file.id,
    name: file.name,
    extension: file.extension,
    mime: file.mime,
    category: file.category,
    source: file.source,
    status: file.status,
    size: file.size,
    contentHash: file.contentHash,
    parserId: file.parserId,
    parseVersion: file.parseVersion,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    errorCode: file.errorCode,
    errorMessage: file.errorMessage,
    displayPath: isRemote ? undefined : file.managedPath || file.originalPath,
    hasManagedCopy,
    associationRole: extra?.associationRole,
    ordinal: extra?.ordinal,
    locality: file.locality ?? "local",
    provider: file.provider,
    remoteArtifactId: file.remoteArtifactId,
    remoteTaskId: file.remoteTaskId,
    availability: file.availability,
    providerPreviewSupported: file.providerPreviewSupported,
    canPreview: file.canPreview,
    canOpen: !isRemote || hasManagedCopy,
    canReveal: !isRemote || hasManagedCopy,
    messageId: extra?.messageId,
    taskId: extra?.taskId ?? file.remoteTaskId,
  };
}

export function resolveOnDiskPath(file: ManagedFile): string | undefined {
  if (file.managedPath && existsSync(file.managedPath)) return file.managedPath;
  if (file.originalPath && existsSync(file.originalPath)) {
    return file.originalPath;
  }
  return file.managedPath || file.originalPath;
}
