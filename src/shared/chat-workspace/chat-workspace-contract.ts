/**
 * v8.2 Chat Workspace — Main-owned persistence contract.
 * Desktop DB: ~/.hermes/desktop/chat-workspace.db
 */

export type ChatWorkspaceRunKind = "draft" | "session";

export type ChatWorkspaceMode = "default" | "expert" | "team";

export type ChatWorkspaceWorkMode = "ask" | "plan" | "craft";

export type ChatWorkspacePermissionMode = "default" | "ask_each_time";

export type ChatWorkspaceTitleSource =
  | "placeholder"
  | "first_prompt"
  | "session"
  | "generated"
  | "user";

export type ChatWorkspaceRunState =
  | "idle"
  | "creating"
  | "streaming"
  | "waiting_approval"
  | "waiting_clarify"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type ChatWorkspaceRunRow = {
  runId: string;
  workspaceId: string;
  profileId: string;
  sessionId: string | null;
  position: number;

  title: string;
  titleSource: ChatWorkspaceTitleSource;

  mode: ChatWorkspaceMode;
  expertId?: string | null;
  expertName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  skillName?: string | null;
  skillDisplayName?: string | null;

  workMode: ChatWorkspaceWorkMode;
  permissionMode: ChatWorkspacePermissionMode;
  modelId?: string | null;

  runState: ChatWorkspaceRunState;
  draft?: string | null;

  filesVisible: boolean;
  previewFileId?: string | null;
  previewMaximized: boolean;

  createdAt: number;
  updatedAt: number;
  closedAt?: number | null;
};

export type ChatWorkspaceSnapshot = {
  workspaceId: string;
  activeRunId: string | null;
  runs: ChatWorkspaceRunRow[];
  updatedAt: number;
};

export type ChatWorkspaceOpenInput = {
  workspaceId?: string;
  runId: string;
  profileId?: string;
  sessionId?: string | null;
  title?: string;
  titleSource?: ChatWorkspaceTitleSource;
  mode?: ChatWorkspaceMode;
  expertId?: string;
  expertName?: string;
  teamId?: string;
  teamName?: string;
  skillName?: string;
  skillDisplayName?: string;
  workMode?: ChatWorkspaceWorkMode;
  permissionMode?: ChatWorkspacePermissionMode;
  modelId?: string;
  activate?: boolean;
};

export type ChatWorkspaceOpenSessionInput = {
  workspaceId?: string;
  profileId: string;
  sessionId: string;
  title?: string;
  /** When true, open a new tab even if a linked run already exists. */
  forceNewTab?: boolean;
};

export type ChatWorkspaceOpenSessionResult = {
  runId: string;
  created: boolean;
  workspaceId: string;
};

export type ChatWorkspacePatchRunInput = {
  workspaceId?: string;
  runId: string;
  patch: Partial<{
    profileId: string;
    sessionId: string | null;
    title: string;
    titleSource: ChatWorkspaceTitleSource;
    mode: ChatWorkspaceMode;
    expertId: string | null;
    expertName: string | null;
    teamId: string | null;
    teamName: string | null;
    skillName: string | null;
    skillDisplayName: string | null;
    workMode: ChatWorkspaceWorkMode;
    permissionMode: ChatWorkspacePermissionMode;
    modelId: string | null;
    runState: ChatWorkspaceRunState;
    draft: string | null;
    filesVisible: boolean;
    previewFileId: string | null;
    previewMaximized: boolean;
    position: number;
  }>;
};

export type ChatWorkspaceCloseRunInput = {
  workspaceId?: string;
  runId: string;
};

export type ChatWorkspaceSetActiveInput = {
  workspaceId?: string;
  runId: string | null;
};

export type ChatWorkspaceReorderInput = {
  workspaceId?: string;
  runIds: string[];
};

export type ChatWorkspaceMigrateV1Input = {
  workspaceId?: string;
  activeRunId: string | null;
  runs: Array<{
    runId: string;
    sessionId: string | null;
    profileId: string;
    createdAt: number;
    updatedAt: number;
    createdOrder: number;
    mode: ChatWorkspaceMode;
    expertId?: string;
    expertName?: string;
    teamId?: string;
    teamName?: string;
    skillName?: string;
    skillDisplayName?: string;
    permissionMode: ChatWorkspacePermissionMode;
    workMode: ChatWorkspaceWorkMode;
    runState: ChatWorkspaceRunState;
    title: string;
    titleSource: ChatWorkspaceTitleSource;
    selectedModelId?: string;
    sessionFilesVisible: boolean;
    previewFileId?: string;
    previewMaximized: boolean;
    draft?: string;
  }>;
};

export const DEFAULT_CHAT_WORKSPACE_ID = "hermes-default";

// @lat: [[domain/chat#Workspace persistence]]
export const CHAT_WORKSPACE_CHANNELS = {
  list: "chat-workspace:list",
  open: "chat-workspace:open",
  openSession: "chat-workspace:open-session",
  patchRun: "chat-workspace:patch-run",
  closeRun: "chat-workspace:close-run",
  setActive: "chat-workspace:set-active",
  reorder: "chat-workspace:reorder",
  getSnapshot: "chat-workspace:get-snapshot",
  migrateV1: "chat-workspace:migrate-v1",
  changed: "chat-workspace:changed",
} as const;

export type ChatWorkspaceChannel =
  (typeof CHAT_WORKSPACE_CHANNELS)[keyof typeof CHAT_WORKSPACE_CHANNELS];

// @lat: [[domain/chat#Draft versus session runs]]
export function runKindFromSessionId(
  sessionId: string | null | undefined,
): ChatWorkspaceRunKind {
  return sessionId ? "session" : "draft";
}
