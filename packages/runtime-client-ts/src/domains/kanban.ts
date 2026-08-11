import type { components } from "../generated/schema";
import type { RuntimeTransport } from "../transport/types";

function enc(id: string): string {
  return encodeURIComponent(id);
}

export type KanbanCapabilities = components["schemas"]["KanbanCapabilities"];
export type KanbanBoard = components["schemas"]["KanbanBoard"];
export type KanbanBoardListResponse = components["schemas"]["KanbanBoardListResponse"];
export type CreateKanbanBoardInput = components["schemas"]["CreateKanbanBoardInput"];
export type KanbanTask = components["schemas"]["KanbanTask"];
export type KanbanTaskListResponse = components["schemas"]["KanbanTaskListResponse"];
export type CreateKanbanTaskInput = components["schemas"]["CreateKanbanTaskInput"];
export type KanbanTaskDetail = components["schemas"]["KanbanTaskDetail"];
export type KanbanTaskActionInput = components["schemas"]["KanbanTaskActionInput"];
export type KanbanComment = components["schemas"]["KanbanComment"];
export type KanbanCommentCreate = components["schemas"]["KanbanCommentCreate"];
export type KanbanEvent = components["schemas"]["KanbanEvent"];
export type KanbanRun = components["schemas"]["KanbanRun"];
export type KanbanAssignee = components["schemas"]["KanbanAssignee"];
export type KanbanAssigneeListResponse = components["schemas"]["KanbanAssigneeListResponse"];
export type KanbanDispatchRequest = components["schemas"]["KanbanDispatchRequest"];
export type KanbanDispatchResult = components["schemas"]["KanbanDispatchResult"];

export interface KanbanTaskFilter {
  status?: string;
  assignee?: string;
  tenant?: string;
  includeArchived?: boolean;
}

export interface KanbanDomain {
  getCapabilities(instanceId: string, signal?: AbortSignal): Promise<KanbanCapabilities>;
  listBoards(
    instanceId: string,
    opts?: { includeArchived?: boolean },
    signal?: AbortSignal,
  ): Promise<KanbanBoardListResponse>;
  createBoard(
    instanceId: string,
    body: CreateKanbanBoardInput,
    signal?: AbortSignal,
  ): Promise<KanbanBoard>;
  removeBoard(instanceId: string, boardSlug: string, signal?: AbortSignal): Promise<void>;
  listTasks(
    instanceId: string,
    boardSlug: string,
    filter?: KanbanTaskFilter,
    signal?: AbortSignal,
  ): Promise<KanbanTaskListResponse>;
  getTask(
    instanceId: string,
    boardSlug: string,
    taskId: string,
    signal?: AbortSignal,
  ): Promise<KanbanTaskDetail>;
  createTask(
    instanceId: string,
    boardSlug: string,
    body: CreateKanbanTaskInput,
    signal?: AbortSignal,
  ): Promise<KanbanTask>;
  executeTaskAction(
    instanceId: string,
    boardSlug: string,
    taskId: string,
    body: KanbanTaskActionInput,
    signal?: AbortSignal,
  ): Promise<KanbanTask>;
  addComment(
    instanceId: string,
    boardSlug: string,
    taskId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<void>;
  listAssignees(
    instanceId: string,
    boardSlug: string,
    signal?: AbortSignal,
  ): Promise<KanbanAssigneeListResponse>;
  dispatch(
    instanceId: string,
    boardSlug: string,
    body?: KanbanDispatchRequest,
    signal?: AbortSignal,
  ): Promise<KanbanDispatchResult>;
}

export function createKanbanDomain(transport: RuntimeTransport): KanbanDomain {
  const base = (instanceId: string) => `/api/v1/instances/${enc(instanceId)}/kanban`;

  return {
    getCapabilities: (instanceId, signal) =>
      transport.request<KanbanCapabilities>({
        path: `${base(instanceId)}/capabilities`,
        signal,
      }),
    listBoards: (instanceId, opts, signal) =>
      transport.request<KanbanBoardListResponse>({
        path: `${base(instanceId)}/boards`,
        query: opts?.includeArchived ? { includeArchived: "true" } : undefined,
        signal,
      }),
    createBoard: (instanceId, body, signal) =>
      transport.request<KanbanBoard>({
        method: "POST",
        path: `${base(instanceId)}/boards`,
        body,
        signal,
      }),
    removeBoard: async (instanceId, boardSlug, signal) => {
      await transport.request({
        method: "DELETE",
        path: `${base(instanceId)}/boards/${enc(boardSlug)}`,
        signal,
        parseJson: false,
      });
    },
    listTasks: (instanceId, boardSlug, filter, signal) =>
      transport.request<KanbanTaskListResponse>({
        path: `${base(instanceId)}/boards/${enc(boardSlug)}/tasks`,
        query: {
          status: filter?.status,
          assignee: filter?.assignee,
          tenant: filter?.tenant,
          includeArchived: filter?.includeArchived ? "true" : undefined,
        },
        signal,
      }),
    getTask: (instanceId, boardSlug, taskId, signal) =>
      transport.request<KanbanTaskDetail>({
        path: `${base(instanceId)}/boards/${enc(boardSlug)}/tasks/${enc(taskId)}`,
        signal,
      }),
    createTask: (instanceId, boardSlug, body, signal) =>
      transport.request<KanbanTask>({
        method: "POST",
        path: `${base(instanceId)}/boards/${enc(boardSlug)}/tasks`,
        body,
        signal,
      }),
    executeTaskAction: (instanceId, boardSlug, taskId, body, signal) =>
      transport.request<KanbanTask>({
        method: "POST",
        path: `${base(instanceId)}/boards/${enc(boardSlug)}/tasks/${enc(taskId)}/actions`,
        body,
        signal,
      }),
    addComment: async (instanceId, boardSlug, taskId, text, signal) => {
      await transport.request({
        method: "POST",
        path: `${base(instanceId)}/boards/${enc(boardSlug)}/tasks/${enc(taskId)}/comments`,
        body: { text },
        signal,
        parseJson: false,
      });
    },
    listAssignees: (instanceId, boardSlug, signal) =>
      transport.request<KanbanAssigneeListResponse>({
        path: `${base(instanceId)}/boards/${enc(boardSlug)}/assignees`,
        signal,
      }),
    dispatch: (instanceId, boardSlug, body, signal) =>
      transport.request<KanbanDispatchResult>({
        method: "POST",
        path: `${base(instanceId)}/boards/${enc(boardSlug)}/dispatch`,
        body: body ?? { dryRun: false },
        signal,
      }),
  };
}
