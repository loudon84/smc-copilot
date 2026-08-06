/**
 * Create ManagedFile + agent-output association from Assistant Message content.
 */

import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  CreateFileFromMessageInput,
  CreateFileFromMessageResult,
  FileAssociation,
  ManagedFile,
} from "../../../../shared/files";
import {
  findByHash,
  insertAssociation,
  listByMessage,
  normalizeProfileId,
  upsertManagedFile,
  getManagedFile,
} from "../file-association-store";
import { ensureFilesLayout } from "../file-store";
import { resolveFileCategory, resolveMime } from "../file-category";
import { nowIso, toManagedFileView } from "../file-metadata";
import { agentOutputError } from "./agent-output-errors";
import { emitFileDomainEvent } from "../file-domain-events";
import { BrowserWindow } from "electron";
import { emitChatFilesChanged } from "../../chat-files-event-emitter";
import {
  createGeneratedFileName,
  resolveUniqueFileName,
  sanitizeSessionDirSegment,
} from "./generated-file-name";

function profileOrDefault(profile?: string): string {
  return normalizeProfileId(profile);
}

function hashUtf8Content(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Persist message body under profileHome/desktop/files/generated/<sessionId>/.
 * Idempotent when the same message already has an agent-output association.
 */
// @lat: [[file-platform#AgentOutputService]]
export async function createFromMessage(
  input: CreateFileFromMessageInput,
): Promise<CreateFileFromMessageResult> {
  const sessionId = (input.sessionId || "").trim();
  const messageId = (input.messageId || "").trim();
  const content = input.content ?? "";
  const extension = input.extension === "txt" ? "txt" : "md";

  if (!sessionId || !messageId) {
    throw agentOutputError(
      "INVALID_MESSAGE_CONTENT",
      "Session ID and Message ID are required",
    );
  }
  if (!content.trim()) {
    throw agentOutputError(
      "INVALID_MESSAGE_CONTENT",
      "Message content is empty",
    );
  }

  const profileId = profileOrDefault(input.profile);
  const profileArg = profileId === "default" ? undefined : profileId;

  // Idempotency: same message + agent-output already linked.
  const existingRows = listByMessage(profileId, messageId).filter(
    (row) =>
      row.association.role === "agent-output" &&
      row.association.sessionId === sessionId,
  );
  if (existingRows.length > 0) {
    const row = existingRows[0];
    return {
      file: toManagedFileView(row, {
        associationRole: "agent-output",
        ordinal: row.association.ordinal,
      }),
      association: row.association,
      alreadyExisted: true,
    };
  }

  const layout = ensureFilesLayout(profileArg);
  const sessionSeg = sanitizeSessionDirSegment(sessionId);
  const generatedRoot = join(layout.root, "generated");
  const sessionDir = join(generatedRoot, sessionSeg);

  try {
    if (!existsSync(generatedRoot)) {
      mkdirSync(generatedRoot, { recursive: true });
    }
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
  } catch (err) {
    throw agentOutputError(
      "GENERATED_DIRECTORY_FAILED",
      "Unable to create report directory",
      {
        retryable: true,
        detail: err instanceof Error ? err.message : String(err),
      },
    );
  }

  const title = (input.title || "").trim() || "generated-report";
  const baseName = createGeneratedFileName(title, extension);
  const uniqueName = resolveUniqueFileName(sessionDir, baseName);
  const targetPath = join(sessionDir, uniqueName);

  // Containment check: final path must stay under generated/<session>/.
  if (!targetPath.startsWith(sessionDir)) {
    throw agentOutputError(
      "FILE_PATH_DENIED",
      "Generated path escaped the session directory",
    );
  }

  try {
    writeFileSync(targetPath, content, { encoding: "utf8" });
  } catch (err) {
    throw agentOutputError(
      "GENERATED_FILE_WRITE_FAILED",
      "Report file creation failed, please retry",
      {
        retryable: true,
        detail: err instanceof Error ? err.message : String(err),
      },
    );
  }

  const contentHash = hashUtf8Content(content);
  const size = Buffer.byteLength(content, "utf8");
  const mime = resolveMime(uniqueName);
  const category = resolveFileCategory(uniqueName, mime);
  const ts = nowIso();

  // Content-hash dedup: reuse existing ManagedFile when identical bytes exist.
  const byHash = findByHash(profileId, contentHash);
  let fileId: string;
  let managed: ManagedFile;

  if (byHash) {
    fileId = byHash.id;
    managed = {
      ...byHash,
      source: "agent-output",
      status: "ready",
      managedPath: byHash.managedPath || targetPath,
      originalPath: byHash.originalPath || targetPath,
      updatedAt: ts,
    };
    try {
      upsertManagedFile(managed);
    } catch (err) {
      throw agentOutputError(
        "MANAGED_FILE_SAVE_FAILED",
        "Failed to update managed file record",
        {
          retryable: true,
          detail: err instanceof Error ? err.message : String(err),
        },
      );
    }
  } else {
    fileId = randomUUID();
    managed = {
      id: fileId,
      profileId,
      name: uniqueName,
      extension: extensionFromName(uniqueName),
      mime,
      category,
      source: "agent-output",
      status: "ready",
      size,
      originalPath: targetPath,
      managedPath: targetPath,
      contentHash,
      createdAt: ts,
      updatedAt: ts,
    };
    try {
      upsertManagedFile(managed);
    } catch (err) {
      throw agentOutputError(
        "MANAGED_FILE_SAVE_FAILED",
        "Failed to save managed file record",
        {
          retryable: true,
          detail: err instanceof Error ? err.message : String(err),
        },
      );
    }
  }

  const association: FileAssociation = {
    id: randomUUID(),
    fileId,
    profileId,
    sessionId,
    messageId,
    role: "agent-output",
    ordinal: 0,
    createdAt: ts,
  };

  try {
    insertAssociation(association);
  } catch (err) {
    throw agentOutputError(
      "FILE_ASSOCIATION_SAVE_FAILED",
      "Failed to link file to session",
      {
        retryable: true,
        detail: err instanceof Error ? err.message : String(err),
      },
    );
  }

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

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    emitChatFilesChanged(win.webContents, {
      profileId: profileId || "default",
      sessionId,
      reason: "agent_output_created",
      fileId,
    });
  }

  const stored = getManagedFile(profileId, fileId) ?? managed;
  return {
    file: toManagedFileView(stored, {
      associationRole: "agent-output",
      ordinal: 0,
    }),
    association,
    alreadyExisted: false,
  };
}

function extensionFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}
