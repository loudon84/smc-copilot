export type WorkspaceEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  sizeBytes?: number | null;
  modifiedAt?: string | null;
};

export type WorkspaceFile = {
  path: string;
  name: string;
  content?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  truncated?: boolean;
};

/** PRD v1.6 FR-06 — Chat Workspace / Worktree port. */
export interface ChatWorkspacePort {
  getContextFolder(sessionId: string, profileId?: string): Promise<string | null>;
  setContextFolder(
    sessionId: string,
    path: string | null,
    profileId?: string,
  ): Promise<void>;
  listDirectory(
    sessionId: string,
    path?: string,
    profileId?: string,
  ): Promise<WorkspaceEntry[]>;
  readFile(
    sessionId: string,
    path: string,
    profileId?: string,
  ): Promise<WorkspaceFile>;
  getTerminalPath?(
    sessionId: string,
    profileId?: string,
  ): Promise<string | null>;
}
