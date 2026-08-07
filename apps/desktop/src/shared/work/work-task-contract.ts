import type { WorkContextRef } from "./work-context-contract";
import type { WorkOutputRef } from "./work-output-contract";

export type WorkTaskType =
  | "chat"
  | "expert"
  | "expert_team"
  | "web"
  | "skill"
  | "workflow";

export type WorkTaskStatus =
  | "draft"
  | "ready"
  | "planning"
  | "dispatching"
  | "running"
  | "waiting_approval"
  | "merging"
  | "output_ready"
  | "completed"
  | "failed"
  | "cancelled";

/** v7.4.1 — PRD aligned permission modes */
export type WorkTaskPermissionMode = "default" | "confirm_each" | "auto_low_risk";

export type WorkTaskMode = "ask" | "plan" | "craft" | "execute";

export type WorkTaskSource =
  | "work_home"
  | "expert"
  | "team"
  | "web_operator"
  | "session_resume";

export interface WorkTask {
  id: string;
  title: string;
  /** Hermes session binding — required for v7.4.1+ tasks */
  sessionId: string;
  profile: string;
  taskType: WorkTaskType;
  status: WorkTaskStatus;
  source: WorkTaskSource;
  sourceWorkspace: "work" | "web";
  workspaceId?: string;
  projectId?: string;
  activeExpertId?: string;
  activeTeamId?: string;
  selectedExpertIds: string[];
  selectedSkillIds: string[];
  selectedAppIds: string[];
  permissionMode: WorkTaskPermissionMode;
  mode?: WorkTaskMode;
  contextRefs: WorkContextRef[];
  outputRefs: WorkOutputRef[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkTaskDetail extends WorkTask {
  prompt?: string;
}

export interface WorkTaskSessionBinding {
  taskId: string;
  sessionId: string;
  profile: string;
  firstMessageId?: string;
  lastMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkTasksJson {
  version: 1;
  tasks: WorkTask[];
  bindings: WorkTaskSessionBinding[];
}

export interface WorkTaskStartInput {
  prompt: string;
  profile?: string;
  resumeSessionId?: string;
  selectedTeamId?: string;
  selectedExpertIds?: string[];
  selectedSkillIds?: string[];
  selectedAppIds?: string[];
  permissionMode?: WorkTaskPermissionMode;
  mode?: WorkTaskMode;
  attachmentIds?: string[];
  contextRefs?: WorkContextRef[];
}

export interface WorkTaskStartResult {
  ok: boolean;
  taskId: string;
  sessionId: string;
  profile: string;
  error?: string;
}

export interface WorkTaskResumeResult {
  ok: boolean;
  task: WorkTask | null;
  error?: string;
}

/** @deprecated v7.4 legacy — use WorkTaskStartInput */
export interface WorkTaskSendInput {
  taskId?: string;
  text: string;
  selectedTeamId?: string;
  selectedExpertIds?: string[];
  selectedSkillIds?: string[];
  selectedAppIds?: string[];
  permissionMode?: WorkTaskPermissionMode;
  mode?: WorkTaskMode;
  contextRefs?: WorkContextRef[];
  attachmentIds?: string[];
}

export interface WorkTaskSendResult {
  taskId: string;
  streamId?: string;
  ok: boolean;
  error?: string;
}

export interface WorkTaskListQuery {
  status?: WorkTaskStatus[];
  limit?: number;
  offset?: number;
}
