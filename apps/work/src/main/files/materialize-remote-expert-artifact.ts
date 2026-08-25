/**
 * On-demand internal materialization of a remote Expert artifact.
 * Writes managedPath under the same File Platform resource identity.
 */

import { existsSync, rmSync } from "fs";
import type { ManagedFile } from "../../shared/files";
import {
  getManagedFile,
  normalizeProfileId,
  upsertManagedFile,
} from "./file-association-store";
import { streamExpertArtifactBytes } from "./expert-artifact-transfer";
import { nowIso } from "./file-metadata";
import { storeManagedCopy } from "./file-store";
import { FilePlatformError } from "./file-security";

export async function materializeRemoteExpertArtifact(
  profile: string | undefined,
  fileId: string,
): Promise<ManagedFile> {
  const profileId = normalizeProfileId(profile);
  const file = getManagedFile(profileId, fileId);
  if (!file) {
    throw FilePlatformError.fromCode("FILE_NOT_FOUND", "Managed file not found");
  }
  if (file.locality !== "remote") {
    return file;
  }
  if (file.managedPath && existsSync(file.managedPath)) {
    return file;
  }
  if (!file.remoteArtifactId) {
    throw FilePlatformError.fromCode(
      "FILE_NOT_FOUND",
      "Remote artifact identity missing",
    );
  }
  if (file.availability === "forbidden") {
    throw FilePlatformError.fromCode(
      "FILE_REMOTE_FORBIDDEN",
      "Artifact is forbidden",
    );
  }
  if (file.availability === "not-found") {
    throw FilePlatformError.fromCode(
      "FILE_REMOTE_NOT_FOUND",
      "Artifact was not found",
    );
  }

  const profileArg = profileId === "default" ? undefined : profileId;
  const transferred = await streamExpertArtifactBytes({
    artifactId: file.remoteArtifactId,
    expectedSha256: file.contentHash,
    profile: profileArg,
  });

  try {
    const managedPath = await storeManagedCopy(
      transferred.path,
      transferred.hash,
      profileArg,
    );
    const updated: ManagedFile = {
      ...file,
      managedPath,
      contentHash: transferred.hash,
      size: transferred.size || file.size,
      availability: "available",
      updatedAt: nowIso(),
    };
    upsertManagedFile(updated);
    return updated;
  } finally {
    if (existsSync(transferred.path)) {
      try {
        rmSync(transferred.path, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
