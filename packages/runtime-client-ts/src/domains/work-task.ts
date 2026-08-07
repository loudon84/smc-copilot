import type { components, operations } from "../generated/schema";
import type { RuntimeSseMessage, RuntimeTransport } from "../transport/types";

function enc(id: string): string {
  return encodeURIComponent(id);
}

export type WorkTaskCreate = components["schemas"]["WorkTaskCreate"];
export type WorkTaskPatch = components["schemas"]["WorkTaskPatch"];
export type WorkTaskResponse = components["schemas"]["WorkTaskResponse"];
export type WorkTaskListResponse = components["schemas"]["WorkTaskListResponse"];
export type WorkTaskAssignBody = components["schemas"]["WorkTaskAssignBody"];
export type TaskRunResponse = components["schemas"]["TaskRunResponse"];
export type TaskStartResult = components["schemas"]["TaskStartResult"];
export type TaskEventResponse = components["schemas"]["schemas__work_tasks__TaskEventResponse"];
export type TaskSnapshotResponse = components["schemas"]["TaskSnapshotResponse"];
export type TaskApprovalResponse = components["schemas"]["TaskApprovalResponse"];
export type TaskArtifactResponse = components["schemas"]["TaskArtifactResponse"];
export type TaskArtifactOpenResult = components["schemas"]["TaskArtifactOpenResult"];
export type TaskInteractionResponse = components["schemas"]["TaskInteractionResponse"];

export type WorkTaskListQuery =
  NonNullable<operations["list_work_tasks_api_v1_work_tasks_get"]["parameters"]["query"]>;

export type WorkTaskEventsQuery =
  NonNullable<
    operations["list_task_events_api_v1_work_tasks__task_id__events_get"]["parameters"]["query"]
  >;

/** Server-authoritative WorkTask snapshot (task + runs + events + approvals + artifacts). */
export type WorkTaskSnapshot = TaskSnapshotResponse;

export interface WorkTaskDomain {
  list(query?: WorkTaskListQuery, signal?: AbortSignal): Promise<WorkTaskListResponse>;
  create(body: WorkTaskCreate, signal?: AbortSignal): Promise<WorkTaskResponse>;
  get(taskId: string, signal?: AbortSignal): Promise<WorkTaskResponse>;
  patch(taskId: string, body: WorkTaskPatch, signal?: AbortSignal): Promise<WorkTaskResponse>;
  delete(taskId: string, signal?: AbortSignal): Promise<void>;
  assign(taskId: string, body: WorkTaskAssignBody, signal?: AbortSignal): Promise<WorkTaskResponse>;
  start(taskId: string, signal?: AbortSignal): Promise<TaskStartResult>;
  cancel(taskId: string, signal?: AbortSignal): Promise<WorkTaskResponse>;
  retry(taskId: string, signal?: AbortSignal): Promise<TaskStartResult>;
  listRuns(taskId: string, signal?: AbortSignal): Promise<TaskRunResponse[]>;
  listEvents(
    taskId: string,
    query?: WorkTaskEventsQuery,
    signal?: AbortSignal,
  ): Promise<TaskEventResponse[]>;
  listApprovals(taskId: string, signal?: AbortSignal): Promise<TaskApprovalResponse[]>;
  approve(taskId: string, approvalId: string, signal?: AbortSignal): Promise<TaskApprovalResponse>;
  reject(taskId: string, approvalId: string, signal?: AbortSignal): Promise<TaskApprovalResponse>;
  listArtifacts(taskId: string, signal?: AbortSignal): Promise<TaskArtifactResponse[]>;
  getArtifact(taskId: string, artifactId: string, signal?: AbortSignal): Promise<TaskArtifactResponse>;
  openArtifact(taskId: string, artifactId: string, signal?: AbortSignal): Promise<TaskArtifactOpenResult>;
  streamEvents(
    taskId: string,
    opts?: { lastEventId?: string; signal?: AbortSignal },
  ): AsyncIterable<RuntimeSseMessage>;
  /** Server snapshot from GET /work-tasks/{id}/snapshot. */
  getSnapshot(taskId: string, signal?: AbortSignal): Promise<WorkTaskSnapshot>;
}

