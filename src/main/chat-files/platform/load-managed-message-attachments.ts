/**
 * Restore message attachments from ManagedFile associations (dual-read).
 * Prefer these over legacy desktop_message_attachments when present.
 */

import type { Attachment } from "../../../shared/attachments";
import { getConnectionConfig } from "../../config";
import { getActiveProfileNameSync } from "../../utils";
import { toHermesAttachment } from "./attachment-adapter";
import {
  getParsedDocument,
  listBySession,
  normalizeProfileId,
} from "./file-association-store";

/**
 * Load ManagedFile-backed attachments keyed by numeric message id.
 * Roles: message-attachment and prompt-attachment with a messageId.
 */
// @lat: [[file-platform#Send dual-write and session dual-read]]
export function loadManagedMessageAttachments(
  sessionId: string,
  profile?: string,
): Map<number, Attachment[]> {
  const byMessageId = new Map<number, Attachment[]>();
  const profileId = normalizeProfileId(
    profile?.trim() || getActiveProfileNameSync(),
  );
  const mode =
    getConnectionConfig().mode === "remote" ? "remote" : "local";

  let rows: ReturnType<typeof listBySession>;
  try {
    rows = listBySession(profileId, sessionId);
  } catch {
    return byMessageId;
  }

  for (const row of rows) {
    const role = row.association.role;
    if (role !== "message-attachment" && role !== "prompt-attachment") {
      continue;
    }
    const messageIdRaw = row.association.messageId;
    if (messageIdRaw == null || messageIdRaw === "") continue;
    const messageId = Number(messageIdRaw);
    if (!Number.isFinite(messageId)) continue;

    try {
      const parsed = getParsedDocument(row.id) ?? undefined;
      const attachment = toHermesAttachment(row, { parsed, mode });
      const bucket = byMessageId.get(messageId) || [];
      bucket.push(attachment);
      byMessageId.set(messageId, bucket);
    } catch {
      // Keep a clickable card keyed by ManagedFile id so Preview still works
      // even when bytes/path cannot be resolved for the transcript payload.
      // Prefer non-image kinds so we don't render a broken thumbnail.
      const stub: Attachment = {
        id: row.id,
        kind:
          row.category === "text" ||
          row.category === "markdown" ||
          row.category === "code"
            ? "text-file"
            : "path-ref",
        name: row.name,
        mime: row.mime,
        size: row.size,
      };
      const bucket = byMessageId.get(messageId) || [];
      bucket.push(stub);
      byMessageId.set(messageId, bucket);
    }
  }

  return byMessageId;
}
