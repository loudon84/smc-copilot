/**
 * Desktop Work Tasks IPC contract (PRD v1.3 Phase 8).
 * Renderer talks only via window.workTasks — never Node / direct /api/v1.
 */

export const WORK_TASKS_V2_FEATURE = "tasks.work.v2" as const;

export const WORK_TASKS_CHANNELS = {
  list: "work-tasks:list",
  get: "work-tasks:get",
  create: "work-tasks:create",
  start: "work-tasks:start",
  cancel: "work-tasks:cancel",
  retry: "work-tasks:retry",
  assign: "work-tasks:assign",
  getSnapshot: "work-tasks:get-snapshot",
  subscribeEvents: "work-tasks:subscribe-events",
  unsubscribeEvents: "work-tasks:unsubscribe-events",
  hasWorkV2: "work-tasks:has-work-v2",
  event: "work-tasks:event",
} as const;

export type WorkTaskType =
  | "chat"
  | "expert"
  | "expert_team"
  | "web"
  | "workflow"
  | "coding"
  | "business"
  | "remote_assignment";

export interface WorkTaskDto {
  id: string;
  title: string;
  description?: string | null;
  taskType: string;
  source: string;
  status: string;
  priority: number;
  profileId?: string | null;
  assignedProfileId?: string | null;
  assignedInstanceId?: string | null;
  instanceId?: string | null;
  activeRunId?: string | null;
  chatRunId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultSummary?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
}

export interface WorkTaskListResult {
  items: WorkTaskDto[];
  nextCursor?: string | null;
}

export interface WorkTaskListParams {
  limit?: number;
  cursor?: string | null;
  status?: string | null;
  taskType?: string | null;
  source?: string | null;
  profileId?: string | null;
  search?: string | null;
}

export interface WorkTaskCreateInput {
  title: string;
  taskType?: WorkTaskType;
  description?: string | null;
  instructions?: string | null;
  profileId?: string | null;
  instanceId?: string | null;
  priority?: number;
  source?: string;
}

export interface WorkTaskAssignInput {
  profileId: string;
  instanceId?: string | null;
}

export interface WorkTaskStartResultDto {
  taskId: string;
  runId?: string | null;
  status: string;
}

export interface WorkTaskRunDto {
  id: string;
  taskId: string;
  runNumber: number;
  status: string;
  chatRunId?: string | null;
  hermesSessionId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
}

export interface WorkTaskEventDto {
  id: string;
  taskId: string;
  runId: string;
  sequence: number;
  eventType: string;
  payload?: Record<string, unknown> | null;
  createdAt?: string | null;
  schemaVersion?: string;
}

export interface WorkTaskSnapshotDto {
  task: WorkTaskDto;
  activeRun: WorkTaskRunDto | null;
  runs: WorkTaskRunDto[];
  events: WorkTaskEventDto[];
}

export interface WorkTaskEventPush {
  taskId: string;
  subscriptionId: string;
  event: WorkTaskEventDto | null;
  raw: {
    id: string | null;
    event: string | null;
    data: string;
  };
}

export interface WorkTaskSubscribeInput {
  taskId: string;
  lastEventId?: string | null;
}

export interface WorkTaskSubscribeResult {
  ok: true;
  subscriptionId: string;
}
