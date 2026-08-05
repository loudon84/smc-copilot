/**
 * Contracts for turning an Assistant Message into a ManagedFile (agent-output).
 * Do not import Electron, React, or Node APIs from this module.
 */

import type { FileAssociation } from "./file-association";
import type { ManagedFile, ManagedFileView } from "./managed-file";

export interface CreateFileFromMessageInput {
  profile?: string;
  sessionId: string;
  messageId: string;
  title: string;
  content: string;
  extension: "md" | "txt";
}

export interface CreateFileFromMessageResult {
  file: ManagedFileView;
  association: FileAssociation;
  alreadyExisted: boolean;
}

/** Preview a report from message content without creating a physical file. */
export interface MessageDocumentPreviewInput {
  sessionId: string;
  messageId: string;
  title: string;
  content: string;
}

/** Re-export ManagedFile for callers that need the full domain type. */
export type { ManagedFile };
