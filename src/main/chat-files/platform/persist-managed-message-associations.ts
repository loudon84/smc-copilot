/**
 * Dual-write ManagedFile message associations after a successful send.
 * Keeps legacy desktop_message_attachments intact (images still go there).
 */

import { randomUUID } from "crypto";
import type { Attachment } from "../../../shared/attachments";
import { findUserMessageIdForPrompt } from "./session-attachment-store";
import {
  getManagedFile,
  insertAssociation,
  normalizeProfileId,
} from "./file-association-store";

/**
 * Link managed files (Attachment.id === ManagedFile.id) to the matching
 * user message as `message-attachment` associations.
 */
// @lat: [[file-platform#Send dual-write and session dual-read]]
export function persistManagedMessageAssociations(
  profile: string | undefined,
  sessionId: string | undefined,
  promptText: string,
  attachments?: Attachment[],
): void {
  if (!sessionId || !attachments || attachments.length === 0) return;

  const messageId = findUserMessageIdForPrompt(sessionId, promptText);
  if (messageId == null) return;

  const profileId = normalizeProfileId(profile);
  const ts = new Date().toISOString();

  attachments.forEach((attachment, ordinal) => {
    if (!attachment?.id) return;
    const file = getManagedFile(profileId, attachment.id);
    if (!file) return;
    try {
      insertAssociation({
        id: randomUUID(),
        fileId: attachment.id,
        profileId,
        sessionId,
        messageId: String(messageId),
        role: "message-attachment",
        ordinal,
        createdAt: ts,
      });
    } catch (err) {
      console.warn(
        "[files] Failed to attach managed file to message:",
        attachment.id,
        err,
      );
    }
  });
}
