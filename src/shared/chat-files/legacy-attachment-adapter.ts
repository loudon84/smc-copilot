/**
 * Pure (Node-free) mapping from ManagedFile + resolved payload to legacy Attachment.
 * Main Process may resolve disk bytes then call this; Renderer must never read paths.
 */

import type { Attachment } from "../attachments";
import type { ManagedFile } from "./managed-file";

export interface ManagedFileAttachmentPayload {
  managedFile: ManagedFile;
  legacyAttachment: Attachment;
}

export function managedFileToAttachment(
  file: ManagedFile,
  resolved: {
    dataUrl?: string;
    text?: string;
    path?: string;
  },
): Attachment {
  if (file.category === "image" && resolved.dataUrl) {
    return {
      id: file.id,
      kind: "image",
      name: file.name,
      mime: file.mime,
      size: file.size,
      dataUrl: resolved.dataUrl,
      path: resolved.path,
    };
  }

  if (
    (file.category === "text" ||
      file.category === "markdown" ||
      file.category === "code") &&
    resolved.text != null
  ) {
    return {
      id: file.id,
      kind: "text-file",
      name: file.name,
      mime: file.mime,
      size: file.size,
      text: resolved.text,
      path: resolved.path,
    };
  }

  if (resolved.text != null && !resolved.path) {
    return {
      id: file.id,
      kind: "text-file",
      name: file.name,
      mime: file.mime.startsWith("text/") ? file.mime : "text/plain",
      size: file.size,
      text: resolved.text,
    };
  }

  if (!resolved.path) {
    throw new Error("A path-ref attachment requires a resolved path");
  }

  return {
    id: file.id,
    kind: "path-ref",
    name: file.name,
    mime: file.mime,
    size: file.size,
    path: resolved.path,
  };
}