export function createWorkTaskDomain(transport: RuntimeTransport): WorkTaskDomain {
  const domain: WorkTaskDomain = {
    list: (query, signal) =>
      transport.request<WorkTaskListResponse>({
        path: "/api/v1/work-tasks",
        query,
        signal,
      }),
    create: (body, signal) =>
      transport.request<WorkTaskResponse>({
        method: "POST",
        path: "/api/v1/work-tasks",
        body,
        signal,
      }),
    get: (taskId, signal) =>
      transport.request<WorkTaskResponse>({
        path: `/api/v1/work-tasks/${enc(taskId)}`,
        signal,
      }),
    patch: (taskId, body, signal) =>
      transport.request<WorkTaskResponse>({
        method: "PATCH",
        path: `/api/v1/work-tasks/${enc(taskId)}`,
        body,
        signal,
      }),
    delete: async (taskId, signal) => {
      await transport.request({
        method: "DELETE",
        path: `/api/v1/work-tasks/${enc(taskId)}`,
        signal,
        parseJson: false,
      });
    },
    assign: (taskId, body, signal) =>
      transport.request<WorkTaskResponse>({
        method: "POST",
        path: `/api/v1/work-tasks/${enc(taskId)}/assign`,
        body,
        signal,
      }),
    start: (taskId, signal) =>
      transport.request<TaskStartResult>({
        method: "POST",
        path: `/api/v1/work-tasks/${enc(taskId)}/start`,
        body: {},
        signal,
      }),
    cancel: (taskId, signal) =>
      transport.request<WorkTaskResponse>({
        method: "POST",
        path: `/api/v1/work-tasks/${enc(taskId)}/cancel`,
        body: {},
        signal,
      }),
    retry: (taskId, signal) =>
      transport.request<TaskStartResult>({
        method: "POST",
        path: `/api/v1/work-tasks/${enc(taskId)}/retry`,
        body: {},
        signal,
      }),
    listRuns: (taskId, signal) =>
      transport.request<TaskRunResponse[]>({
        path: `/api/v1/work-tasks/${enc(taskId)}/runs`,
        signal,
      }),
    listEvents: (taskId, query, signal) =>
      transport.request<TaskEventResponse[]>({
        path: `/api/v1/work-tasks/${enc(taskId)}/events`,
        query,
        signal,
      }),
    listApprovals: (taskId, signal) =>
      transport.request<TaskApprovalResponse[]>({
        path: `/api/v1/work-tasks/${enc(taskId)}/approvals`,
        signal,
      }),
    approve: (taskId, approvalId, signal) =>
      transport.request<TaskApprovalResponse>({
        method: "POST",
        path: `/api/v1/work-tasks/${enc(taskId)}/approvals/${enc(approvalId)}/approve`,
        body: {},
        signal,
      }),
    reject: (taskId, approvalId, signal) =>
      transport.request<TaskApprovalResponse>({
        method: "POST",
        path: `/api/v1/work-tasks/${enc(taskId)}/approvals/${enc(approvalId)}/reject`,
        body: {},
        signal,
      }),
    listArtifacts: (taskId, signal) =>
      transport.request<TaskArtifactResponse[]>({
        path: `/api/v1/work-tasks/${enc(taskId)}/artifacts`,
        signal,
      }),
    getArtifact: (taskId, artifactId, signal) =>
      transport.request<TaskArtifactResponse>({
        path: `/api/v1/work-tasks/${enc(taskId)}/artifacts/${enc(artifactId)}`,
        signal,
      }),
    openArtifact: (taskId, artifactId, signal) =>
      transport.request<TaskArtifactOpenResult>({
        method: "POST",
        path: `/api/v1/work-tasks/${enc(taskId)}/artifacts/${enc(artifactId)}/open`,
        body: {},
        signal,
      }),
    streamEvents: (taskId, opts) =>
      transport.stream({
        path: `/api/v1/work-tasks/${enc(taskId)}/events/stream`,
        lastEventId: opts?.lastEventId,
        signal: opts?.signal,
      }),
    getSnapshot: (taskId, signal) =>
      transport.request<WorkTaskSnapshot>({
        path: `/api/v1/work-tasks/${enc(taskId)}/snapshot`,
        signal,
      }),
  };
  return domain;
}

/** @deprecated Prefer createWorkTaskDomain — alias kept for RuntimeClient.tasks */
export const createTaskDomain = createWorkTaskDomain;
export type TaskDomain = WorkTaskDomain;
