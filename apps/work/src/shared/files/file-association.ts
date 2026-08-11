/**
 * FileAssociation links a ManagedFile to a session, message, or task.
 * Do not import Electron, React, or Node APIs from this module.
 */

export type FileAssociationRole =
  | "prompt-attachment"
  | "message-attachment"
  | "agent-output"
  | "context-file"
  | "reference";

export interface FileAssociation {
  id: string;
  fileId: string;
  profileId: string;
  sessionId?: string;
  messageId?: string;
  taskId?: string;
  role: FileAssociationRole;
  ordinal: number;
  createdAt: string;
}
