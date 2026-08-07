export type ProfileRuntimeStatus =
  | "running"
  | "stopped"
  | "starting"
  | "error"
  | "not_deployed"
  | "stopping"
  | "failed";

export type ChatRunState =
  | "idle"
  | "creating"
  | "streaming"
  | "waiting_approval"
  | "completed"
  | "error"
  | "cancelled";

export type RightInspectorTab = "workspace" | "skills" | "memory" | "runtime";

export type AIOSProfile = {
  id: string;
  name: string;
  roleName: string;
  displayName: string;
  description?: string;
  gatewayPort: number;
  status: ProfileRuntimeStatus;
  healthy: boolean;
  model?: string;
  workspacePath?: string;
  soulPath?: string;
  memoryPath?: string;
  pid?: number | null;
  /** team_v1.5.1：是否已在 DB 安装（有 profile_home） */
  installed?: boolean;
};

export type AIOSSession = {
  id: string;
  profileId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  pinned?: boolean;
  archived?: boolean;
  model?: string;
};

export type AIOSSkillToolCall = {
  id: string;
  name: string;
  args?: unknown;
  resultPreview?: string;
  status: "running" | "completed" | "error" | "waiting_approval";
};

export type AIOSMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
  toolCalls?: AIOSSkillToolCall[];
};

export type AIOSSkill = {
  id: string;
  profileId: string;
  name: string;
  category: string;
  sourceType: "role-source" | "agent-created" | "builtin";
  path: string;
  enabled: boolean;
  description?: string;
};

export type AIOSMemoryFileName = "SOUL.md" | "MEMORY.md" | "USER.md";

export type AIOSMemoryFile = {
  profileId: string;
  file: AIOSMemoryFileName;
  content: string;
  readonly: boolean;
  updatedAt?: string;
};

export type WorkspaceFileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
};

export type WorkspaceGitStatus = {
  branch: string | null;
  dirtyCount: number;
};

export type WorkspacesState = {
  activeProfileId: string | null;
  activeSessionId: string | null;
  activeRightTab: RightInspectorTab;
  rightPanelCollapsed: boolean;
};
