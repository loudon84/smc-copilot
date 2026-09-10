/**
 * Upsert Skill Run remote artifact metadata into the File Platform.
 * Does not download bytes — durable remote reference + session association only.
 */

import { randomUUID } from "crypto";
import { extname } from "path";
import type { SkillRunArtifactDescriptor } from "../../shared/skill-run";
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
import { skillRunTranscriptBubbleIds } from "../skill-run/skill-run-session-materialize";

function extensionFromName(name: string): string {
  return extname(name).replace(/^\./, "").toLowerCase() || "bin";
}

function normalizePreviewSupported(meta: SkillRunArtifactDescriptor): boolean {
  return meta.preview_supported === true;
}

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
  meta: SkillRunArtifactDescriptor,
): meta is SkillRunArtifactDescriptor & { id: string; file_name: string } {
  return (
    meta != null &&
    typeof meta === "object" &&
    typeof meta.id === "string" &&
    meta.id.trim() !== "" &&
    typeof meta.file_name === "string" &&
    meta.file_name.trim() !== ""
  );
}

export interface UpsertSkillRunRemoteArtifactInput {
  meta: SkillRunArtifactDescriptor;
  runId: string;
  sessionId: string;
  profileId?: string;
  clientRequestId?: string;
}

export function upsertSkillRunRemoteArtifact(
  input: UpsertSkillRunRemoteArtifactInput,
): { file: ManagedFile; association: FileAssociation } | null {
  if (!isValidArtifactMeta(input.meta)) {
    return null;
  }
  const runId = input.runId.trim();
  if (!runId) {
    return null;
  }

  const profileId = normalizeProfileId(input.profileId);
  const remoteArtifactId = input.meta.id.trim();
  const rawName = input.meta.file_name.trim();
  const name = sanitizeGeneratedFileName(rawName);
  const extension = extensionFromName(name);
  const mime = input.meta.mime_type?.trim() || resolveMime(extension);
  const category = resolveFileCategory(extension, mime);
  const size = Math.max(0, Number(input.meta.size_bytes) || 0);
  const providerPreviewSupported = normalizePreviewSupported(input.meta);
  const canPreview = computeRemoteCanPreview({
    providerPreviewSupported,
    category,
  });
  const contentHash =
    typeof input.meta.sha256 === "string" && input.meta.sha256.trim()
      ? input.meta.sha256.trim().toLowerCase()
      : undefined;
  const assistantMessageId = input.clientRequestId?.trim()
    ? skillRunTranscriptBubbleIds(input.clientRequestId.trim()).assistant
    : undefined;

  const existing = findByRemoteIdentity({
    profileId,
    provider: "skill-run",
    remoteRunId: runId,
    remoteArtifactId,
  });

  const now = nowIso();
  const fileId = existing ? existing.id : randomUUID();

  const file: ManagedFile = {
    id: fileId,
    profileId,
    name,
    extension,
    mime,
    category,
    source: "agent-output",
    status: "ready",
    size: size > 0 ? size : existing?.size ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    locality: "remote",
    provider: "skill-run",
    remoteArtifactId,
    remoteRunId: runId,
    availability: "available",
    providerPreviewSupported,
    canPreview,
    contentHash: contentHash ?? existing?.contentHash,
  };

  upsertManagedFile(file);

  const existingAssoc = input.sessionId
    ? findAssociation({
        profileId,
        fileId,
        sessionId: input.sessionId,
        role: "agent-output",
      })
    : null;

  const association: FileAssociation = existingAssoc ?? {
    id: randomUUID(),
    fileId,
    profileId,
    sessionId: input.sessionId || undefined,
    messageId: assistantMessageId,
    role: "agent-output",
    ordinal: 0,
    createdAt: now,
  };

  if (!existingAssoc) {
    insertAssociation(association);
  }

  emitFileDomainEvent({
    type: "file:created",
    fileId: file.id,
    sessionId: input.sessionId || undefined,
    role: "agent-output",
  });

  return { file, association };
}
