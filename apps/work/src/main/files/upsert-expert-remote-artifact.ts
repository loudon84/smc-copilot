/**
 * Upsert Expert remote artifact metadata into the File Platform.
 * Does not download bytes — durable remote reference + session association only.
 */

import { randomUUID } from "crypto";
import { extname } from "path";
import type {
  ExpertArtifactDescriptor,
} from "../../shared/expert";
import { expertTranscriptBubbleIds } from "../../shared/expert";
import type { FileAssociation, ManagedFile } from "../../shared/files";
import { emitFileDomainEvent } from "./file-domain-events";
import {
  findAssociation,
  findByRemoteIdentity,
  insertAssociation,
  normalizeProfileId,
  upsertManagedFile,
} from "./file-association-store";
import { resolveFileCategory, resolveMime } from "./file-category";
import { nowIso } from "./file-metadata";
import { sanitizeGeneratedFileName } from "./agent-output/generated-file-name";

function extensionFromName(name: string): string {
  return extname(name).replace(/^\./, "").toLowerCase() || "bin";
}

function normalizePreviewSupported(meta: ExpertArtifactDescriptor): boolean {
  return meta.preview_supported === true;
}

/** Main-owned canPreview: Provider Preview or bounded client binary preview. */
export function computeRemoteCanPreview(input: {
  providerPreviewSupported: boolean;
  category: ManagedFile["category"];
}): boolean {
  if (input.providerPreviewSupported) {
    switch (input.category) {
      case "text":
      case "markdown":
      case "code":
      case "html":
        return true;
      default:
        break;
    }
  }
  switch (input.category) {
    case "pdf":
    case "image":
      return true;
    default:
      return false;
  }
}

function isValidArtifactMeta(
  meta: ExpertArtifactDescriptor,
): meta is ExpertArtifactDescriptor & { id: string; file_name: string } {
  return (
    typeof meta.id === "string" &&
    meta.id.trim().length > 0 &&
    typeof meta.file_name === "string" &&
    meta.file_name.trim().length > 0
  );
}

export interface UpsertExpertRemoteArtifactInput {
  meta: ExpertArtifactDescriptor;
  taskId: string;
  sessionId: string;
  profileId?: string;
  clientRequestId: string;
}

export interface UpsertExpertRemoteArtifactResult {
  fileId: string | null;
  skipped: boolean;
  reason?: string;
}

/**
 * Persist one Expert artifact as a remote ManagedFile and associate once
 * with the originating session as agent-output.
 */
export function upsertExpertRemoteArtifact(
  input: UpsertExpertRemoteArtifactInput,
): UpsertExpertRemoteArtifactResult {
  if (!isValidArtifactMeta(input.meta)) {
    return {
      fileId: null,
      skipped: true,
      reason: "invalid-metadata",
    };
  }

  const profileId = normalizeProfileId(input.profileId);
  const artifactId = input.meta.id.trim();
  const taskId = input.taskId.trim();
  const sessionId = input.sessionId.trim();
  if (!taskId || !sessionId) {
    return { fileId: null, skipped: true, reason: "missing-session-or-task" };
  }

  if (
    input.meta.task_id &&
    typeof input.meta.task_id === "string" &&
    input.meta.task_id !== taskId
  ) {
    return { fileId: null, skipped: true, reason: "task-mismatch" };
  }

  const safeName = sanitizeGeneratedFileName(input.meta.file_name.trim());
  const ext = extensionFromName(safeName) || extensionFromName(input.meta.file_name);
  const displayName =
    ext && !safeName.toLowerCase().endsWith(`.${ext}`)
      ? `${safeName}.${ext}`
      : safeName;
  const mime = resolveMime(
    displayName,
    typeof input.meta.content_type === "string"
      ? input.meta.content_type
      : undefined,
  );
  const category = resolveFileCategory(displayName, mime);
  const providerPreviewSupported = normalizePreviewSupported(input.meta);
  const canPreview = computeRemoteCanPreview({
    providerPreviewSupported,
    category,
  });
  const ts = nowIso();
  const size =
    typeof input.meta.size_bytes === "number" &&
    Number.isFinite(input.meta.size_bytes)
      ? Math.max(0, input.meta.size_bytes)
      : 0;
  const contentHash =
    typeof input.meta.sha256 === "string" && input.meta.sha256.trim()
      ? input.meta.sha256.trim().toLowerCase()
      : undefined;

  const existing = findByRemoteIdentity({
    profileId,
    provider: "expert",
    remoteArtifactId: artifactId,
  });

  const fileId = existing?.id ?? randomUUID();
  const managed: ManagedFile = {
    id: fileId,
    profileId,
    name: displayName,
    extension: ext,
    mime,
    category,
    source: "agent-output",
    status: "ready",
    size,
    contentHash,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    locality: "remote",
    provider: "expert",
    remoteArtifactId: artifactId,
    remoteTaskId: taskId,
    availability: "available",
    providerPreviewSupported,
    canPreview,
    // Preserve any previously materialized backing.
    managedPath: existing?.managedPath,
    originalPath: existing?.originalPath,
    parserId: existing?.parserId,
    parseVersion: existing?.parseVersion,
  };
  upsertManagedFile(managed);

  const messageId = expertTranscriptBubbleIds(input.clientRequestId).assistant;
  const existingAssoc = findAssociation({
    profileId,
    fileId,
    sessionId,
    role: "agent-output",
  });
  if (!existingAssoc) {
    const association: FileAssociation = {
      id: randomUUID(),
      fileId,
      profileId,
      sessionId,
      messageId,
      taskId,
      role: "agent-output",
      ordinal: 0,
      createdAt: ts,
    };
    insertAssociation(association);
    emitFileDomainEvent({
      type: "file:created",
      fileId,
      sessionId,
      role: "agent-output",
    });
    emitFileDomainEvent({
      type: "file:association-created",
      fileId,
      sessionId,
      role: "agent-output",
    });
  } else {
    emitFileDomainEvent({
      type: "file:updated",
      fileId,
    });
  }

  return { fileId, skipped: false };
}
