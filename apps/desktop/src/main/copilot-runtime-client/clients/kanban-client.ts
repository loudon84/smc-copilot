import { getSmcRuntimeClient } from "../smc-runtime-client";
import type {
  CreateKanbanBoardInput,
  CreateKanbanTaskInput,
  KanbanDispatchRequest,
  KanbanTaskActionInput,
  KanbanTaskFilter,
} from "@smc/runtime-client";

function kanban() {
  return getSmcRuntimeClient().kanban;
}

export const kanbanClient = {
  getCapabilities: (instanceId: string, signal?: AbortSignal) =>
    kanban().getCapabilities(instanceId, signal),
  listBoards: (
    instanceId: string,
    opts?: { includeArchived?: boolean },
    signal?: AbortSignal,
  ) => kanban().listBoards(instanceId, opts, signal),
  createBoard: (
    instanceId: string,
    body: CreateKanbanBoardInput,
    signal?: AbortSignal,
  ) => kanban().createBoard(instanceId, body, signal),
  removeBoard: (instanceId: string, boardSlug: string, signal?: AbortSignal) =>
    kanban().removeBoard(instanceId, boardSlug, signal),
  listTasks: (
    instanceId: string,
    boardSlug: string,
    filter?: KanbanTaskFilter,
    signal?: AbortSignal,
  ) => kanban().listTasks(instanceId, boardSlug, filter, signal),
  getTask: (
    instanceId: string,
    boardSlug: string,
    taskId: string,
    signal?: AbortSignal,
  ) => kanban().getTask(instanceId, boardSlug, taskId, signal),
  createTask: (
    instanceId: string,
    boardSlug: string,
    body: CreateKanbanTaskInput,
    signal?: AbortSignal,
  ) => kanban().createTask(instanceId, boardSlug, body, signal),
  executeTaskAction: (
    instanceId: string,
    boardSlug: string,
    taskId: string,
    body: KanbanTaskActionInput,
    signal?: AbortSignal,
  ) => kanban().executeTaskAction(instanceId, boardSlug, taskId, body, signal),
  addComment: (
    instanceId: string,
    boardSlug: string,
    taskId: string,
    text: string,
    signal?: AbortSignal,
  ) => kanban().addComment(instanceId, boardSlug, taskId, text, signal),
  listAssignees: (instanceId: string, boardSlug: string, signal?: AbortSignal) =>
    kanban().listAssignees(instanceId, boardSlug, signal),
  dispatch: (
    instanceId: string,
    boardSlug: string,
    body?: KanbanDispatchRequest,
    signal?: AbortSignal,
  ) => kanban().dispatch(instanceId, boardSlug, body, signal),
};
