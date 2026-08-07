export type ExpertGatewayStatus =
  | "unknown"
  | "checking"
  | "remote"
  | "unavailable"
  | "error";

export type WorkPermissionMode = "default" | "ask_each_time";

export interface WorkChatSelectedExpert {
  expertId: string;
  slug: string;
  name: string;
  description?: string;
  category?: string;
  riskLevel?: "low" | "medium" | "high";
  runtimeProfile?: string;
  runtimeInstanceId?: string;
}

export interface WorkChatSelectedSkill {
  name: string;
  displayName: string;
  description?: string;
  riskLevel?: "low" | "medium" | "high";
  outputFormat?: "markdown" | "json" | "text" | "file";
}

export interface WorkChatContext {
  gatewayStatus: ExpertGatewayStatus;
  selectedExpert: WorkChatSelectedExpert | null;
  selectedSkill: WorkChatSelectedSkill | null;
  permissionMode: WorkPermissionMode;
  /** v7.6: expert/skill selection only affects prompt hint; always false in business path. */
  useExpertGateway: false;
}

/** @deprecated v7.6 — Chat no longer calls Expert Gateway directly. */
export interface WorkExpertGatewayCallInput {
  expertSlug: string;
  skillName: string;
  prompt: string;
  permissionMode: WorkPermissionMode;
  attachmentIds?: string[];
  sessionId?: string | null;
  modelId?: string | null;
}

export type { WorkExpertGatewayCallResult } from "./expert-task-stream";

export type WorkChatContextActions = {
  setExpert: (expert: WorkChatSelectedExpert | null) => void;
  setSkill: (skill: WorkChatSelectedSkill | null) => void;
  setPermissionMode: (mode: WorkPermissionMode) => void;
  clearContext: () => void;
  refreshGatewayHealth: () => Promise<void>;
};

export type UseWorkChatContextReturn = WorkChatContext & WorkChatContextActions;
