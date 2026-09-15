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

/** Association isolation mode; mock rows must not be Chat/Skill consumable. */
export type FileAssociationDataMode = "mock" | "provider";

export interface FileAssociation {
  id: string;
  fileId: string;
  profileId: string;
  sessionId?: string;
  /** Knowledge Upload Job consumer; mutually exclusive with sessionId on import. */
  knowledgeJobId?: string;
  /**
   * Additive mode marker (ALTER like knowledge_job_id).
   * Knowledge mock imports write `mock`; Chat/Skill leave unset or non-mock.
   */
  dataMode?: FileAssociationDataMode;
  messageId?: string;
  taskId?: string;
  role: FileAssociationRole;
  ordinal: number;
  createdAt: string;
}

/** Chat/Skill consumers must ignore mock Knowledge associations. */
export function isChatConsumableAssociation(
  assoc: Pick<FileAssociation, "dataMode">,
): boolean {
  return assoc.dataMode !== "mock";
}
