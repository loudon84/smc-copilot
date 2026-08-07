import type { WorkArtifact } from "./artifact";
import type { WorkError } from "./error";

export type WorkRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type WorkRunMode = "single_expert" | "expert_team";

export interface WorkRun {
  id: string;
  title: string;
  mode: WorkRunMode;
  expertSlug?: string;
  teamSlug?: string;
  skillName?: string;
  status: WorkRunStatus;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  resultPreview?: string;
  artifactCount: number;
  error?: WorkError;
}

export interface WorkRunTimelineEvent {
  id: string;
  runId: string;
  eventType: string;
  sourceProfileId?: string;
  targetProfileId?: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface WorkRunMemberSummary {
  memberProfileId: string;
  roleName: string;
  status: string;
  summary?: string;
}

export interface WorkRunDetail extends WorkRun {
  responseText?: string;
  catalogSlug?: string;
  catalogKind?: "expert" | "expert_team";
  invocationId?: string;
  remoteTaskId?: string;
  memberRuns: WorkRunMemberSummary[];
  artifacts: WorkArtifact[];
  timeline: WorkRunTimelineEvent[];
}
